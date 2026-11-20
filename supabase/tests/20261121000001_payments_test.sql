-- Security test script for payments schema
-- Executed inside a rolled-back transaction
begin;

-- 1. Apply schema changes temporarily in transaction
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reference text unique not null,
  amount_minor integer not null,
  currency text not null default 'NGN',
  status text not null default 'pending' check (status in ('pending', 'success', 'failed', 'duplicate')),
  created_at timestamptz default now(),
  verified_at timestamptz
);

alter table public.payments enable row level security;
revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;

create policy "Users can select own payments"
  on public.payments
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.activate_payment(p_reference text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_status text;
begin
  select user_id, status
  into v_user_id, v_status
  from public.payments
  where reference = p_reference
  for update;

  if not found then
    return false;
  end if;

  if v_status = 'success' then
    return false;
  end if;

  update public.payments
  set status = 'success',
      verified_at = now()
  where reference = p_reference;

  update public.profiles
  set is_active = true
  where id = v_user_id;

  return true;
end;
$$;

revoke all on function public.activate_payment(text) from public, anon, authenticated;
grant execute on function public.activate_payment(text) to service_role;

-- 2. Execute security tests
do $$
declare
  v_student1_id uuid := '11111111-1111-1111-1111-111111111111';
  v_student2_id uuid := '22222222-2222-2222-2222-222222222222';
  v_ref1 text := 'ref-test-student1-1';
  v_ref2 text := 'ref-test-student2-1';
  v_activated boolean;
  v_count int;
  v_is_active boolean;
  v_error_caught boolean;
begin
  -- Setup test users
  insert into auth.users (id, email)
  values
    (v_student1_id, 'student1@example.com'),
    (v_student2_id, 'student2@example.com')
  on conflict (id) do nothing;

  -- Setup profile for student 1 (initially is_active = false)
  insert into public.profiles (id, full_name, level, is_active)
  values (v_student1_id, 'Student One', 200, false)
  on conflict (id) do update set is_active = false;

  -- Setup payments
  insert into public.payments (user_id, reference, amount_minor, currency, status)
  values
    (v_student1_id, v_ref1, 1000000, 'NGN', 'pending'),
    (v_student2_id, v_ref2, 1000000, 'NGN', 'pending');

  -- CHECK 1: Fake student can read own payments only
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

  select count(*) into v_count from public.payments;
  if v_count <> 1 then
    raise exception 'FAIL: student1 saw % payments instead of 1', v_count;
  end if;

  select count(*) into v_count from public.payments where reference = v_ref2;
  if v_count <> 0 then
    raise exception 'FAIL: student1 was able to see student2 payment';
  end if;

  -- CHECK 2: Student cannot insert into payments
  v_error_caught := false;
  begin
    insert into public.payments (user_id, reference, amount_minor)
    values (v_student1_id, 'illegal-insert-ref', 1000000);
  exception when others then
    v_error_caught := true;
  end;
  if not v_error_caught then
    raise exception 'FAIL: student was able to insert into payments';
  end if;

  -- CHECK 3: Student cannot update payments
  v_error_caught := false;
  begin
    update public.payments set status = 'success' where reference = v_ref1;
  exception when others then
    v_error_caught := true;
  end;
  if not v_error_caught then
    raise exception 'FAIL: student was able to update payments';
  end if;

  -- CHECK 4: Student cannot call activate_payment
  v_error_caught := false;
  begin
    perform public.activate_payment(v_ref1);
  exception when others then
    v_error_caught := true;
  end;
  if not v_error_caught then
    raise exception 'FAIL: student was able to execute activate_payment';
  end if;

  -- Switch to service_role for activation
  reset role;
  set local role service_role;

  -- CHECK 5: service_role activates once (returns true)
  v_activated := public.activate_payment(v_ref1);
  if v_activated is not true then
    raise exception 'FAIL: first activate_payment returned false';
  end if;

  -- CHECK 6: second call returns false (idempotent)
  v_activated := public.activate_payment(v_ref1);
  if v_activated is not false then
    raise exception 'FAIL: second activate_payment returned true instead of false';
  end if;

  -- Reset role to postgres to verify profiles.is_active
  reset role;

  -- CHECK 7: is_active ends true on profiles
  select is_active into v_is_active from public.profiles where id = v_student1_id;
  if v_is_active is not true then
    raise exception 'FAIL: profiles.is_active is not true after activation';
  end if;

  raise notice 'ALL 7 PAYMENT SECURITY CHECKS PASSED';
end;
$$;

rollback;
