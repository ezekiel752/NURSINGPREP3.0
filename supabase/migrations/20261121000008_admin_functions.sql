-- Migration: 20261121000008_admin_functions.sql

-- 1. admin_overview
create or replace function public.admin_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_students int;
  v_active_students int;
  v_pending_students int;
  v_verified_revenue bigint;
  v_total_approved_questions int;
  v_questions_by_level jsonb;
  v_completed_exams int;
  v_recent_signups jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  -- Student counts
  select
    count(*)::int,
    count(*) filter (where is_active = true)::int,
    count(*) filter (where is_active = false)::int
  into
    v_total_students,
    v_active_students,
    v_pending_students
  from public.profiles;

  -- Verified revenue (minor units)
  select coalesce(sum(amount_minor), 0)::bigint
  into v_verified_revenue
  from public.payments
  where status = 'success';

  -- Question bank counts
  select count(*)::int
  into v_total_approved_questions
  from public.questions
  where status = 'approved';

  select coalesce(
    jsonb_object_agg(al.code, coalesce(sub.cnt, 0)),
    '{}'::jsonb
  )
  into v_questions_by_level
  from academic_levels al
  left join (
    select c.level_id, count(q.id)::int as cnt
    from courses c
    join questions q on q.course_id = c.id and q.status = 'approved'
    group by c.level_id
  ) sub on sub.level_id = al.id;

  -- Completed exams
  select count(*)::int
  into v_completed_exams
  from public.exam_attempts
  where submitted_at is not null;

  -- 5 most recent signups
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'full_name', s.full_name,
        'email', u.email,
        'level', s.level,
        'is_active', s.is_active,
        'created_at', s.created_at
      )
    ),
    '[]'::jsonb
  )
  into v_recent_signups
  from (
    select p.id, p.full_name, p.level, p.is_active, p.created_at
    from public.profiles p
    order by p.created_at desc
    limit 5
  ) s
  join auth.users u on u.id = s.id;

  return jsonb_build_object(
    'total_students', v_total_students,
    'active_students', v_active_students,
    'pending_students', v_pending_students,
    'verified_revenue', v_verified_revenue,
    'question_bank', jsonb_build_object(
      'total_approved', v_total_approved_questions,
      'by_level', v_questions_by_level
    ),
    'completed_exams', v_completed_exams,
    'recent_signups', v_recent_signups
  );
end;
$$;

revoke execute on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;


-- 2. admin_list_students
create or replace function public.admin_list_students(
  p_search text default null,
  p_status text default null,
  p_level int default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  full_name text,
  email text,
  level int,
  is_active boolean,
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
  v_status_filter boolean;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  v_limit := greatest(1, least(50, coalesce(p_limit, 20)));
  v_offset := greatest(0, coalesce(p_offset, 0));

  if p_status = 'active' then
    v_status_filter := true;
  elsif p_status = 'pending_payment' then
    v_status_filter := false;
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
      p.id,
      p.full_name,
      u.email::text as email,
      p.level,
      p.is_active,
      p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    where (
      v_escaped_search is null
      or u.email ilike ('%' || v_escaped_search || '%') escape '\'
    )
    and (
      v_status_filter is null
      or p.is_active = v_status_filter
    )
    and (
      p_level is null
      or p.level = p_level
    )
  ),
  counted as (
    select count(*) as cnt from filtered
  )
  select
    f.id,
    f.full_name,
    f.email,
    f.level,
    f.is_active,
    f.created_at,
    c.cnt as total_count
  from filtered f
  cross join counted c
  order by f.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

revoke execute on function public.admin_list_students(text, text, int, int, int) from public, anon;
grant execute on function public.admin_list_students(text, text, int, int, int) to authenticated;


-- 3. admin_student_detail
create or replace function public.admin_student_detail(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_email text;
  v_university text;
  v_level int;
  v_is_active boolean;
  v_created_at timestamptz;
  v_paid_date timestamptz;
  v_attempts_submitted int;
  v_questions_answered int;
  v_total_score int;
  v_accuracy_percent numeric;
  v_recent_attempts jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  if p_user_id is null then
    return null;
  end if;

  select
    p.full_name,
    u.email,
    p.university,
    p.level,
    p.is_active,
    p.created_at
  into
    v_name,
    v_email,
    v_university,
    v_level,
    v_is_active,
    v_created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = p_user_id;

  if not found then
    return null;
  end if;

  -- Latest successful payment verified_at
  select max(verified_at)
  into v_paid_date
  from public.payments
  where user_id = p_user_id
    and status = 'success';

  -- Overall exam stats
  select
    count(*)::int,
    coalesce(sum(total), 0)::int,
    coalesce(sum(score), 0)::int
  into
    v_attempts_submitted,
    v_questions_answered,
    v_total_score
  from public.exam_attempts
  where user_id = p_user_id
    and submitted_at is not null;

  if v_questions_answered > 0 then
    v_accuracy_percent := round((v_total_score::numeric / v_questions_answered::numeric) * 100, 1);
  else
    v_accuracy_percent := 0.0;
  end if;

  -- Up to 10 recent submitted attempts
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'score', a.score,
        'total', a.total,
        'percent', case
          when a.total > 0 then round((a.score::numeric / a.total::numeric) * 100, 1)
          else 0.0
        end,
        'submitted_at', a.submitted_at
      )
    ),
    '[]'::jsonb
  )
  into v_recent_attempts
  from (
    select id, score, total, submitted_at
    from public.exam_attempts
    where user_id = p_user_id
      and submitted_at is not null
    order by submitted_at desc
    limit 10
  ) a;

  return jsonb_build_object(
    'id', p_user_id,
    'name', v_name,
    'email', v_email,
    'university', v_university,
    'level', v_level,
    'is_active', v_is_active,
    'paid_date', v_paid_date,
    'joined_date', v_created_at,
    'stats', jsonb_build_object(
      'attempts_submitted', v_attempts_submitted,
      'questions_answered', v_questions_answered,
      'accuracy_percent', v_accuracy_percent
    ),
    'recent_attempts', v_recent_attempts
  );
end;
$$;

revoke execute on function public.admin_student_detail(uuid) from public, anon;
grant execute on function public.admin_student_detail(uuid) to authenticated;
