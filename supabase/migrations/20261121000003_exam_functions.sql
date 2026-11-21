-- Migration: 20261121000003_exam_functions.sql

-- 1. Table public.exam_attempts
create table if not exists public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_ids uuid[] not null,
  answers jsonb,
  score int,
  total int,
  created_at timestamptz not null default now(),
  submitted_at timestamptz
);

alter table public.exam_attempts enable row level security;

revoke all on public.exam_attempts from anon, authenticated;
grant select on public.exam_attempts to authenticated;

drop policy if exists "Users can select own exam attempts" on public.exam_attempts;
create policy "Users can select own exam attempts"
  on public.exam_attempts
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- 2. Function public.get_exam_questions
create or replace function public.get_exam_questions(p_count int default 20)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_attempt_id uuid;
  v_question_ids uuid[];
  v_questions jsonb := '[]'::jsonb;
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

  -- Cap p_count at 50, minimum 1
  v_count := least(greatest(coalesce(p_count, 20), 1), 50);

  -- Pick v_count random rows from questions where status = 'approved'
  select
    coalesce(array_agg(q.id), '{}'),
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'topic', q.topic,
        'question_text', q.question_text,
        'option_a', q.option_a,
        'option_b', q.option_b,
        'option_c', q.option_c,
        'option_d', q.option_d
      )
    ), '[]'::jsonb)
  into v_question_ids, v_questions
  from (
    select id, topic, question_text, option_a, option_b, option_c, option_d
    from public.questions
    where status = 'approved'
    order by random()
    limit v_count
  ) q;

  insert into public.exam_attempts (user_id, question_ids, total)
  values (auth.uid(), v_question_ids, coalesce(array_length(v_question_ids, 1), 0))
  returning id into v_attempt_id;

  return jsonb_build_object(
    'attempt_id', v_attempt_id,
    'questions', v_questions
  );
end;
$$;

-- 3. Function public.submit_exam
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
  v_total int;
  v_score int := 0;
  v_results jsonb := '[]'::jsonb;
  v_answers jsonb := coalesce(p_answers, '{}'::jsonb);
  v_qid uuid;
  v_q record;
  v_chosen text;
  v_is_correct boolean;
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

  select user_id, question_ids, submitted_at, total
  into v_attempt_user_id, v_question_ids, v_submitted_at, v_total
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

  v_total := coalesce(array_length(v_question_ids, 1), 0);

  if v_total > 0 then
    for i in 1 .. v_total loop
      v_qid := v_question_ids[i];
      select id, correct_answer, explanation
      into v_q
      from public.questions
      where id = v_qid;

      if found then
        -- p_answers is { "<question_id>": "a".."d" }; ignore ids not in the attempt
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
  set answers = v_answers,
      score = v_score,
      total = v_total,
      submitted_at = now()
  where id = p_attempt_id;

  return jsonb_build_object(
    'score', v_score,
    'total', v_total,
    'results', v_results
  );
end;
$$;

-- 4. Grants & Revokes
revoke all on function public.get_exam_questions(int) from public, anon;
grant execute on function public.get_exam_questions(int) to authenticated;

revoke all on function public.submit_exam(uuid, jsonb) from public, anon;
grant execute on function public.submit_exam(uuid, jsonb) to authenticated;
