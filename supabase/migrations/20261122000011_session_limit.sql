-- Migration: 20261122000011_session_limit.sql
-- Two active sessions enforcement, soft revoking oldest on 3rd login, lock after 3 switches in 30 days

-- 1. Table public.device_sessions
create table if not exists public.device_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_reason text,
  constraint device_sessions_user_session_unique unique (user_id, session_id)
);

create index if not exists idx_device_sessions_user_last_seen
  on public.device_sessions(user_id, last_seen_at);

alter table public.device_sessions enable row level security;
revoke all on public.device_sessions from public, anon, authenticated;

-- 2. Table public.session_events
create table if not exists public.session_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text,
  event text not null check (event in ('login', 'switch', 'lock', 'unlock', 'signout')),
  created_at timestamptz not null default now()
);

create index if not exists idx_session_events_user_created
  on public.session_events(user_id, created_at);

alter table public.session_events enable row level security;
revoke all on public.session_events from public, anon, authenticated;

-- 3. Columns on public.profiles
alter table public.profiles
  add column if not exists is_locked boolean not null default false,
  add column if not exists lock_pending boolean not null default false,
  add column if not exists locked_at timestamptz;

-- 4. RPC: register_session()
create or replace function public.register_session()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id text;
  v_is_locked boolean;
  v_lock_pending boolean;
  v_has_attempt_in_progress boolean;
  v_live_count int;
  v_oldest_device_id uuid;
  v_oldest_session_id text;
  v_last_unlock_at timestamptz;
  v_window_start timestamptz;
  v_switch_count int;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if public.is_admin() then
    return 'exempt';
  end if;

  v_session_id := auth.jwt()->>'session_id';
  if v_session_id is null or trim(v_session_id) = '' then
    raise exception 'Missing session_id in token';
  end if;

  select is_locked, lock_pending
  into v_is_locked, v_lock_pending
  from public.profiles
  where id = v_user_id
  for update;

  if not found then
    raise exception 'User profile not found';
  end if;

  if v_is_locked then
    return 'locked';
  end if;

  -- Check if attempt in progress: submitted_at is null AND within created_at + 1200s + 60s
  select exists (
    select 1
    from public.exam_attempts
    where user_id = v_user_id
      and submitted_at is null
      and now() <= created_at + interval '1260 seconds'
  ) into v_has_attempt_in_progress;

  -- If lock_pending, apply when no attempt is in progress
  if v_lock_pending then
    if not v_has_attempt_in_progress then
      update public.profiles
      set is_locked = true,
          lock_pending = false,
          locked_at = now()
      where id = v_user_id;

      insert into public.session_events (user_id, session_id, event)
      values (v_user_id, v_session_id, 'lock');

      return 'locked';
    end if;
  end if;

  -- Count other LIVE sessions (revoked_at is null AND last_seen_at within 5 minutes)
  select count(*)::int
  into v_live_count
  from public.device_sessions
  where user_id = v_user_id
    and session_id <> v_session_id
    and revoked_at is null
    and last_seen_at >= now() - interval '5 minutes';

  -- If 2 or more other live sessions exist, this 3rd live login evicts the oldest live session
  if v_live_count >= 2 then
    select id, session_id
    into v_oldest_device_id, v_oldest_session_id
    from public.device_sessions
    where user_id = v_user_id
      and session_id <> v_session_id
      and revoked_at is null
      and last_seen_at >= now() - interval '5 minutes'
    order by last_seen_at asc, created_at asc
    limit 1;

    if v_oldest_device_id is not null then
      update public.device_sessions
      set revoked_at = now(),
          revoked_reason = 'evicted'
      where id = v_oldest_device_id;

      insert into public.session_events (user_id, session_id, event)
      values (v_user_id, v_oldest_session_id, 'switch');

      -- Check 3 switches within 30 days counted since the last admin unlock
      select max(created_at)
      into v_last_unlock_at
      from public.session_events
      where user_id = v_user_id and event = 'unlock';

      v_window_start := greatest(coalesce(v_last_unlock_at, '-infinity'::timestamptz), now() - interval '30 days');

      select count(*)::int
      into v_switch_count
      from public.session_events
      where user_id = v_user_id
        and event = 'switch'
        and created_at >= v_window_start;

      if v_switch_count >= 3 then
        if v_has_attempt_in_progress then
          update public.profiles
          set lock_pending = true
          where id = v_user_id;
        else
          update public.profiles
          set is_locked = true,
              lock_pending = false,
              locked_at = now()
          where id = v_user_id;

          insert into public.session_events (user_id, session_id, event)
          values (v_user_id, v_session_id, 'lock');

          return 'locked';
        end if;
      end if;
    end if;
  end if;

  -- Upsert current session
  insert into public.device_sessions (user_id, session_id, created_at, last_seen_at, revoked_at, revoked_reason)
  values (v_user_id, v_session_id, now(), now(), null, null)
  on conflict (user_id, session_id) do update
  set last_seen_at = now(),
      revoked_at = null,
      revoked_reason = null;

  insert into public.session_events (user_id, session_id, event)
  values (v_user_id, v_session_id, 'login');

  return 'ok';
end;
$$;

revoke all on function public.register_session() from public, anon;
grant execute on function public.register_session() to authenticated;

-- 5. RPC: heartbeat_session()
create or replace function public.heartbeat_session()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id text;
  v_is_locked boolean;
  v_lock_pending boolean;
  v_has_attempt_in_progress boolean;
  v_device_session_id uuid;
  v_revoked_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if public.is_admin() then
    return 'exempt';
  end if;

  v_session_id := auth.jwt()->>'session_id';
  if v_session_id is null or trim(v_session_id) = '' then
    raise exception 'Missing session_id in token';
  end if;

  select is_locked, lock_pending
  into v_is_locked, v_lock_pending
  from public.profiles
  where id = v_user_id
  for update;

  if not found then
    raise exception 'User profile not found';
  end if;

  if v_is_locked then
    return 'locked';
  end if;

  -- Check if attempt in progress
  select exists (
    select 1
    from public.exam_attempts
    where user_id = v_user_id
      and submitted_at is null
      and now() <= created_at + interval '1260 seconds'
  ) into v_has_attempt_in_progress;

  -- Applies lock_pending when no attempt is in progress
  if v_lock_pending then
    if not v_has_attempt_in_progress then
      update public.profiles
      set is_locked = true,
          lock_pending = false,
          locked_at = now()
      where id = v_user_id;

      insert into public.session_events (user_id, session_id, event)
      values (v_user_id, v_session_id, 'lock');

      return 'locked';
    end if;
  end if;

  -- Check current session in device_sessions
  select id, revoked_at
  into v_device_session_id, v_revoked_at
  from public.device_sessions
  where user_id = v_user_id and session_id = v_session_id;

  if v_device_session_id is null then
    return 'revoked';
  end if;

  if v_revoked_at is not null then
    -- If this session is revoked AND the user has an attempt in progress, return 'ok' (defer sign-out)
    if v_has_attempt_in_progress then
      update public.device_sessions
      set last_seen_at = now()
      where id = v_device_session_id;
      return 'ok';
    end if;
    return 'revoked';
  end if;

  -- Update last_seen_at
  update public.device_sessions
  set last_seen_at = now()
  where id = v_device_session_id;

  return 'ok';
end;
$$;

revoke all on function public.heartbeat_session() from public, anon;
grant execute on function public.heartbeat_session() to authenticated;

-- 6. RPC: end_session()
create or replace function public.end_session()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id text;
begin
  if v_user_id is null then
    return;
  end if;

  v_session_id := auth.jwt()->>'session_id';
  if v_session_id is null then
    return;
  end if;

  update public.device_sessions
  set revoked_at = now(),
      revoked_reason = 'signout'
  where user_id = v_user_id
    and session_id = v_session_id;

  insert into public.session_events (user_id, session_id, event)
  values (v_user_id, v_session_id, 'signout');
end;
$$;

revoke all on function public.end_session() from public, anon;
grant execute on function public.end_session() to authenticated;

-- 7. RPC: admin_unlock_student(p_user_id)
create or replace function public.admin_unlock_student(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  if p_user_id is null then
    return false;
  end if;

  update public.profiles
  set is_locked = false,
      lock_pending = false,
      locked_at = null
  where id = p_user_id;

  insert into public.session_events (user_id, session_id, event)
  values (p_user_id, null, 'unlock');

  return true;
end;
$$;

revoke all on function public.admin_unlock_student(uuid) from public, anon;
grant execute on function public.admin_unlock_student(uuid) to authenticated;

-- 8. RPC: admin_get_lock_status(p_user_id)
create or replace function public.admin_get_lock_status(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_locked boolean;
  v_lock_pending boolean;
  v_last_unlock_at timestamptz;
  v_window_start timestamptz;
  v_switches_in_window int;
  v_recent_events jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  if p_user_id is null then
    return null;
  end if;

  select is_locked, lock_pending
  into v_is_locked, v_lock_pending
  from public.profiles
  where id = p_user_id;

  if not found then
    return null;
  end if;

  select max(created_at)
  into v_last_unlock_at
  from public.session_events
  where user_id = p_user_id and event = 'unlock';

  v_window_start := greatest(coalesce(v_last_unlock_at, '-infinity'::timestamptz), now() - interval '30 days');

  select count(*)::int
  into v_switches_in_window
  from public.session_events
  where user_id = p_user_id
    and event = 'switch'
    and created_at >= v_window_start;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'event', se.event,
        'created_at', se.created_at
      )
    ),
    '[]'::jsonb
  )
  into v_recent_events
  from (
    select event, created_at
    from public.session_events
    where user_id = p_user_id
    order by created_at desc
    limit 5
  ) se;

  return jsonb_build_object(
    'is_locked', coalesce(v_is_locked, false),
    'lock_pending', coalesce(v_lock_pending, false),
    'switches_in_window', v_switches_in_window,
    'last_events', v_recent_events
  );
end;
$$;

revoke all on function public.admin_get_lock_status(uuid) from public, anon;
grant execute on function public.admin_get_lock_status(uuid) to authenticated;

-- 9. Update get_exam_questions: add is_locked and session revoked checks
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
  v_is_locked boolean;
  v_attempt_id uuid;
  v_question_ids uuid[];
  v_questions jsonb := '[]'::jsonb;
  v_session_id text;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select level, is_active, is_locked
  into v_level, v_is_active, v_is_locked
  from public.profiles
  where id = auth.uid();

  if not found then
    raise exception 'Unauthorized';
  end if;

  if v_is_locked then
    raise exception 'ACCOUNT_LOCKED';
  end if;

  if not v_is_active then
    raise exception 'Active membership required';
  end if;

  if v_level is null then
    raise exception 'Student level not set';
  end if;

  -- Check if caller session is revoked (non-admins)
  if not public.is_admin() then
    v_session_id := auth.jwt()->>'session_id';
    if v_session_id is not null then
      if exists (
        select 1
        from public.device_sessions
        where user_id = auth.uid()
          and session_id = v_session_id
          and revoked_at is not null
      ) then
        raise exception 'SESSION_REVOKED';
      end if;
    end if;
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

-- 10. Update resume_exam: add is_locked check only
create or replace function public.resume_exam(p_attempt_id uuid)
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
  v_questions jsonb := '[]'::jsonb;
  v_qid uuid;
  v_q record;
  v_elapsed int;
  v_seconds_remaining int;
  v_is_locked boolean;
  v_is_active boolean;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select is_active, is_locked
  into v_is_active, v_is_locked
  from public.profiles
  where id = auth.uid();

  if v_is_locked then
    raise exception 'ACCOUNT_LOCKED';
  end if;

  if not coalesce(v_is_active, false) then
    raise exception 'Active membership required';
  end if;

  select user_id, question_ids, submitted_at, created_at
  into v_attempt_user_id, v_question_ids, v_submitted_at, v_created_at
  from public.exam_attempts
  where id = p_attempt_id;

  if not found then
    raise exception 'Exam attempt not found';
  end if;

  if v_attempt_user_id <> auth.uid() then
    raise exception 'Attempt does not belong to user';
  end if;

  if v_submitted_at is not null then
    raise exception 'Exam attempt already submitted';
  end if;

  -- 1200 seconds (20 minutes) minus elapsed seconds since creation (minimum 0)
  v_elapsed := floor(extract(epoch from (now() - v_created_at)))::int;
  v_seconds_remaining := greatest(1200 - v_elapsed, 0);

  v_total := coalesce(array_length(v_question_ids, 1), 0);
  if v_total > 0 then
    for i in 1 .. v_total loop
      v_qid := v_question_ids[i];
      select id, topic, question_text, option_a, option_b, option_c, option_d
      into v_q
      from public.questions
      where id = v_qid;

      if found then
        v_questions := v_questions || jsonb_build_array(
          jsonb_build_object(
            'id', v_q.id,
            'topic', v_q.topic,
            'question_text', v_q.question_text,
            'option_a', v_q.option_a,
            'option_b', v_q.option_b,
            'option_c', v_q.option_c,
            'option_d', v_q.option_d
          )
        );
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'attempt_id', p_attempt_id,
    'questions', v_questions,
    'seconds_remaining', v_seconds_remaining
  );
end;
$$;

revoke all on function public.resume_exam(uuid) from public, anon;
grant execute on function public.resume_exam(uuid) to authenticated;
