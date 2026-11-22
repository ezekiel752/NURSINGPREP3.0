-- Migration: 20261121000006_server_autosubmit.sql

-- 1. Add columns to public.exam_attempts
alter table public.exam_attempts
add column if not exists last_saved_at timestamptz;

alter table public.exam_attempts
add column if not exists recent_save_count int not null default 0;

alter table public.exam_attempts
add column if not exists auto_submitted boolean not null default false;

-- 2. Internal grade_attempt(p_attempt_id)
create or replace function public.grade_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_question_ids uuid[];
  v_submitted_at timestamptz;
  v_created_at timestamptz;
  v_total int;
  v_score int := 0;
  v_results jsonb := '[]'::jsonb;
  v_answers jsonb;
  v_qid uuid;
  v_q record;
  v_chosen text;
  v_is_correct boolean;
  v_late boolean := false;
  v_auto_submitted boolean := false;
begin
  select question_ids, answers, submitted_at, created_at, late, auto_submitted
  into v_question_ids, v_answers, v_submitted_at, v_created_at, v_late, v_auto_submitted
  from public.exam_attempts
  where id = p_attempt_id
  for update;

  if not found then
    raise exception 'Exam attempt not found';
  end if;

  if v_submitted_at is not null then
    raise exception 'Exam attempt already submitted';
  end if;

  -- Late check: now() > created_at + interval '1200 seconds' + interval '60 seconds'
  if v_late or (now() > v_created_at + interval '1200 seconds' + interval '60 seconds') then
    v_late := true;
  end if;

  v_answers := coalesce(v_answers, '{}'::jsonb);
  v_total := coalesce(array_length(v_question_ids, 1), 0);

  if v_total > 0 then
    for i in 1 .. v_total loop
      v_qid := v_question_ids[i];
      select id, correct_answer, explanation
      into v_q
      from public.questions
      where id = v_qid;

      if found then
        v_chosen := v_answers ->> v_qid::text;
        v_is_correct := (v_chosen is not null and upper(trim(v_chosen)) = upper(trim(v_q.correct_answer)));
        if v_is_correct then
          v_score := v_score + 1;
        end if;

        v_results := v_results || jsonb_build_array(
          jsonb_build_object(
            'id', v_q.id,
            'chosen', v_chosen,
            'correct_answer', v_q.correct_answer,
            'explanation', v_q.explanation
          )
        );
      end if;
    end loop;
  end if;

  update public.exam_attempts
  set score = v_score,
      total = v_total,
      submitted_at = now(),
      late = v_late
  where id = p_attempt_id;

  return jsonb_build_object(
    'score', v_score,
    'total', v_total,
    'results', v_results,
    'late', v_late,
    'auto_submitted', v_auto_submitted
  );
end;
$$;

revoke all on function public.grade_attempt(uuid) from public, anon, authenticated;

-- 3. save_answers(p_attempt_id uuid, p_changes jsonb)
create or replace function public.save_answers(p_attempt_id uuid, p_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt_user_id uuid;
  v_question_ids uuid[];
  v_submitted_at timestamptz;
  v_created_at timestamptz;
  v_answers jsonb;
  v_last_saved_at timestamptz;
  v_recent_save_count int;
  v_key text;
  v_val text;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active = true
  ) then
    raise exception 'Active membership required';
  end if;

  select user_id, question_ids, submitted_at, created_at, answers, last_saved_at, recent_save_count
  into v_attempt_user_id, v_question_ids, v_submitted_at, v_created_at, v_answers, v_last_saved_at, v_recent_save_count
  from public.exam_attempts
  where id = p_attempt_id
  for update;

  if not found then
    raise exception 'Exam attempt not found';
  end if;

  if v_attempt_user_id <> auth.uid() then
    raise exception 'Attempt does not belong to user';
  end if;

  if v_submitted_at is not null then
    raise exception 'Exam attempt already submitted';
  end if;

  -- Deadline check: now() <= created_at + 1200s + 30s grace, else raise
  if now() > v_created_at + interval '1200 seconds' + interval '30 seconds' then
    raise exception 'Submission deadline passed';
  end if;

  -- Rate limit check: max 5 saves within 2 seconds
  if v_last_saved_at is not null and (now() - v_last_saved_at) <= interval '2 seconds' then
    if v_recent_save_count >= 5 then
      raise exception 'Rate limit exceeded: max 5 saves within 2 seconds';
    end if;
    v_recent_save_count := v_recent_save_count + 1;
  else
    v_last_saved_at := now();
    v_recent_save_count := 1;
  end if;

  v_answers := coalesce(v_answers, '{}'::jsonb);

  -- Merge ONLY keys in attempt and values a..d
  if p_changes is not null and jsonb_typeof(p_changes) = 'object' then
    for v_key, v_val in select * from jsonb_each_text(p_changes) loop
      if v_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        if (v_key::uuid = any(v_question_ids)) and (lower(trim(v_val)) in ('a', 'b', 'c', 'd')) then
          v_answers := jsonb_set(v_answers, array[v_key], to_jsonb(v_val));
        end if;
      end if;
    end loop;
  end if;

  update public.exam_attempts
  set answers = v_answers,
      last_saved_at = v_last_saved_at,
      recent_save_count = v_recent_save_count
  where id = p_attempt_id;

  return jsonb_build_object(
    'success', true,
    'answers', v_answers
  );
end;
$$;

revoke all on function public.save_answers(uuid, jsonb) from public, anon;
grant execute on function public.save_answers(uuid, jsonb) to authenticated;

-- 4. submit_exam(p_attempt_id uuid, p_answers jsonb)
create or replace function public.submit_exam(p_attempt_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt_user_id uuid;
  v_question_ids uuid[];
  v_submitted_at timestamptz;
  v_created_at timestamptz;
  v_saved_answers jsonb;
  v_merged_answers jsonb;
  v_key text;
  v_val text;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active = true
  ) then
    raise exception 'Active membership required';
  end if;

  select user_id, question_ids, submitted_at, created_at, answers
  into v_attempt_user_id, v_question_ids, v_submitted_at, v_created_at, v_saved_answers
  from public.exam_attempts
  where id = p_attempt_id
  for update;

  if not found then
    raise exception 'Exam attempt not found';
  end if;

  if v_attempt_user_id <> auth.uid() then
    raise exception 'Attempt does not belong to user';
  end if;

  if v_submitted_at is not null then
    raise exception 'Exam attempt already submitted';
  end if;

  -- Within grace period (now() <= created_at + 1200s + 30s): merge p_answers into answers
  if now() <= v_created_at + interval '1200 seconds' + interval '30 seconds' then
    v_merged_answers := coalesce(v_saved_answers, '{}'::jsonb);
    if p_answers is not null and jsonb_typeof(p_answers) = 'object' then
      for v_key, v_val in select * from jsonb_each_text(p_answers) loop
        if v_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          if (v_key::uuid = any(v_question_ids)) and (lower(trim(v_val)) in ('a', 'b', 'c', 'd')) then
            v_merged_answers := jsonb_set(v_merged_answers, array[v_key], to_jsonb(v_val));
          end if;
        end if;
      end loop;
    end if;

    update public.exam_attempts
    set answers = v_merged_answers
    where id = p_attempt_id;
  end if;
  -- If beyond grace period, p_answers is ignored and only saved answers are graded

  return public.grade_attempt(p_attempt_id);
end;
$$;

revoke all on function public.submit_exam(uuid, jsonb) from public, anon;
grant execute on function public.submit_exam(uuid, jsonb) to authenticated;

-- 5. finalize_expired_attempts()
create or replace function public.finalize_expired_attempts()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count int := 0;
begin
  for r in (
    select id
    from public.exam_attempts
    where submitted_at is null
      and created_at + interval '1200 seconds' + interval '30 seconds' < now()
    for update skip locked
  ) loop
    update public.exam_attempts
    set auto_submitted = true
    where id = r.id;

    perform public.grade_attempt(r.id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.finalize_expired_attempts() from public, anon, authenticated;

-- 6. get_attempt_result(p_attempt_id uuid)
create or replace function public.get_attempt_result(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt_user_id uuid;
  v_question_ids uuid[];
  v_submitted_at timestamptz;
  v_score int;
  v_total int;
  v_late boolean;
  v_auto_submitted boolean;
  v_answers jsonb;
  v_results jsonb := '[]'::jsonb;
  v_qid uuid;
  v_q record;
  v_chosen text;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active = true
  ) then
    raise exception 'Active membership required';
  end if;

  select user_id, question_ids, answers, submitted_at, score, total, late, auto_submitted
  into v_attempt_user_id, v_question_ids, v_answers, v_submitted_at, v_score, v_total, v_late, v_auto_submitted
  from public.exam_attempts
  where id = p_attempt_id;

  if not found then
    raise exception 'Exam attempt not found';
  end if;

  if v_attempt_user_id <> auth.uid() then
    raise exception 'Attempt does not belong to user';
  end if;

  if v_submitted_at is null then
    raise exception 'Exam attempt not yet submitted';
  end if;

  v_answers := coalesce(v_answers, '{}'::jsonb);
  v_total := coalesce(v_total, coalesce(array_length(v_question_ids, 1), 0));

  if v_total > 0 then
    for i in 1 .. v_total loop
      v_qid := v_question_ids[i];
      select id, correct_answer, explanation
      into v_q
      from public.questions
      where id = v_qid;

      if found then
        v_chosen := v_answers ->> v_qid::text;
        v_results := v_results || jsonb_build_array(
          jsonb_build_object(
            'id', v_q.id,
            'chosen', v_chosen,
            'correct_answer', v_q.correct_answer,
            'explanation', v_q.explanation
          )
        );
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'score', v_score,
    'total', v_total,
    'results', v_results,
    'late', coalesce(v_late, false),
    'auto_submitted', coalesce(v_auto_submitted, false)
  );
end;
$$;

revoke all on function public.get_attempt_result(uuid) from public, anon;
grant execute on function public.get_attempt_result(uuid) to authenticated;

-- 7. resume_exam(p_attempt_id uuid)
create or replace function public.resume_exam(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt_user_id uuid;
  v_question_ids uuid[];
  v_submitted_at timestamptz;
  v_created_at timestamptz;
  v_answers jsonb;
  v_total int;
  v_questions jsonb := '[]'::jsonb;
  v_qid uuid;
  v_q record;
  v_elapsed int;
  v_seconds_remaining int;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active = true
  ) then
    raise exception 'Active membership required';
  end if;

  select user_id, question_ids, submitted_at, created_at, answers
  into v_attempt_user_id, v_question_ids, v_submitted_at, v_created_at, v_answers
  from public.exam_attempts
  where id = p_attempt_id;

  if not found then
    raise exception 'Exam attempt not found';
  end if;

  if v_attempt_user_id <> auth.uid() then
    raise exception 'Attempt does not belong to user';
  end if;

  -- If already submitted, return submitted status with nothing sensitive
  if v_submitted_at is not null then
    return jsonb_build_object(
      'attempt_id', p_attempt_id,
      'status', 'submitted'
    );
  end if;

  -- If expired (now() > created_at + 1200s + 30s), finalize and return submitted status
  if now() > v_created_at + interval '1200 seconds' + interval '30 seconds' then
    update public.exam_attempts
    set auto_submitted = true
    where id = p_attempt_id and submitted_at is null;

    perform public.grade_attempt(p_attempt_id);

    return jsonb_build_object(
      'attempt_id', p_attempt_id,
      'status', 'submitted'
    );
  end if;

  -- In-progress active exam: return questions, remaining time, and saved answers
  v_elapsed := floor(extract(epoch from (now() - v_created_at)))::int;
  v_seconds_remaining := greatest(1200 - v_elapsed, 0);

  v_total := coalesce(array_length(v_question_ids, 1), 0);
  if v_total > 0 then
    for i in 1 .. v_total loop
      v_qid := v_question_ids[i];
      select id, topic, question_text, option_a, option_b, option_c, option_d
      into v_q
      from public.questions
      where id = v_qid;

      if found then
        v_questions := v_questions || jsonb_build_array(
          jsonb_build_object(
            'id', v_q.id,
            'topic', v_q.topic,
            'question_text', v_q.question_text,
            'option_a', v_q.option_a,
            'option_b', v_q.option_b,
            'option_c', v_q.option_c,
            'option_d', v_q.option_d
          )
        );
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'attempt_id', p_attempt_id,
    'questions', v_questions,
    'seconds_remaining', v_seconds_remaining,
    'answers', coalesce(v_answers, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.resume_exam(uuid) from public, anon;
grant execute on function public.resume_exam(uuid) to authenticated;

-- 8. pg_cron schedule
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'finalize_expired_attempts') then
    perform cron.unschedule('finalize_expired_attempts');
  end if;
end;
$$;

select cron.schedule(
  'finalize_expired_attempts',
  '* * * * *',
  'select public.finalize_expired_attempts()'
);
