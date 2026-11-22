do $$
declare
  v_admin_id uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_student1_id uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_student2_id uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  v_student3_id uuid := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  v_overview jsonb;
  v_detail jsonb;
  v_count int;
  v_err_caught boolean;
begin
  -- 1. Setup fixture data
  insert into auth.users (id, email)
  values
    (v_admin_id, 'admin@test.local'),
    (v_student1_id, 'student1.active.200@test.local'),
    (v_student2_id, 'student2.pending.300@test.local'),
    (v_student3_id, 'other3.active.300@test.local')
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (v_admin_id, 'admin')
  on conflict do nothing;

  insert into public.profiles (id, full_name, university, level, is_active, created_at)
  values
    (v_admin_id, 'Admin User', 'Wellspring University', 400, true, now() - interval '10 days'),
    (v_student1_id, 'Student One', 'Wellspring University', 200, true, now() - interval '3 days'),
    (v_student2_id, 'Student Two', 'Wellspring University', 300, false, now() - interval '2 days'),
    (v_student3_id, 'Other Student', 'Wellspring University', 300, true, now() - interval '1 day')
  on conflict (id) do update
  set full_name = excluded.full_name,
      level = excluded.level,
      is_active = excluded.is_active;

  insert into public.payments (user_id, reference, amount_minor, currency, status, verified_at)
  values (v_student1_id, 'ref-admin-test-success', 250000, 'NGN', 'success', now() - interval '1 day')
  on conflict (reference) do nothing;

  insert into public.exam_attempts (id, user_id, question_ids, answers, score, total, submitted_at)
  values (
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    v_student1_id,
    '{}',
    '{}'::jsonb,
    40,
    50,
    now() - interval '2 hours'
  )
  on conflict (id) do nothing;

  -- =========================================================================
  -- CHECK 1: Anon cannot execute any of the three functions
  -- =========================================================================
  set local role anon;

  -- 1a. admin_overview
  v_err_caught := false;
  begin
    perform public.admin_overview();
  exception when insufficient_privilege then
    v_err_caught := true;
  end;
  if not v_err_caught then
    raise exception 'FAIL: anon was able to execute admin_overview';
  end if;

  -- 1b. admin_list_students
  v_err_caught := false;
  begin
    perform * from public.admin_list_students();
  exception when insufficient_privilege then
    v_err_caught := true;
  end;
  if not v_err_caught then
    raise exception 'FAIL: anon was able to execute admin_list_students';
  end if;

  -- 1c. admin_student_detail
  v_err_caught := false;
  begin
    perform public.admin_student_detail(v_student1_id);
  exception when insufficient_privilege then
    v_err_caught := true;
  end;
  if not v_err_caught then
    raise exception 'FAIL: anon was able to execute admin_student_detail';
  end if;

  -- =========================================================================
  -- CHECK 2: Authenticated non-admin gets forbidden on all three functions
  -- =========================================================================
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "role": "authenticated"}';

  -- 2a. admin_overview
  v_err_caught := false;
  begin
    perform public.admin_overview();
  exception when others then
    if sqlerrm = 'forbidden' then
      v_err_caught := true;
    else
      raise exception 'Unexpected error for non-admin on admin_overview: %', sqlerrm;
    end if;
  end;
  if not v_err_caught then
    raise exception 'FAIL: non-admin was able to call admin_overview';
  end if;

  -- 2b. admin_list_students
  v_err_caught := false;
  begin
    perform * from public.admin_list_students();
  exception when others then
    if sqlerrm = 'forbidden' then
      v_err_caught := true;
    else
      raise exception 'Unexpected error for non-admin on admin_list_students: %', sqlerrm;
    end if;
  end;
  if not v_err_caught then
    raise exception 'FAIL: non-admin was able to call admin_list_students';
  end if;

  -- 2c. admin_student_detail
  v_err_caught := false;
  begin
    perform public.admin_student_detail(v_student1_id);
  exception when others then
    if sqlerrm = 'forbidden' then
      v_err_caught := true;
    else
      raise exception 'Unexpected error for non-admin on admin_student_detail: %', sqlerrm;
    end if;
  end;
  if not v_err_caught then
    raise exception 'FAIL: non-admin was able to call admin_student_detail';
  end if;

  -- =========================================================================
  -- CHECK 3: Admin gets correct counts for a known fixture
  -- =========================================================================
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "role": "authenticated"}';

  v_overview := public.admin_overview();
  if v_overview is null then
    raise exception 'FAIL: admin_overview returned null';
  end if;

  if (v_overview->>'total_students')::int < 4 then
    raise exception 'FAIL: total_students expected at least 4, got %', v_overview->>'total_students';
  end if;

  if (v_overview->>'verified_revenue')::bigint < 250000 then
    raise exception 'FAIL: verified_revenue expected at least 250000, got %', v_overview->>'verified_revenue';
  end if;

  if (v_overview->>'completed_exams')::int < 1 then
    raise exception 'FAIL: completed_exams expected at least 1, got %', v_overview->>'completed_exams';
  end if;

  if jsonb_array_length(v_overview->'recent_signups') < 4 then
    raise exception 'FAIL: recent_signups length expected at least 4, got %', jsonb_array_length(v_overview->'recent_signups');
  end if;

  -- =========================================================================
  -- CHECK 4: Filters combine (email search AND status AND level)
  -- =========================================================================
  select count(*) into v_count
  from public.admin_list_students(
    p_search => 'student',
    p_status => 'active',
    p_level => 200
  );

  if v_count <> 1 then
    raise exception 'FAIL: combined filter (student, active, 200) returned % rows, expected 1', v_count;
  end if;

  select count(*) into v_count
  from public.admin_list_students(
    p_search => 'student',
    p_status => 'pending_payment',
    p_level => 300
  );

  if v_count <> 1 then
    raise exception 'FAIL: combined filter (student, pending_payment, 300) returned % rows, expected 1', v_count;
  end if;

  select count(*) into v_count
  from public.admin_list_students(
    p_search => 'student%',
    p_status => null,
    p_level => null
  );

  if v_count <> 0 then
    raise exception 'FAIL: escaped search for student%% returned % rows, expected 0', v_count;
  end if;

  -- =========================================================================
  -- CHECK 5: Limit caps at 50
  -- =========================================================================
  select count(*) into v_count
  from public.admin_list_students(p_limit => 100);

  if v_count > 50 then
    raise exception 'FAIL: p_limit => 100 returned % rows, should be capped at 50', v_count;
  end if;

  -- =========================================================================
  -- CHECK 6: Detail for unknown ID returns null / clean result
  -- =========================================================================
  v_detail := public.admin_student_detail('00000000-0000-0000-0000-000000000000');
  if v_detail is not null then
    raise exception 'FAIL: unknown student detail should be null, got %', v_detail;
  end if;

  v_detail := public.admin_student_detail(v_student1_id);
  if v_detail is null then
    raise exception 'FAIL: admin_student_detail returned null for known student';
  end if;

  if v_detail->>'name' <> 'Student One' or v_detail->>'email' <> 'student1.active.200@test.local' then
    raise exception 'FAIL: admin_student_detail data mismatch: %', v_detail;
  end if;

  if (v_detail->'stats'->>'attempts_submitted')::int <> 1 then
    raise exception 'FAIL: attempts_submitted mismatch: %', v_detail->'stats';
  end if;

  if (v_detail->'stats'->>'accuracy_percent')::numeric <> 80.0 then
    raise exception 'FAIL: accuracy_percent mismatch (expected 80.0): %', v_detail->'stats';
  end if;

  if jsonb_array_length(v_detail->'recent_attempts') <> 1 then
    raise exception 'FAIL: recent_attempts length mismatch: %', v_detail->'recent_attempts';
  end if;

  raise notice 'ALL ADMIN DATABASE FUNCTION TESTS PASSED';
end;
$$;
