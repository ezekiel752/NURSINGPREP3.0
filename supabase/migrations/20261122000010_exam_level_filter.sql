-- Migration: 20261122000010_exam_level_filter.sql
-- Function: public.get_exam_questions(int)

create or replace function public.get_exam_questions(p_count int default 20)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_level int;
  v_is_active boolean;
  v_attempt_id uuid;
  v_question_ids uuid[];
  v_questions jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select level, is_active
  into v_level, v_is_active
  from public.profiles
  where id = auth.uid();

  if not found then
    raise exception 'Unauthorized';
  end if;

  if not v_is_active then
    raise exception 'Active membership required';
  end if;

  if v_level is null then
    raise exception 'Student level not set';
  end if;

  -- Cap p_count at 50, minimum 1
  v_count := least(greatest(coalesce(p_count, 20), 1), 50);

  -- Pick v_count random approved questions for the student's academic level
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
    select q.id, q.topic, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d
    from public.questions q
    join public.courses c on c.id = q.course_id
    join public.academic_levels al on al.id = c.level_id
    where q.status = 'approved'
      and al.code = v_level::text
    order by random()
    limit v_count
  ) q;

  -- If zero eligible questions: raise stable error before attempt row is created
  if coalesce(array_length(v_question_ids, 1), 0) = 0 then
    raise exception 'NO_QUESTIONS_FOR_LEVEL';
  end if;

  insert into public.exam_attempts (user_id, question_ids, total)
  values (auth.uid(), v_question_ids, coalesce(array_length(v_question_ids, 1), 0))
  returning id into v_attempt_id;

  return jsonb_build_object(
    'attempt_id', v_attempt_id,
    'questions', v_questions
  );
end;
$$;

revoke all on function public.get_exam_questions(int) from public, anon;
grant execute on function public.get_exam_questions(int) to authenticated;
