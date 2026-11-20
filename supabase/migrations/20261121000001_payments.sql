-- 1. Table public.payments
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

-- 2. Row Level Security & Grants
alter table public.payments enable row level security;

revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;

create policy "Users can select own payments"
  on public.payments
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- 3. Function public.activate_payment
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
