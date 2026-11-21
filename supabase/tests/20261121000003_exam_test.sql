do $$
declare
  v_student1_id uuid := '33333333-3333-3333-3333-333333333333';
  v_student2_id uuid := '44444444-4444-4444-4444-444444444444';
  v_level_id uuid;
  v_course_id uuid;
  v_q1_id uuid;
  v_q2_id uuid;
  v_q3_id uuid;
  v_exam_res jsonb;
  v_attempt_id uuid;
  v_questions jsonb;
  v_q jsonb;
  v_submit_res jsonb;
  v_error_caught boolean;
  v_score int;
  v_total int;
begin
  -- Setup test users in auth.users
  insert into auth.users (id, email)
  values
    (v_student1_id, 'active_student@example.com'),
    (v_student2_id, 'inactive_student@example.com')
  on conflict (id) do nothing;

  -- Setup profiles: student 1 active, student 2 inactive
  insert into public.profiles (id, full_name, level, is_active)
  values
    (v_student1_id, 'Active Student', 200, true),
    (v_student2_id, 'Inactive Student', 200, false)
  on conflict (id) do update set is_active = excluded.is_active;

  -- Setup academic level and course for test questions
  insert into public.academic_levels (id, name, code)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test Level 200', 'TL200')
  on conflict (code) do update set name = excluded.name
  returning id into v_level_id;

  if v_level_id is null then
    select id into v_level_id from public.academic_levels where code = 'TL200';
  end if;

  insert into public.courses (id, level_id, title, code)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', v_level_id, 'Test Nursing Foundations', 'TNF101')
  on conflict (level_id, code) do update set title = excluded.title
  returning id into v_course_id;

  if v_course_id is null then
    select id into v_course_id from public.courses where level_id = v_level_id and code = 'TNF101';
  end if;

  -- Setup known approved questions
  v_q1_id := '11111111-0000-0000-0000-000000000001';
  v_q2_id := '11111111-0000-0000-0000-000000000002';
  v_q3_id := '11111111-0000-0000-0000-000000000003';

  insert into public.questions (id, course_id, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation, difficulty, topic, status)
  values
    (v_q1_id, v_course_id, 'What is the normal adult resting heart rate?', '60-100 bpm', '40-60 bpm', '100-120 bpm', '120-140 bpm', 'A', 'Normal resting heart rate for adults ranges from 60 to 100 beats per minute.', 'easy', 'Vital Signs', 'approved'),
    (v_q2_id, v_course_id, 'Which organ produces insulin?', 'Liver', 'Pancreas', 'Kidney', 'Spleen', 'B', 'The pancreas secretes insulin from beta cells.', 'easy', 'Endocrine', 'approved'),
    (v_q3_id, v_course_id, 'Which blood type is the universal donor?', 'A positive', 'B negative', 'AB positive', 'O negative', 'D', 'O negative red blood cells can be transfused to any blood type.', 'medium', 'Hematology', 'approved')
  on conflict (id) do update set
    status = 'approved',
    correct_answer = excluded.correct_answer;

  ----------------------------------------------------------------------
  -- CHECK 1: inactive student gets an error on get_exam_questions & submit_exam
  ----------------------------------------------------------------------
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub": "44444444-4444-4444-4444-444444444444", "role": "authenticated"}';

  v_error_caught := false;
  begin
    perform public.get_exam_questions(10);
  exception when others then
    v_error_caught := true;
  end;
  if not v_error_caught then
    raise exception 'FAIL: inactive student was able to call get_exam_questions';
  end if;

  v_error_caught := false;
  begin
    perform public.submit_exam('00000000-0000-0000-0000-000000000000', '{}'::jsonb);
  exception when others then
    v_error_caught := true;
  end;
  if not v_error_caught then
    raise exception 'FAIL: inactive student was able to call submit_exam';
  end if;

  ----------------------------------------------------------------------
  -- CHECK 2: active student gets questions with no correct_answer or explanation key
  ----------------------------------------------------------------------
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';

  v_exam_res := public.get_exam_questions(3);
  v_attempt_id := (v_exam_res ->> 'attempt_id')::uuid;
  v_questions := v_exam_res -> 'questions';

  if v_attempt_id is null then
    raise exception 'FAIL: get_exam_questions did not return attempt_id';
  end if;

  if jsonb_array_length(v_questions) = 0 then
    raise exception 'FAIL: get_exam_questions returned no questions';
  end if;

  for i in 0 .. jsonb_array_length(v_questions) - 1 loop
    v_q := v_questions -> i;
    if v_q ? 'correct_answer' then
      raise exception 'FAIL: questions contained correct_answer key!';
    end if;
    if v_q ? 'explanation' then
      raise exception 'FAIL: questions contained explanation key!';
    end if;
    if not (v_q ? 'question_text') or not (v_q ? 'option_a') or not (v_q ? 'option_d') then
      raise exception 'FAIL: questions missing required fields (question_text, options)';
    end if;
  end loop;

  ----------------------------------------------------------------------
  -- CHECK 3: cannot submit another user''s attempt
  ----------------------------------------------------------------------
  -- Temporarily activate student 2 to verify attempt ownership check
  reset role;
  update public.profiles set is_active = true where id = v_student2_id;

  set local role authenticated;
  set local "request.jwt.claims" = '{"sub": "44444444-4444-4444-4444-444444444444", "role": "authenticated"}';

  v_error_caught := false;
  begin
    perform public.submit_exam(v_attempt_id, '{}'::jsonb);
  exception when others then
    v_error_caught := true;
  end;
  if not v_error_caught then
    raise exception 'FAIL: student 2 was able to submit student 1 attempt';
  end if;

  ----------------------------------------------------------------------
  -- CHECK 4 & 5: score is correct for a known answer set & double submit fails
  ----------------------------------------------------------------------
  -- Create a dedicated attempt for student 1 with known questions: q1 (correct: A) and q2 (correct: B)
  reset role;
  insert into public.exam_attempts (id, user_id, question_ids, total)
  values ('55555555-5555-5555-5555-555555555555', v_student1_id, array[v_q1_id, v_q2_id], 2)
  on conflict (id) do nothing;

  set local role authenticated;
  set local "request.jwt.claims" = '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';

  -- Answer q1: 'a' (correct) and q2: 'c' (incorrect), plus an unrelated question id that should be ignored
  v_submit_res := public.submit_exam(
    '55555555-5555-5555-5555-555555555555',
    jsonb_build_object(
      v_q1_id::text, 'a',
      v_q2_id::text, 'c',
      '99999999-9999-9999-9999-999999999999', 'a'
    )
  );

  v_score := (v_submit_res ->> 'score')::int;
  v_total := (v_submit_res ->> 'total')::int;

  if v_score <> 1 then
    raise exception 'FAIL: expected score 1 but got %', v_score;
  end if;

  if v_total <> 2 then
    raise exception 'FAIL: expected total 2 but got %', v_total;
  end if;

  -- CHECK 4: Double submit fails
  v_error_caught := false;
  begin
    perform public.submit_exam('55555555-5555-5555-5555-555555555555', '{}'::jsonb);
  exception when others then
    v_error_caught := true;
  end;
  if not v_error_caught then
    raise exception 'FAIL: double submit succeeded but should have failed';
  end if;

  ----------------------------------------------------------------------
  -- CHECK 6: anon cannot execute
  ----------------------------------------------------------------------
  set local role anon;

  v_error_caught := false;
  begin
    perform public.get_exam_questions(10);
  exception when others then
    v_error_caught := true;
  end;
  if not v_error_caught then
    raise exception 'FAIL: anon was able to execute get_exam_questions';
  end if;

  v_error_caught := false;
  begin
    perform public.submit_exam('55555555-5555-5555-5555-555555555555', '{}'::jsonb);
  exception when others then
    v_error_caught := true;
  end;
  if not v_error_caught then
    raise exception 'FAIL: anon was able to execute submit_exam';
  end if;

  v_error_caught := false;
  begin
    perform public.resume_exam('55555555-5555-5555-5555-555555555555');
  exception when others then
    v_error_caught := true;
  end;
  if not v_error_caught then
    raise exception 'FAIL: anon was able to execute resume_exam';
  end if;

  ----------------------------------------------------------------------
  -- CHECK 7: other user''s attempt fails on resume_exam
  ----------------------------------------------------------------------
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub": "44444444-4444-4444-4444-444444444444", "role": "authenticated"}';

  v_error_caught := false;
  begin
    perform public.resume_exam(v_attempt_id);
  exception when others then
    v_error_caught := true;
  end;
  if not v_error_caught then
    raise exception 'FAIL: student 2 was able to resume student 1 attempt';
  end if;

  ----------------------------------------------------------------------
  -- CHECK 8: submitted attempt fails on resume_exam
  ----------------------------------------------------------------------
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';

  v_error_caught := false;
  begin
    perform public.resume_exam('55555555-5555-5555-5555-555555555555');
  exception when others then
    v_error_caught := true;
  end;
  if not v_error_caught then
    raise exception 'FAIL: was able to resume an already submitted attempt';
  end if;

  ----------------------------------------------------------------------
  -- CHECK 9: resume_exam returns questions with no answers leaking
  ----------------------------------------------------------------------
  v_exam_res := public.resume_exam(v_attempt_id);
  v_questions := v_exam_res -> 'questions';

  if (v_exam_res ->> 'seconds_remaining') is null then
    raise exception 'FAIL: resume_exam missing seconds_remaining';
  end if;

  if (v_exam_res ->> 'seconds_remaining')::int < 0 or (v_exam_res ->> 'seconds_remaining')::int > 1200 then
    raise exception 'FAIL: seconds_remaining out of expected range [0, 1200]';
  end if;

  if jsonb_array_length(v_questions) = 0 then
    raise exception 'FAIL: resume_exam returned empty questions';
  end if;

  for i in 0 .. jsonb_array_length(v_questions) - 1 loop
    v_q := v_questions -> i;
    if v_q ? 'correct_answer' then
      raise exception 'FAIL: resume_exam questions leaked correct_answer key!';
    end if;
    if v_q ? 'explanation' then
      raise exception 'FAIL: resume_exam questions leaked explanation key!';
    end if;
  end loop;

  raise notice 'ALL 9 EXAM FUNCTION CHECKS PASSED';
end;
$$;
