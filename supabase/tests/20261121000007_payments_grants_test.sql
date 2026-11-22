do $$
declare
  v_student_id uuid := '11111111-1111-1111-1111-111111111111';
  v_ref text := 'ref-test-service-role-1';
  v_cnt int;
  v_error_caught boolean;
begin
  -- Setup test user
  insert into auth.users (id, email)
  values (v_student_id, 'student1@example.com')
  on conflict (id) do nothing;

  -- 1. Test as service_role: insert pending payment row
  set local role service_role;

  insert into public.payments (user_id, reference, amount_minor, currency, status)
  values (v_student_id, v_ref, 500000, 'NGN', 'pending');

  -- 2. Test as service_role: update status to failed
  update public.payments
  set status = 'failed'
  where reference = v_ref;

  select count(*) into v_cnt
  from public.payments
  where reference = v_ref and status = 'failed';

  if v_cnt <> 1 then
    raise exception 'FAIL: service_role insert/update failed (count=%)', v_cnt;
  end if;

  -- 3. Assert student role (authenticated) still cannot insert or update
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

  -- Student cannot insert
  v_error_caught := false;
  begin
    insert into public.payments (user_id, reference, amount_minor, currency, status)
    values (v_student_id, 'illegal-student-insert-ref', 500000, 'NGN', 'pending');
  exception when others then
    v_error_caught := true;
  end;
  if not v_error_caught then
    raise exception 'FAIL: authenticated student was able to insert into payments';
  end if;

  -- Student cannot update
  v_error_caught := false;
  begin
    update public.payments
    set status = 'success'
    where reference = v_ref;
  exception when others then
    v_error_caught := true;
  end;
  if not v_error_caught then
    raise exception 'FAIL: authenticated student was able to update payments';
  end if;

  raise notice 'ALL SERVICE_ROLE AND STUDENT PERMISSION CHECKS PASSED';
end;
$$;
