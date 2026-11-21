-- Migration: 20261121000004_resume_exam.sql

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

  select user_id, question_ids, submitted_at, created_at
  into v_attempt_user_id, v_question_ids, v_submitted_at, v_created_at
  from public.exam_attempts
  where id = p_attempt_id;

  if not found then
    raise exception 'Exam attempt not found';
  end if;

  if v_attempt_user_id <> auth.uid() then
    raise exception 'Attempt does not belong to user';
  end if;

  if v_submitted_at is not null then
    raise exception 'Exam attempt already submitted';
  end if;

  -- 1200 seconds (20 minutes) minus elapsed seconds since creation (minimum 0)
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
    'seconds_remaining', v_seconds_remaining
  );
end;
$$;

revoke all on function public.resume_exam(uuid) from public, anon;
grant execute on function public.resume_exam(uuid) to authenticated;
