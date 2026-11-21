-- Migration: 20261121000005_exam_late_flag.sql

-- 1. Add column exam_attempts.late
alter table public.exam_attempts
add column if not exists late boolean not null default false;

-- 2. Update submit_exam to flag late submissions
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
  v_total int;
  v_score int := 0;
  v_results jsonb := '[]'::jsonb;
  v_answers jsonb := coalesce(p_answers, '{}'::jsonb);
  v_qid uuid;
  v_q record;
  v_chosen text;
  v_is_correct boolean;
  v_late boolean := false;
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

  select user_id, question_ids, submitted_at, total, created_at
  into v_attempt_user_id, v_question_ids, v_submitted_at, v_total, v_created_at
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

  -- Late check: now() > created_at + interval '1200 seconds' + interval '60 seconds'
  if now() > v_created_at + interval '1200 seconds' + interval '60 seconds' then
    v_late := true;
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
      submitted_at = now(),
      late = v_late
  where id = p_attempt_id;

  return jsonb_build_object(
    'score', v_score,
    'total', v_total,
    'results', v_results,
    'late', v_late
  );
end;
$$;

revoke all on function public.submit_exam(uuid, jsonb) from public, anon;
grant execute on function public.submit_exam(uuid, jsonb) to authenticated;
