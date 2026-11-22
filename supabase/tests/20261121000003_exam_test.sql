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
  v_res jsonb;
  v_result_row record;
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
  -- CHECK 1: inactive student gets an error on get_exam_questions & submit_exam & save_answers
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

  v_error_caught := false;
  begin
    perform public.save_answers('00000000-0000-0000-0000-000000000000', '{}'::jsonb);
  exception when others then
    v_error_caught := true;
  end;
  if not v_error_caught then
    raise exception 'FAIL: inactive student was able to call save_answers';
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

  -- Double submit fails
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
  -- CHECK 6: anon cannot execute anything new or old
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

  v_error_caught := false;
  begin
    perform public.save_answers('55555555-5555-5555-5555-555555555555', '{}'::jsonb);
  exception when others then
    v_error_caught := true;
  end;
  if not v_error_caught then
    raise exception 'FAIL: anon was able to execute save_answers';
  end if;

  v_error_caught := false;
  begin
    perform public.get_attempt_result('55555555-5555-5555-5555-555555555555');
  exception when others then
    v_error_caught := true;
  end;
  if not v_error_caught then
    raise exception 'FAIL: anon was able to execute get_attempt_result';
  end if;

  v_error_caught := false;
  begin
    perform public.finalize_expired_attempts();
  exception when others then
    v_error_caught := true;
  end;
  if not v_error_caught then
    raise exception 'FAIL: anon was able to execute finalize_expired_attempts';
  end if;

  v_error_caught := false;
  begin
    perform public.grade_attempt('55555555-5555-5555-5555-555555555555');
  exception when others then
    v_error_caught := true;
  end;
  if not v_error_caught then
    raise exception 'FAIL: anon was able to execute grade_attempt';
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
  -- CHECK 8: submitted attempt returns status = 'submitted' on resume_exam without sensitive data
  ----------------------------------------------------------------------
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';

  v_exam_res := public.resume_exam('55555555-5555-5555-5555-555555555555');
  if (v_exam_res ->> 'status') <> 'submitted' then
    raise exception 'FAIL: resume_exam on submitted attempt did not return status = submitted';
  end if;
  if v_exam_res ? 'questions' or v_exam_res ? 'answers' then
    raise exception 'FAIL: resume_exam on submitted attempt leaked sensitive data';
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

  ----------------------------------------------------------------------
  -- CHECK 10: Late flag check (on-time late=false, backdated > 21 min late=true)
  ----------------------------------------------------------------------
  if (v_submit_res ->> 'late')::boolean is not false then
    raise exception 'FAIL: on-time submit expected late=false but got %', (v_submit_res ->> 'late');
  end if;

  reset role;
  insert into public.exam_attempts (id, user_id, question_ids, total, created_at, answers)
  values (
    '66666666-6666-6666-6666-666666666666',
    v_student1_id,
    array[v_q1_id, v_q2_id],
    2,
    now() - interval '22 minutes',
    jsonb_build_object(v_q1_id::text, 'a')
  )
  on conflict (id) do update set answers = excluded.answers;

  set local role authenticated;
  set local "request.jwt.claims" = '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';

  v_submit_res := public.submit_exam(
    '66666666-6666-6666-6666-666666666666',
    jsonb_build_object(v_q1_id::text, 'a')
  );

  if (v_submit_res ->> 'late')::boolean is not true then
    raise exception 'FAIL: backdated attempt (>21 min) expected late=true but got %', (v_submit_res ->> 'late');
  end if;

  if (v_submit_res ->> 'score')::int <> 1 then
    raise exception 'FAIL: backdated attempt was not properly graded, expected score 1 but got %', (v_submit_res ->> 'score');
  end if;

  ----------------------------------------------------------------------
  -- CHECK 11: save_answers rejects another user''s attempt
  ----------------------------------------------------------------------
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub": "44444444-4444-4444-4444-444444444444", "role": "authenticated"}';

  v_error_caught := false;
  begin
    perform public.save_answers(v_attempt_id, jsonb_build_object(v_q1_id::text, 'a'));
  exception when others then
    v_error_caught := true;
  end;
  if not v_error_caught then
    raise exception 'FAIL: student 2 was able to save answers on student 1 attempt';
  end if;

  ----------------------------------------------------------------------
  -- CHECK 12: save_answers rejects after the deadline
  ----------------------------------------------------------------------
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';

  -- Create attempt 77777777 backdated 25 minutes
  reset role;
  insert into public.exam_attempts (id, user_id, question_ids, total, created_at, answers)
  values (
    '77777777-7777-7777-7777-777777777777',
    v_student1_id,
    array[v_q1_id, v_q2_id],
    2,
    now() - interval '25 minutes',
    jsonb_build_object(v_q1_id::text, 'a')
  )
  on conflict (id) do nothing;

  set local role authenticated;
  set local "request.jwt.claims" = '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';

  v_error_caught := false;
  begin
    perform public.save_answers('77777777-7777-7777-7777-777777777777', jsonb_build_object(v_q2_id::text, 'b'));
  exception when others then
    v_error_caught := true;
  end;
  if not v_error_caught then
    raise exception 'FAIL: save_answers succeeded on expired attempt beyond deadline';
  end if;

  ----------------------------------------------------------------------
  -- CHECK 13: submit after deadline ignores new answers and grades saved answers
  ----------------------------------------------------------------------
  -- Attempt 77777777 has saved answers: q1='a' (correct, 1 pt).
  -- Call submit_exam with q1='c' (wrong) and q2='b' (correct).
  -- If new answers were accepted, score would be 1 (or if overwritten, 1). But q1 should remain 'a' and q2 omitted, score 1.
  -- Let's test with new answers providing only wrong answers: q1='c', q2='c'. If merged, score would be 0.
  v_submit_res := public.submit_exam(
    '77777777-7777-7777-7777-777777777777',
    jsonb_build_object(v_q1_id::text, 'c', v_q2_id::text, 'c')
  );

  -- Since it is past deadline, new answers {q1: 'c', q2: 'c'} must be IGNORED!
  -- Only saved answers {q1: 'a'} are graded -> score must be 1.
  if (v_submit_res ->> 'score')::int <> 1 then
    raise exception 'FAIL: submit after deadline did not ignore new answers, expected score 1 but got %', (v_submit_res ->> 'score');
  end if;

  ----------------------------------------------------------------------
  -- CHECK 14: finalize_expired_attempts finalises only expired attempts, grades saved answers, sets auto_submitted
  ----------------------------------------------------------------------
  reset role;
  -- Expired attempt 99999999: backdated 30 minutes, saved answers q1='a', q2='b' (both correct -> score 2)
  insert into public.exam_attempts (id, user_id, question_ids, total, created_at, answers)
  values (
    '99999999-9999-9999-9999-999999999999',
    v_student1_id,
    array[v_q1_id, v_q2_id],
    2,
    now() - interval '30 minutes',
    jsonb_build_object(v_q1_id::text, 'a', v_q2_id::text, 'b')
  )
  on conflict (id) do nothing;

  -- Active attempt 88888888: created now, should NOT be finalized
  insert into public.exam_attempts (id, user_id, question_ids, total, created_at, answers)
  values (
    '88888888-8888-8888-8888-888888888888',
    v_student1_id,
    array[v_q1_id, v_q2_id],
    2,
    now(),
    jsonb_build_object(v_q1_id::text, 'a')
  )
  on conflict (id) do nothing;

  -- Run finalize_expired_attempts() as internal/security definer
  perform public.finalize_expired_attempts();

  -- Check attempt 99999999: must be submitted, auto_submitted=true, score=2
  select submitted_at, auto_submitted, score, total
  into v_result_row
  from public.exam_attempts
  where id = '99999999-9999-9999-9999-999999999999';

  if v_result_row.submitted_at is null then
    raise exception 'FAIL: expired attempt 99999999 was not finalized';
  end if;
  if v_result_row.auto_submitted is not true then
    raise exception 'FAIL: expired attempt 99999999 auto_submitted is not true';
  end if;
  if v_result_row.score <> 2 then
    raise exception 'FAIL: expired attempt 99999999 score expected 2 but got %', v_result_row.score;
  end if;

  -- Check attempt 88888888: must NOT be finalized
  select submitted_at, auto_submitted
  into v_result_row
  from public.exam_attempts
  where id = '88888888-8888-8888-8888-888888888888';

  if v_result_row.submitted_at is not null then
    raise exception 'FAIL: active attempt 88888888 was finalized prematurely';
  end if;
  if v_result_row.auto_submitted is true then
    raise exception 'FAIL: active attempt 88888888 has auto_submitted = true';
  end if;

  ----------------------------------------------------------------------
  -- CHECK 15: get_attempt_result refuses another user''s attempt and returns same shape for owner
  ----------------------------------------------------------------------
  -- Student 2 cannot call get_attempt_result on student 1's attempt 99999999
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub": "44444444-4444-4444-4444-444444444444", "role": "authenticated"}';

  v_error_caught := false;
  begin
    perform public.get_attempt_result('99999999-9999-9999-9999-999999999999');
  exception when others then
    v_error_caught := true;
  end;
  if not v_error_caught then
    raise exception 'FAIL: student 2 was able to call get_attempt_result on student 1 attempt';
  end if;

  -- Student 1 calls get_attempt_result on attempt 99999999
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';

  v_res := public.get_attempt_result('99999999-9999-9999-9999-999999999999');
  if (v_res ->> 'score')::int <> 2 then
    raise exception 'FAIL: get_attempt_result score expected 2 but got %', (v_res ->> 'score');
  end if;
  if (v_res ->> 'total')::int <> 2 then
    raise exception 'FAIL: get_attempt_result total expected 2 but got %', (v_res ->> 'total');
  end if;
  if not (v_res ? 'results') or jsonb_array_length(v_res -> 'results') <> 2 then
    raise exception 'FAIL: get_attempt_result missing or incomplete results array';
  end if;
  if (v_res ->> 'auto_submitted')::boolean is not true then
    raise exception 'FAIL: get_attempt_result auto_submitted expected true';
  end if;

  ----------------------------------------------------------------------
  -- CHECK 16: authenticated user cannot execute internal grade_attempt or finalize_expired_attempts
  ----------------------------------------------------------------------
  v_error_caught := false;
  begin
    perform public.grade_attempt('88888888-8888-8888-8888-888888888888');
  exception when others then
    v_error_caught := true;
  end;
  if not v_error_caught then
    raise exception 'FAIL: authenticated was able to execute internal grade_attempt';
  end if;

  v_error_caught := false;
  begin
    perform public.finalize_expired_attempts();
  exception when others then
    v_error_caught := true;
  end;
  if not v_error_caught then
    raise exception 'FAIL: authenticated was able to execute finalize_expired_attempts';
  end if;

  raise notice 'ALL 16 EXAM FUNCTION CHECKS PASSED';
end;
$$;
