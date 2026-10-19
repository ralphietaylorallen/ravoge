-- Virtual defaults only: no backfill, no production data rewrite, no new scheduling tables.
-- Explicit hours/settings/weekly availability and closures always take precedence.
create function private.effective_schedule_settings(target_organization_id uuid)
returns public.organization_session_settings
language plpgsql stable security definer set search_path = ''
as $$
declare settings public.organization_session_settings%rowtype;
begin
  select * into settings from public.organization_session_settings where organization_id = target_organization_id;
  if not found then
    settings.organization_id := target_organization_id;
    settings.default_duration_minutes := 60;
    settings.permitted_durations := array[60]::smallint[];
    settings.slot_increment_minutes := 60;
    settings.minimum_notice_minutes := 0;
    settings.maximum_advance_days := 30;
    settings.cancellation_cutoff_minutes := 0;
    settings.buffer_before_minutes := 0;
    settings.buffer_after_minutes := 0;
  end if;
  return settings;
end;
$$;

create function private.effective_coach_windows(
  target_organization_id uuid, target_coach_user_id uuid, target_date date, organization_timezone text
)
returns table (starts_at time, ends_at time)
language sql stable security definer set search_path = ''
as $$
  select availability.starts_at, availability.ends_at
  from public.coach_availability availability
  where availability.organization_id = target_organization_id
    and availability.coach_user_id = target_coach_user_id
    and availability.day_of_week = extract(dow from target_date)::smallint
  union
  select time '05:00', time '20:00'
  where extract(dow from target_date) between 1 and 6
    and not exists (
      select 1 from public.coach_availability availability
      where availability.organization_id = target_organization_id
        and availability.coach_user_id = target_coach_user_id
    )
  union
  select (exception.starts_at at time zone organization_timezone)::time,
         (exception.ends_at at time zone organization_timezone)::time
  from public.coach_availability_exceptions exception
  where exception.organization_id = target_organization_id
    and exception.coach_user_id = target_coach_user_id
    and exception.kind = 'available_override'
    and (exception.starts_at at time zone organization_timezone)::date = target_date;
$$;


create or replace function private.booking_slot_permitted(
  target_organization_id uuid,
  target_coach_user_id uuid,
  target_client_user_id uuid,
  target_starts_at timestamptz,
  target_ends_at timestamptz,
  ignored_booking_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  settings public.organization_session_settings%rowtype;
  organization_timezone text;
  local_start timestamp;
  local_end timestamp;
  local_day date;
  gym_open time;
  gym_close time;
  gym_closed boolean;
  target_duration smallint;
begin
  if target_starts_at is null or target_ends_at is null or target_starts_at >= target_ends_at then return false; end if;

  select organization.timezone into strict organization_timezone
  from public.organizations organization
  where organization.id = target_organization_id and organization.status = 'active';
  settings := private.effective_schedule_settings(target_organization_id);

  if not exists (
    select 1 from public.organization_memberships coach
    join public.profiles profile on profile.id = coach.user_id and profile.account_status = 'active'
    where coach.organization_id = target_organization_id and coach.user_id = target_coach_user_id
      and coach.role = 'coach' and coach.status = 'active'
  ) or not exists (
    select 1 from public.organization_memberships client
    join public.profiles profile on profile.id = client.user_id and profile.account_status = 'active'
    where client.organization_id = target_organization_id and client.user_id = target_client_user_id
      and client.role = 'client' and client.status = 'active'
  ) then return false; end if;

  if not private.has_active_coach_client_assignment(target_organization_id, target_coach_user_id, target_client_user_id)
    and not private.has_active_role(target_organization_id, array['owner']::public.organization_role[])
  then return false; end if;
  target_duration := (extract(epoch from (target_ends_at - target_starts_at)) / 60)::smallint;
  if not (target_duration = any(settings.permitted_durations)) then return false; end if;
  if target_starts_at < now() + make_interval(mins => settings.minimum_notice_minutes)
    or target_starts_at > now() + make_interval(days => settings.maximum_advance_days) then return false; end if;

  local_start := target_starts_at at time zone organization_timezone;
  local_end := target_ends_at at time zone organization_timezone;
  local_day := local_start::date;
  if local_end::date <> local_day then return false; end if;

  select special.is_closed, special.opens_at, special.closes_at
  into gym_closed, gym_open, gym_close
  from public.organization_special_hours special
  where special.organization_id = target_organization_id and special.local_date = local_day;
  if not found then
    select hours.is_closed, hours.opens_at, hours.closes_at
    into gym_closed, gym_open, gym_close
    from public.organization_hours hours
    where hours.organization_id = target_organization_id
      and hours.day_of_week = extract(dow from local_day)::smallint;
  end if;
  if not found then
    -- A partially configured week is intentional: do not open its missing days.
    if exists (select 1 from public.organization_hours where organization_id = target_organization_id) then return false; end if;
    gym_closed := extract(dow from local_day) = 0;
    gym_open := time '05:00';
    gym_close := time '20:00';
  end if;
  if gym_closed or local_start::time < gym_open or local_end::time > gym_close then return false; end if;
  if not exists (select 1 from public.organization_session_settings where organization_id = target_organization_id)
    and (local_start::time <> date_trunc('hour', local_start)::time or target_ends_at - target_starts_at <> interval '60 minutes')
  then return false; end if;

  if not exists (
    select 1 from private.effective_coach_windows(
      target_organization_id, target_coach_user_id, local_day, organization_timezone
    ) availability
    where local_start::time >= availability.starts_at and local_end::time <= availability.ends_at
  ) then return false; end if;

  if exists (
    select 1 from public.coach_availability_exceptions exception
    where exception.organization_id = target_organization_id
      and exception.coach_user_id = target_coach_user_id
      and exception.kind in ('unavailable','personal_block','vacation')
      and tstzrange(exception.starts_at, exception.ends_at, '[)') && tstzrange(target_starts_at, target_ends_at, '[)')
  ) then return false; end if;

  return true;
exception when no_data_found then return false;
end;
$$;

create or replace function private.booking_slot_is_available(
  target_organization_id uuid, target_coach_user_id uuid, target_client_user_id uuid,
  target_starts_at timestamptz, target_ends_at timestamptz, ignored_booking_id uuid default null
)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare settings public.organization_session_settings%rowtype;
begin
  if not private.booking_slot_permitted(target_organization_id, target_coach_user_id, target_client_user_id,
    target_starts_at, target_ends_at, ignored_booking_id) then return false; end if;
  settings := private.effective_schedule_settings(target_organization_id);
  if exists (
    select 1 from public.bookings booking
    where booking.organization_id = target_organization_id
      and booking.coach_user_id = target_coach_user_id
      and booking.status = 'scheduled'
      and booking.id is distinct from ignored_booking_id
      and tstzrange(
        booking.starts_at - make_interval(mins => settings.buffer_before_minutes),
        booking.ends_at + make_interval(mins => settings.buffer_after_minutes), '[)'
      ) && tstzrange(
        target_starts_at - make_interval(mins => settings.buffer_before_minutes),
        target_ends_at + make_interval(mins => settings.buffer_after_minutes), '[)'
      )
  ) then return false; end if;

  if exists (
    select 1 from public.bookings booking
    where booking.organization_id = target_organization_id
      and booking.client_user_id = target_client_user_id
      and booking.status = 'scheduled'
      and booking.id is distinct from ignored_booking_id
      and tstzrange(booking.starts_at, booking.ends_at, '[)') &&
        tstzrange(target_starts_at, target_ends_at, '[)')
  ) then return false; end if;


  return true;
end;
$$;

create or replace function public.get_staff_booking_calendar(
  target_client_user_id uuid,
  target_coach_user_id uuid,
  target_date date,
  target_duration smallint
)
returns table (starts_at timestamptz, ends_at timestamptz, coach_user_id uuid, timezone text, available boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_organization_id uuid;
  actor_role public.organization_role;
  organization_timezone text;
  settings public.organization_session_settings%rowtype;
  availability_window record;
  candidate_local timestamp;
  candidate_start timestamptz;
  candidate_end timestamptz;
  returned_slots timestamptz[] := '{}';
begin
  select membership.organization_id, membership.role, organization.timezone
  into strict actor_organization_id, actor_role, organization_timezone
  from public.organization_memberships membership
  join public.organizations organization on organization.id = membership.organization_id and organization.status = 'active'
  join public.profiles profile on profile.id = membership.user_id and profile.account_status = 'active'
  where membership.user_id = actor_user_id and membership.role in ('owner','coach') and membership.status = 'active';
  if actor_role = 'coach' and (
    target_coach_user_id <> actor_user_id
    or not private.has_active_coach_client_assignment(actor_organization_id, actor_user_id, target_client_user_id)
  ) then raise exception 'Coaches may schedule only their assigned Clients'; end if;
  if not exists (
    select 1 from public.organization_memberships member
    join public.profiles profile on profile.id = member.user_id and profile.account_status = 'active'
    where member.organization_id = actor_organization_id and member.user_id = target_coach_user_id
      and member.role = 'coach' and member.status = 'active'
  ) or not exists (
    select 1 from public.organization_memberships member
    join public.profiles profile on profile.id = member.user_id and profile.account_status = 'active'
    where member.organization_id = actor_organization_id and member.user_id = target_client_user_id
      and member.role = 'client' and member.status = 'active'
  ) then raise exception 'An active Coach and Client in this gym are required'; end if;
  settings := private.effective_schedule_settings(actor_organization_id);
  if not (target_duration = any(settings.permitted_durations)) then return; end if;

  for availability_window in
    select * from private.effective_coach_windows(
      actor_organization_id, target_coach_user_id, target_date, organization_timezone
    )
  loop
    for candidate_local in
      select generate_series(
        target_date + availability_window.starts_at,
        target_date + availability_window.ends_at - make_interval(mins => target_duration),
        make_interval(mins => settings.slot_increment_minutes)
      )
    loop
      candidate_start := candidate_local at time zone organization_timezone;
      candidate_end := candidate_start + make_interval(mins => target_duration);
      if candidate_start at time zone organization_timezone = candidate_local
        and not candidate_start = any(returned_slots)
        and private.booking_slot_permitted(
          actor_organization_id, target_coach_user_id, target_client_user_id,
          candidate_start, candidate_end, null
        )
      then
        available := private.booking_slot_is_available(actor_organization_id, target_coach_user_id, target_client_user_id, candidate_start, candidate_end, null);
        starts_at := candidate_start;
        ends_at := candidate_end;
        coach_user_id := target_coach_user_id;
        timezone := organization_timezone;
        returned_slots := array_append(returned_slots, candidate_start);
        return next;
      end if;
    end loop;
  end loop;
exception when no_data_found then raise exception 'An active staff membership is required';
end;
$$;

create or replace function public.get_client_booking_calendar(target_date date, target_duration smallint)
returns table (starts_at timestamptz, ends_at timestamptz, coach_user_id uuid, timezone text, available boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_organization_id uuid;
  assigned_coach_id uuid;
  organization_timezone text;
  settings public.organization_session_settings%rowtype;
  availability_window record;
  candidate_local timestamp;
  candidate_start timestamptz;
  candidate_end timestamptz;
  returned_slots timestamptz[] := '{}';
begin
  select membership.organization_id, assignment.coach_user_id
  into strict actor_organization_id, assigned_coach_id
  from public.organization_memberships membership
  join public.coach_client_assignments assignment
    on assignment.organization_id = membership.organization_id
   and assignment.client_user_id = membership.user_id
   and assignment.status = 'active'
  where membership.user_id = actor_user_id
    and membership.role = 'client'
    and membership.status = 'active';
  select organization.timezone into strict organization_timezone from public.organizations organization
    where organization.id = actor_organization_id and organization.status = 'active';
  settings := private.effective_schedule_settings(actor_organization_id);
  if not (target_duration = any(settings.permitted_durations)) then return; end if;

  for availability_window in
    select * from private.effective_coach_windows(
      actor_organization_id, assigned_coach_id, target_date, organization_timezone
    )
  loop
    for candidate_local in
      select generate_series(
        target_date + availability_window.starts_at,
        target_date + availability_window.ends_at - make_interval(mins => target_duration),
        make_interval(mins => settings.slot_increment_minutes)
      )
    loop
      candidate_start := candidate_local at time zone organization_timezone;
      candidate_end := candidate_start + make_interval(mins => target_duration);
      if candidate_start at time zone organization_timezone = candidate_local
        and not candidate_start = any(returned_slots)
        and private.booking_slot_permitted(actor_organization_id, assigned_coach_id, actor_user_id, candidate_start, candidate_end, null)
      then
        available := private.booking_slot_is_available(actor_organization_id, assigned_coach_id, actor_user_id, candidate_start, candidate_end, null);
        starts_at := candidate_start;
        ends_at := candidate_end;
        coach_user_id := assigned_coach_id;
        timezone := organization_timezone;
        returned_slots := array_append(returned_slots, candidate_start);
        return next;
      end if;
    end loop;
  end loop;
exception when no_data_found then raise exception 'An active Client with an assigned Coach is required';
end;
$$;

-- Preserve the original open-slot RPC contracts for existing callers.
create or replace function public.get_staff_booking_availability(
  target_client_user_id uuid, target_coach_user_id uuid, target_date date, target_duration smallint
)
returns table (starts_at timestamptz, ends_at timestamptz, coach_user_id uuid, timezone text)
language sql stable security definer set search_path = ''
as $$
  select slot.starts_at, slot.ends_at, slot.coach_user_id, slot.timezone
  from public.get_staff_booking_calendar(target_client_user_id, target_coach_user_id, target_date, target_duration) slot
  where slot.available order by slot.starts_at;
$$;

create or replace function public.get_client_booking_availability(target_date date, target_duration smallint)
returns table (starts_at timestamptz, ends_at timestamptz, coach_user_id uuid, timezone text)
language sql stable security definer set search_path = ''
as $$
  select slot.starts_at, slot.ends_at, slot.coach_user_id, slot.timezone
  from public.get_client_booking_calendar(target_date, target_duration) slot
  where slot.available order by slot.starts_at;
$$;

create or replace function public.create_staff_booking(
  target_client_user_id uuid,
  target_coach_user_id uuid,
  target_starts_at timestamptz,
  target_duration smallint,
  staff_notes text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_organization_id uuid;
  actor_role public.organization_role;
  organization_timezone text;
  settings public.organization_session_settings%rowtype;
  target_ends_at timestamptz;
  new_booking_id uuid;
begin
  if actor_user_id is null or target_starts_at is null or target_duration is null
    or char_length(coalesce(staff_notes, '')) > 1000 then raise exception 'Invalid booking request'; end if;
  select membership.organization_id, membership.role, organization.timezone
  into strict actor_organization_id, actor_role, organization_timezone
  from public.organization_memberships membership
  join public.organizations organization on organization.id = membership.organization_id and organization.status = 'active'
  join public.profiles profile on profile.id = membership.user_id and profile.account_status = 'active'
  where membership.user_id = actor_user_id and membership.role in ('owner','coach') and membership.status = 'active';
  if actor_role = 'coach' and (
    target_coach_user_id <> actor_user_id
    or not private.has_active_coach_client_assignment(actor_organization_id, actor_user_id, target_client_user_id)
  ) then raise exception 'Coaches may book only their assigned Clients'; end if;
  settings := private.effective_schedule_settings(actor_organization_id);
  target_ends_at := target_starts_at + make_interval(mins => target_duration);
  if not private.booking_slot_is_available(
    actor_organization_id, target_coach_user_id, target_client_user_id,
    target_starts_at, target_ends_at, null
  ) then raise exception 'That time is not available'; end if;
  insert into public.bookings (
    organization_id, coach_user_id, client_user_id, starts_at, ends_at,
    timezone, buffer_before_minutes, buffer_after_minutes, booked_by, notes
  ) values (
    actor_organization_id, target_coach_user_id, target_client_user_id, target_starts_at, target_ends_at,
    organization_timezone, settings.buffer_before_minutes, settings.buffer_after_minutes,
    actor_user_id, nullif(trim(coalesce(staff_notes, '')), '')
  ) returning id into new_booking_id;
  update public.booking_email_deliveries set status = 'skipped', attempted_at = now(),
    error_message = 'Staff-initiated booking email is not configured in this release.'
  where booking_id = new_booking_id and event_type = 'booked' and status = 'pending';
  return new_booking_id;
exception
  when no_data_found then raise exception 'An active Owner or assigned Coach is required';
  when exclusion_violation then raise exception 'That time was just booked. Choose another time.';
end;
$$;

create or replace function public.reschedule_staff_booking(
  target_booking_id uuid, target_starts_at timestamptz, target_duration smallint
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare actor_user_id uuid := (select auth.uid()); target public.bookings%rowtype;
  actor_role public.organization_role; settings public.organization_session_settings%rowtype;
  target_ends_at timestamptz;
begin
  select * into strict target from public.bookings where id = target_booking_id for update;
  select membership.role into strict actor_role
  from public.organization_memberships membership
  join public.organizations organization on organization.id = membership.organization_id and organization.status = 'active'
  join public.profiles profile on profile.id = membership.user_id and profile.account_status = 'active'
  where membership.organization_id = target.organization_id and membership.user_id = actor_user_id
    and membership.role in ('owner','coach') and membership.status = 'active';
  if target.status <> 'scheduled' then raise exception 'Booking is not available'; end if;
  if actor_role = 'coach' and (
    target.coach_user_id <> actor_user_id
    or not private.has_active_coach_client_assignment(target.organization_id, actor_user_id, target.client_user_id)
  ) then raise exception 'Coaches may reschedule only their assigned Clients'; end if;
  settings := private.effective_schedule_settings(target.organization_id);
  if actor_role = 'coach' and target.starts_at < now() + make_interval(mins => settings.cancellation_cutoff_minutes)
    then raise exception 'The rescheduling cutoff has passed'; end if;
  target_ends_at := target_starts_at + make_interval(mins => target_duration);
  if not private.booking_slot_is_available(
    target.organization_id, target.coach_user_id, target.client_user_id,
    target_starts_at, target_ends_at, target.id
  ) then raise exception 'That time is not available'; end if;
  update public.bookings set starts_at = target_starts_at, ends_at = target_ends_at,
    buffer_before_minutes = settings.buffer_before_minutes,
    buffer_after_minutes = settings.buffer_after_minutes
  where id = target.id;
  update public.booking_email_deliveries set status = 'skipped', attempted_at = now(),
    error_message = 'Staff-initiated booking email is not configured in this release.'
  where booking_id = target.id and event_type = 'rescheduled' and status = 'pending';
exception
  when no_data_found then raise exception 'Booking is not available';
  when exclusion_violation then raise exception 'That time was just booked. Choose another time.';
end;
$$;

create or replace function public.cancel_staff_booking(target_booking_id uuid, reason text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare actor_user_id uuid := (select auth.uid()); target public.bookings%rowtype;
  actor_role public.organization_role; cutoff integer;
begin
  if char_length(coalesce(reason, '')) > 500 then raise exception 'Cancellation reason is too long'; end if;
  select * into strict target from public.bookings where id = target_booking_id for update;
  select membership.role into strict actor_role
  from public.organization_memberships membership
  join public.organizations organization on organization.id = membership.organization_id and organization.status = 'active'
  join public.profiles profile on profile.id = membership.user_id and profile.account_status = 'active'
  where membership.organization_id = target.organization_id and membership.user_id = actor_user_id
    and membership.role in ('owner','coach') and membership.status = 'active';
  if target.status <> 'scheduled' then raise exception 'Booking is not available'; end if;
  if actor_role = 'coach' then
    if target.coach_user_id <> actor_user_id
      or not private.has_active_coach_client_assignment(target.organization_id, actor_user_id, target.client_user_id)
    then raise exception 'Coaches may cancel only their assigned Clients'; end if;
    cutoff := (private.effective_schedule_settings(target.organization_id)).cancellation_cutoff_minutes;
    if target.starts_at < now() + make_interval(mins => cutoff)
      then raise exception 'The cancellation cutoff has passed'; end if;
  end if;
  update public.bookings set status = 'cancelled', cancelled_at = now(),
    cancellation_reason = nullif(trim(coalesce(reason, '')), '') where id = target.id;
  update public.booking_email_deliveries set status = 'skipped', attempted_at = now(),
    error_message = 'Staff-initiated booking email is not configured in this release.'
  where booking_id = target.id and event_type = 'cancelled' and status = 'pending';
exception when no_data_found then raise exception 'Booking is not available';
end;
$$;

create or replace function public.create_client_booking(target_starts_at timestamptz, target_duration smallint, client_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_organization_id uuid;
  assigned_coach_id uuid;
  organization_timezone text;
  target_ends_at timestamptz;
  new_booking_id uuid;
  settings public.organization_session_settings%rowtype;
begin
  if actor_user_id is null or target_starts_at is null or target_duration is null
    or char_length(coalesce(client_notes, '')) > 1000 then raise exception 'Invalid booking request'; end if;
  select membership.organization_id, assignment.coach_user_id, organization.timezone
  into strict actor_organization_id, assigned_coach_id, organization_timezone
  from public.organization_memberships membership
  join public.organizations organization on organization.id = membership.organization_id and organization.status = 'active'
  join public.coach_client_assignments assignment
    on assignment.organization_id = membership.organization_id
   and assignment.client_user_id = membership.user_id
   and assignment.status = 'active'
  where membership.user_id = actor_user_id and membership.role = 'client' and membership.status = 'active';
  target_ends_at := target_starts_at + make_interval(mins => target_duration);
  settings := private.effective_schedule_settings(actor_organization_id);
  if not private.booking_slot_is_available(actor_organization_id, assigned_coach_id, actor_user_id, target_starts_at, target_ends_at, null)
  then raise exception 'That time is not available'; end if;

  insert into public.bookings (
    organization_id, coach_user_id, client_user_id, starts_at, ends_at,
    timezone, buffer_before_minutes, buffer_after_minutes, booked_by, notes
  ) values (
    actor_organization_id, assigned_coach_id, actor_user_id, target_starts_at, target_ends_at,
    organization_timezone, settings.buffer_before_minutes, settings.buffer_after_minutes,
    actor_user_id, nullif(trim(coalesce(client_notes, '')), '')
  ) returning id into new_booking_id;
  return new_booking_id;
exception
  when no_data_found then raise exception 'An active assigned coach is required';
  when exclusion_violation then raise exception 'That time was just booked. Choose another time.';
end;
$$;

create or replace function public.reschedule_client_booking(target_booking_id uuid, target_starts_at timestamptz, target_duration smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor_user_id uuid := (select auth.uid()); target public.bookings%rowtype; target_ends_at timestamptz; settings public.organization_session_settings%rowtype;
begin
  select * into strict target from public.bookings where id = target_booking_id for update;
  if target.client_user_id <> actor_user_id
    or not private.has_active_role(target.organization_id, array['client']::public.organization_role[])
    or target.status <> 'scheduled' then raise exception 'Booking is not available'; end if;
  settings := private.effective_schedule_settings(target.organization_id);
  if target.starts_at < now() + make_interval(mins => settings.cancellation_cutoff_minutes)
    then raise exception 'The rescheduling cutoff has passed'; end if;
  target_ends_at := target_starts_at + make_interval(mins => target_duration);
  if not private.booking_slot_is_available(target.organization_id, target.coach_user_id, actor_user_id, target_starts_at, target_ends_at, target.id)
  then raise exception 'That time is not available'; end if;
  update public.bookings set starts_at = target_starts_at, ends_at = target_ends_at,
    buffer_before_minutes = settings.buffer_before_minutes,
    buffer_after_minutes = settings.buffer_after_minutes
  where id = target.id;
exception
  when no_data_found then raise exception 'Booking is not available';
  when exclusion_violation then raise exception 'That time was just booked. Choose another time.';
end;
$$;

create or replace function public.cancel_client_booking(target_booking_id uuid, reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor_user_id uuid := (select auth.uid()); target public.bookings%rowtype; cutoff integer;
begin
  select * into strict target from public.bookings where id = target_booking_id for update;
  if target.client_user_id <> actor_user_id
    or not private.has_active_role(target.organization_id, array['client']::public.organization_role[])
    or target.status <> 'scheduled' then raise exception 'Booking is not available'; end if;
  cutoff := (private.effective_schedule_settings(target.organization_id)).cancellation_cutoff_minutes;
  if target.starts_at < now() + make_interval(mins => cutoff) then raise exception 'The cancellation cutoff has passed'; end if;
  update public.bookings set status = 'cancelled', cancelled_at = now(), cancellation_reason = nullif(trim(coalesce(reason, '')), '')
    where id = target_booking_id;
exception when no_data_found then raise exception 'Booking is not available';
end;
$$;

-- Intake appointments share all existing authorization, collision and cancellation rules.
-- The caller can choose only the kind of its newly created, server-authorized booking.
create function public.create_staff_appointment(
  target_client_user_id uuid, target_coach_user_id uuid, target_starts_at timestamptz,
  target_duration smallint, appointment_kind text, staff_notes text default null
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare booking_id uuid;
begin
  if appointment_kind is null or appointment_kind not in ('intake', 'training') then raise exception 'Choose a valid appointment type'; end if;
  booking_id := public.create_staff_booking(target_client_user_id, target_coach_user_id, target_starts_at, target_duration, staff_notes);
  if appointment_kind = 'intake' then
    update public.bookings set session_type = 'Intake' where id = booking_id;
  end if;
  return booking_id;
end;
$$;

revoke all on function private.effective_schedule_settings(uuid) from public, anon, authenticated;
revoke all on function private.effective_coach_windows(uuid, uuid, date, text) from public, anon, authenticated;
revoke all on function private.booking_slot_permitted(uuid, uuid, uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.get_staff_booking_calendar(uuid, uuid, date, smallint) from public, anon, authenticated;
revoke all on function public.get_client_booking_calendar(date, smallint) from public, anon, authenticated;
revoke all on function public.create_staff_appointment(uuid, uuid, timestamptz, smallint, text, text) from public, anon, authenticated;
grant execute on function public.get_staff_booking_calendar(uuid, uuid, date, smallint) to authenticated;
grant execute on function public.get_client_booking_calendar(date, smallint) to authenticated;
grant execute on function public.create_staff_appointment(uuid, uuid, timestamptz, smallint, text, text) to authenticated;
