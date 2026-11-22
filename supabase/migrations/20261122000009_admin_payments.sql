-- Migration: 20261122000009_admin_payments.sql
-- Function: admin_list_payments(p_search text, p_status text, p_limit int, p_offset int)

create or replace function public.admin_list_payments(
  p_search text default null,
  p_status text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  reference text,
  email text,
  full_name text,
  amount_minor integer,
  currency text,
  status text,
  verified_at timestamptz,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int;
  v_offset int;
  v_escaped_search text;
  v_status_filter text;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  v_limit := greatest(1, least(50, coalesce(p_limit, 20)));
  v_offset := greatest(0, coalesce(p_offset, 0));

  if p_status is not null and trim(p_status) <> '' then
    v_status_filter := trim(p_status);
  else
    v_status_filter := null;
  end if;

  if p_search is not null and trim(p_search) <> '' then
    v_escaped_search := replace(replace(replace(trim(p_search), '\', '\\'), '%', '\%'), '_', '\_');
  else
    v_escaped_search := null;
  end if;

  return query
  with filtered as (
    select
      py.id,
      py.reference,
      u.email::text as email,
      p.full_name,
      py.amount_minor,
      py.currency,
      py.status,
      py.verified_at,
      py.created_at
    from public.payments py
    left join auth.users u on u.id = py.user_id
    left join public.profiles p on p.id = py.user_id
    where (
      v_escaped_search is null
      or u.email ilike ('%' || v_escaped_search || '%') escape '\'
      or py.reference ilike ('%' || v_escaped_search || '%') escape '\'
    )
    and (
      v_status_filter is null
      or py.status = v_status_filter
    )
  ),
  counted as (
    select count(*) as cnt from filtered
  )
  select
    f.id,
    f.reference,
    f.email,
    f.full_name,
    f.amount_minor,
    f.currency,
    f.status,
    f.verified_at,
    f.created_at,
    c.cnt as total_count
  from filtered f
  cross join counted c
  order by f.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

revoke execute on function public.admin_list_payments(text, text, int, int) from public, anon;
grant execute on function public.admin_list_payments(text, text, int, int) to authenticated;
