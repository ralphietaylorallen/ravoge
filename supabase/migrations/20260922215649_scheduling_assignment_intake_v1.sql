-- V1 keeps the existing Client booking RPCs and collision constraints. Staff
-- operations below use the same availability rules and the same bookings table.
create or replace function private.booking_slot_is_available(
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
  select * into strict settings from public.organization_session_settings where organization_id = target_organization_id;

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
  if not found or gym_closed or local_start::time < gym_open or local_end::time > gym_close then return false; end if;

  if not (
    exists (
      select 1 from public.coach_availability availability
      where availability.organization_id = target_organization_id
        and availability.coach_user_id = target_coach_user_id
        and availability.day_of_week = extract(dow from local_day)::smallint
        and local_start::time >= availability.starts_at
        and local_end::time <= availability.ends_at
    )
    or exists (
      select 1 from public.coach_availability_exceptions exception
      where exception.organization_id = target_organization_id
        and exception.coach_user_id = target_coach_user_id
        and exception.kind = 'available_override'
        and target_starts_at >= exception.starts_at
        and target_ends_at <= exception.ends_at
    )
  ) then return false; end if;

  if exists (
    select 1 from public.coach_availability_exceptions exception
    where exception.organization_id = target_organization_id
      and exception.coach_user_id = target_coach_user_id
      and exception.kind in ('unavailable','personal_block','vacation')
      and tstzrange(exception.starts_at, exception.ends_at, '[)') && tstzrange(target_starts_at, target_ends_at, '[)')
  ) then return false; end if;

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
exception when no_data_found then return false;
end;
$$;

-- An Owner may book an active Coach for any active Client without silently
-- changing that Client's primary assignment. Only the staff booking RPC can
-- create this exception; the direct bookings table remains read-only.
create or replace function private.enforce_booking_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare organization_timezone text;
begin
  if tg_op = 'UPDATE' and (
    new.organization_id <> old.organization_id
    or new.coach_user_id <> old.coach_user_id
    or new.client_user_id <> old.client_user_id
    or new.booked_by <> old.booked_by
    or new.timezone <> old.timezone
  ) then raise exception 'Booking identity and organization are immutable'; end if;
  if new.status = 'scheduled'
    and not private.has_active_coach_client_assignment(new.organization_id, new.coach_user_id, new.client_user_id)
    and not exists (
      select 1 from public.organization_memberships booked_by
      where booked_by.organization_id = new.organization_id
        and booked_by.user_id = new.booked_by
        and booked_by.role = 'owner'
    ) then raise exception 'An active Coach-Client assignment or Owner booking is required'; end if;
  select organization.timezone into strict organization_timezone from public.organizations organization
    where organization.id = new.organization_id and organization.status = 'active';
  if new.timezone <> organization_timezone then raise exception 'Booking timezone must match the organization'; end if;
  new.blocked_span := tstzrange(
    new.starts_at - make_interval(mins => new.buffer_before_minutes),
    new.ends_at + make_interval(mins => new.buffer_after_minutes),
    '[)'
  );
  return new;
exception when no_data_found then raise exception 'An active organization is required';
end;
$$;

create function public.list_unassigned_clients_for_coach()
returns table (client_user_id uuid, full_name text, preferred_name text, avatar_path text, account_status text)
language plpgsql stable security definer set search_path = ''
as $$
declare actor_organization_id uuid;
begin
  select membership.organization_id into strict actor_organization_id
  from public.organization_memberships membership
  join public.organizations organization on organization.id = membership.organization_id and organization.status = 'active'
  join public.profiles actor on actor.id = membership.user_id and actor.account_status = 'active'
  where membership.user_id = (select auth.uid()) and membership.role = 'coach' and membership.status = 'active';
  return query
  select client.user_id, profile.full_name, profile.preferred_name, profile.avatar_path, profile.account_status::text
  from public.organization_memberships client
  join public.profiles profile on profile.id = client.user_id and profile.account_status = 'active'
  where client.organization_id = actor_organization_id and client.role = 'client' and client.status = 'active'
    and not exists (
      select 1 from public.coach_client_assignments assignment
      where assignment.organization_id = actor_organization_id and assignment.client_user_id = client.user_id
        and assignment.status = 'active'
    )
  order by profile.full_name, client.user_id;
exception when no_data_found then raise exception 'An active Coach membership is required';
end;
$$;

create function public.claim_unassigned_client(target_client_user_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare actor_user_id uuid := (select auth.uid()); actor_organization_id uuid; claimed_id uuid;
begin
  if actor_user_id is null or target_client_user_id is null then raise exception 'A valid Coach and Client are required'; end if;
  select membership.organization_id into strict actor_organization_id
  from public.organization_memberships membership
  join public.organizations organization on organization.id = membership.organization_id and organization.status = 'active'
  join public.profiles profile on profile.id = membership.user_id and profile.account_status = 'active'
  where membership.user_id = actor_user_id and membership.role = 'coach' and membership.status = 'active';
  perform 1 from public.organization_memberships client
  join public.profiles profile on profile.id = client.user_id and profile.account_status = 'active'
  where client.organization_id = actor_organization_id and client.user_id = target_client_user_id
    and client.role = 'client' and client.status = 'active'
  for update of client;
  if not found then raise exception 'An active unassigned Client in this gym is required'; end if;
  if exists (
    select 1 from public.coach_client_assignments assignment
    where assignment.organization_id = actor_organization_id and assignment.client_user_id = target_client_user_id
      and assignment.status = 'active'
  ) then raise exception 'This Client already has a Coach. Ask an Owner to reassign them.'; end if;
  insert into public.coach_client_assignments (organization_id, coach_user_id, client_user_id, status)
  values (actor_organization_id, actor_user_id, target_client_user_id, 'active')
  on conflict (organization_id, coach_user_id, client_user_id) do update set status = 'active'
  returning id into claimed_id;
  return claimed_id;
exception when no_data_found then raise exception 'An active Coach membership is required';
end;
$$;

-- Primary assignment mutations must be serialized by the two constrained
-- RPCs. A direct Coach update could otherwise deactivate their own assignment
-- and make a previously assigned Client appear claimable to another Coach.
revoke insert, update on public.coach_client_assignments from authenticated;

create function public.get_staff_booking_availability(
  target_client_user_id uuid,
  target_coach_user_id uuid,
  target_date date,
  target_duration smallint
)
returns table (starts_at timestamptz, ends_at timestamptz, coach_user_id uuid, timezone text)
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
  select * into strict settings from public.organization_session_settings where organization_id = actor_organization_id;
  if not (target_duration = any(settings.permitted_durations)) then return; end if;

  for availability_window in
    select availability.starts_at, availability.ends_at
    from public.coach_availability availability
    where availability.organization_id = actor_organization_id
      and availability.coach_user_id = target_coach_user_id
      and availability.day_of_week = extract(dow from target_date)::smallint
    union all
    select (exception.starts_at at time zone organization_timezone)::time,
           (exception.ends_at at time zone organization_timezone)::time
    from public.coach_availability_exceptions exception
    where exception.organization_id = actor_organization_id
      and exception.coach_user_id = target_coach_user_id
      and exception.kind = 'available_override'
      and (exception.starts_at at time zone organization_timezone)::date = target_date
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
        and private.booking_slot_is_available(
          actor_organization_id, target_coach_user_id, target_client_user_id,
          candidate_start, candidate_end, null
        )
      then
        starts_at := candidate_start;
        ends_at := candidate_end;
        coach_user_id := target_coach_user_id;
        timezone := organization_timezone;
        returned_slots := array_append(returned_slots, candidate_start);
        return next;
      end if;
    end loop;
  end loop;
exception when no_data_found then raise exception 'An active staff membership and session settings are required';
end;
$$;

create function public.create_staff_booking(
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
  select * into strict settings from public.organization_session_settings where organization_id = actor_organization_id;
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

create function public.reschedule_staff_booking(
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
  select * into strict settings from public.organization_session_settings where organization_id = target.organization_id;
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

create function public.cancel_staff_booking(target_booking_id uuid, reason text default null)
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
    select cancellation_cutoff_minutes into strict cutoff from public.organization_session_settings
    where organization_id = target.organization_id;
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

-- Keep legacy avatar paths readable while all new uploads use a unique,
-- immutable object. This prevents stale signed URLs and browser caches.
alter table public.profiles drop constraint profiles_avatar_path_check;
alter table public.profiles add constraint profiles_avatar_path_check check (
  avatar_path is null or avatar_path ~
    '^[0-9a-f-]{36}/[0-9a-f-]{36}/avatar(\.(jpg|png|webp)|/[0-9a-f-]{36}\.webp)$'
);

create or replace function private.can_write_profile_asset(asset_name text)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare path_organization_id uuid; path_user_id uuid;
begin
  if asset_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/avatar(\.(jpg|png|webp)|/[0-9a-f-]{36}\.webp)$'
    then return false; end if;
  path_organization_id := split_part(asset_name, '/', 1)::uuid;
  path_user_id := split_part(asset_name, '/', 2)::uuid;
  if path_user_id <> (select auth.uid()) then return false; end if;
  if path_organization_id = '00000000-0000-0000-0000-000000000000'::uuid then
    return exists (
      select 1 from public.profiles profile
      where profile.id = path_user_id and profile.account_status = 'active'
        and profile.account_type in ('coach','client')
    ) and not exists (
      select 1 from public.organization_memberships membership
      where membership.user_id = path_user_id and membership.status = 'active'
    );
  end if;
  return private.has_active_role(path_organization_id, array['owner','coach','client']::public.organization_role[]);
exception when invalid_text_representation then return false;
end;
$$;

create or replace function private.can_read_profile_asset(asset_name text)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare path_organization_id uuid; path_user_id uuid;
begin
  if asset_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/avatar(\.(jpg|png|webp)|/[0-9a-f-]{36}\.webp)$'
    then return false; end if;
  path_organization_id := split_part(asset_name, '/', 1)::uuid;
  path_user_id := split_part(asset_name, '/', 2)::uuid;
  if path_organization_id = '00000000-0000-0000-0000-000000000000'::uuid then
    return private.can_view_profile(path_user_id);
  end if;
  return exists (
    select 1 from public.organization_memberships membership
    join public.organizations organization on organization.id = membership.organization_id
    join public.profiles profile on profile.id = membership.user_id
    where membership.organization_id = path_organization_id
      and membership.user_id = path_user_id and membership.status = 'active'
      and organization.status = 'active' and profile.account_status = 'active'
  ) and (
    private.can_view_profile(path_user_id)
    or (
      private.has_active_role(path_organization_id, array['coach']::public.organization_role[])
      and exists (
        select 1 from public.organization_memberships client
        where client.organization_id = path_organization_id and client.user_id = path_user_id
          and client.role = 'client' and client.status = 'active'
          and not exists (
            select 1 from public.coach_client_assignments assignment
            where assignment.organization_id = path_organization_id and assignment.client_user_id = path_user_id
              and assignment.status = 'active'
          )
      )
    )
  );
exception when invalid_text_representation then return false;
end;
$$;

create function private.enforce_profile_avatar_owner()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare path_organization_id uuid;
begin
  if new.avatar_path is not distinct from old.avatar_path or new.avatar_path is null then return new; end if;
  if split_part(new.avatar_path, '/', 2) <> new.id::text then
    raise exception 'A profile photo must belong to its profile identity';
  end if;
  path_organization_id := split_part(new.avatar_path, '/', 1)::uuid;
  if path_organization_id = '00000000-0000-0000-0000-000000000000'::uuid then
    if new.account_type not in ('coach','client') or exists (
      select 1 from public.organization_memberships membership
      where membership.user_id = new.id and membership.status = 'active'
    ) then raise exception 'An unaffiliated profile photo requires an unaffiliated account'; end if;
  elsif not exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = path_organization_id and membership.user_id = new.id
      and membership.status = 'active'
  ) then raise exception 'The photo organization must match an active membership'; end if;
  return new;
end;
$$;

create trigger profiles_enforce_avatar_owner
  before update of avatar_path on public.profiles
  for each row execute function private.enforce_profile_avatar_owner();

create function public.update_unaffiliated_profile_photo(asset_path text)
returns void language plpgsql security definer set search_path = ''
as $$
declare actor_user_id uuid := (select auth.uid());
begin
  if actor_user_id is null or asset_path !~
    '^00000000-0000-0000-0000-000000000000/[0-9a-f-]{36}/avatar/[0-9a-f-]{36}\.webp$'
    or split_part(asset_path, '/', 2) <> actor_user_id::text
  then raise exception 'An authenticated, self-scoped profile photo is required'; end if;
  if exists (
    select 1 from public.organization_memberships membership
    where membership.user_id = actor_user_id and membership.status = 'active'
  ) then raise exception 'This profile already has a gym membership'; end if;
  update public.profiles set avatar_path = asset_path, avatar_updated_at = now()
  where id = actor_user_id and account_status = 'active' and account_type in ('coach','client');
  if not found then raise exception 'An active Coach or Client profile is required'; end if;
end;
$$;

-- Each baseline belongs to one immutable intake version. No later assessment
-- overwrites the previous version or changes Gate 4 calculation weights.
create table public.client_intake_baselines (
  intake_id uuid primary key,
  organization_id uuid not null,
  client_user_id uuid not null,
  recorded_by uuid not null references auth.users (id) on delete restrict,
  squat_variation text not null check (squat_variation in ('back_squat','front_squat','goblet_squat','other')),
  squat_other_variation text check (squat_other_variation is null or char_length(squat_other_variation) between 2 and 120),
  squat_load_kg numeric(8,2) not null check (squat_load_kg between 0 and 1000),
  squat_reps smallint not null check (squat_reps between 1 and 100),
  squat_one_rm_kg numeric(8,2) not null check (squat_one_rm_kg between 0 and 1000),
  squat_one_rm_method text not null check (squat_one_rm_method in ('tested','estimated')),
  squat_notes text check (squat_notes is null or char_length(squat_notes) <= 1000),
  bench_variation text not null check (char_length(bench_variation) between 2 and 120),
  bench_load_kg numeric(8,2) not null check (bench_load_kg between 0 and 1000),
  bench_reps smallint not null check (bench_reps between 1 and 100),
  bench_one_rm_kg numeric(8,2) not null check (bench_one_rm_kg between 0 and 1000),
  bench_one_rm_method text not null check (bench_one_rm_method in ('tested','estimated')),
  bench_notes text check (bench_notes is null or char_length(bench_notes) <= 1000),
  pullup_strict_reps smallint not null check (pullup_strict_reps between 0 and 100),
  pullup_mode text not null check (pullup_mode in ('bodyweight','assisted','weighted')),
  pullup_adjustment_kg numeric(8,2) check (pullup_adjustment_kg is null or pullup_adjustment_kg between 0 and 300),
  pullup_notes text check (pullup_notes is null or char_length(pullup_notes) <= 1000),
  rower_distance_m integer check (rower_distance_m is null or rower_distance_m between 1 and 100000),
  rower_time_seconds integer check (rower_time_seconds is null or rower_time_seconds between 1 and 86400),
  rower_calories integer check (rower_calories is null or rower_calories between 0 and 100000),
  rower_pace_seconds_per_500m numeric(8,2) check (rower_pace_seconds_per_500m is null or rower_pace_seconds_per_500m between 1 and 3600),
  rower_average_heart_rate smallint check (rower_average_heart_rate is null or rower_average_heart_rate between 30 and 240),
  rower_notes text check (rower_notes is null or char_length(rower_notes) <= 1000),
  versa_duration_seconds integer check (versa_duration_seconds is null or versa_duration_seconds between 1 and 86400),
  versa_feet integer check (versa_feet is null or versa_feet between 1 and 100000),
  versa_calories integer check (versa_calories is null or versa_calories between 0 and 100000),
  versa_average_heart_rate smallint check (versa_average_heart_rate is null or versa_average_heart_rate between 30 and 240),
  versa_notes text check (versa_notes is null or char_length(versa_notes) <= 1000),
  inbody_status text not null check (inbody_status in ('pending','completed')),
  recorded_at timestamptz not null default now(),
  foreign key (intake_id, organization_id, client_user_id)
    references public.client_intakes (id, organization_id, client_user_id) on delete cascade,
  foreign key (organization_id, recorded_by)
    references public.organization_memberships (organization_id, user_id) on delete restrict,
  check (squat_variation <> 'other' or squat_other_variation is not null),
  check ((pullup_mode = 'bodyweight' and pullup_adjustment_kg is null)
    or (pullup_mode <> 'bodyweight' and pullup_adjustment_kg is not null)),
  check ((rower_distance_m is not null and rower_time_seconds is not null)
    or (versa_duration_seconds is not null and versa_feet is not null)),
  check ((rower_distance_m is null) = (rower_time_seconds is null)),
  check ((versa_duration_seconds is null) = (versa_feet is null))
);
create index client_intake_baselines_client_idx
  on public.client_intake_baselines (organization_id, client_user_id, recorded_at desc);

alter table public.client_body_composition_assessments
  add column intake_id uuid,
  add column bmi numeric(5,2) check (bmi is null or bmi between 5 and 100),
  add column visceral_fat_level numeric(6,2) check (visceral_fat_level is null or visceral_fat_level between 0 and 100),
  add column ecw_tbw numeric(5,3) check (ecw_tbw is null or ecw_tbw between 0 and 1),
  add column bmr_kcal integer check (bmr_kcal is null or bmr_kcal between 100 and 10000),
  add constraint client_body_composition_intake_scope_fkey
    foreign key (intake_id, organization_id, client_user_id)
    references public.client_intakes (id, organization_id, client_user_id) on delete cascade,
  add constraint client_body_composition_intake_id_key unique (intake_id);

create function public.save_client_intake_v1(
  target_client_user_id uuid, intake_payload jsonb, baseline_payload jsonb, inbody_payload jsonb
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_intake_id uuid;
  target_organization_id uuid;
  organization_timezone text;
  inbody_status text;
  inbody_date date;
begin
  if actor_user_id is null or jsonb_typeof(baseline_payload) <> 'object'
    or jsonb_typeof(inbody_payload) <> 'object' then
    raise exception 'A structured baseline and InBody status are required';
  end if;
  select membership.organization_id, organization.timezone
  into strict target_organization_id, organization_timezone
  from public.organization_memberships membership
  join public.organizations organization on organization.id = membership.organization_id and organization.status = 'active'
  join public.profiles profile on profile.id = membership.user_id and profile.account_status = 'active'
  where membership.user_id = actor_user_id and membership.role = 'coach' and membership.status = 'active';
  if not private.has_active_coach_client_assignment(target_organization_id, actor_user_id, target_client_user_id)
    then raise exception 'Client is not assigned to this Coach'; end if;
  inbody_status := inbody_payload ->> 'status';
  if inbody_status not in ('pending','completed') or inbody_status is null then
    raise exception 'InBody must be marked pending or completed';
  end if;
  if inbody_status = 'completed' then
    inbody_date := nullif(inbody_payload ->> 'testDate', '')::date;
    if inbody_date is null or nullif(inbody_payload ->> 'weightKg', '') is null
      or nullif(inbody_payload ->> 'inbodyScore', '') is null
      or nullif(inbody_payload ->> 'skeletalMuscleMassKg', '') is null
      or nullif(inbody_payload ->> 'bodyFatMassKg', '') is null
      or nullif(inbody_payload ->> 'bodyFatPercentage', '') is null
      or nullif(inbody_payload ->> 'bmi', '') is null
      or nullif(inbody_payload ->> 'visceralFatLevel', '') is null
      or nullif(inbody_payload ->> 'ecwTbw', '') is null
      or nullif(inbody_payload ->> 'bmrKcal', '') is null
    then raise exception 'A completed InBody needs a date and all baseline measurements'; end if;
  elsif inbody_payload - 'status' <> '{}'::jsonb then
    raise exception 'Pending InBody must not contain fabricated measurements';
  end if;

  -- The existing function creates the immutable intake version and calculates
  -- Gate 4 state. Any later error rolls back that version and state atomically.
  target_intake_id := public.upsert_client_intake(target_client_user_id, intake_payload);
  insert into public.client_intake_baselines (
    intake_id, organization_id, client_user_id, recorded_by,
    squat_variation, squat_other_variation, squat_load_kg, squat_reps,
    squat_one_rm_kg, squat_one_rm_method, squat_notes,
    bench_variation, bench_load_kg, bench_reps, bench_one_rm_kg, bench_one_rm_method, bench_notes,
    pullup_strict_reps, pullup_mode, pullup_adjustment_kg, pullup_notes,
    rower_distance_m, rower_time_seconds, rower_calories, rower_pace_seconds_per_500m,
    rower_average_heart_rate, rower_notes,
    versa_duration_seconds, versa_feet, versa_calories, versa_average_heart_rate, versa_notes,
    inbody_status
  ) values (
    target_intake_id, target_organization_id, target_client_user_id, actor_user_id,
    baseline_payload ->> 'squatVariation', nullif(baseline_payload ->> 'squatOtherVariation', ''),
    (baseline_payload ->> 'squatLoadKg')::numeric, (baseline_payload ->> 'squatReps')::smallint,
    (baseline_payload ->> 'squatOneRmKg')::numeric, baseline_payload ->> 'squatOneRmMethod',
    nullif(baseline_payload ->> 'squatNotes', ''),
    baseline_payload ->> 'benchVariation', (baseline_payload ->> 'benchLoadKg')::numeric,
    (baseline_payload ->> 'benchReps')::smallint, (baseline_payload ->> 'benchOneRmKg')::numeric,
    baseline_payload ->> 'benchOneRmMethod', nullif(baseline_payload ->> 'benchNotes', ''),
    (baseline_payload ->> 'pullupStrictReps')::smallint, baseline_payload ->> 'pullupMode',
    nullif(baseline_payload ->> 'pullupAdjustmentKg', '')::numeric,
    nullif(baseline_payload ->> 'pullupNotes', ''),
    nullif(baseline_payload ->> 'rowerDistanceM', '')::integer,
    nullif(baseline_payload ->> 'rowerTimeSeconds', '')::integer,
    nullif(baseline_payload ->> 'rowerCalories', '')::integer,
    nullif(baseline_payload ->> 'rowerPaceSecondsPer500m', '')::numeric,
    nullif(baseline_payload ->> 'rowerAverageHeartRate', '')::smallint,
    nullif(baseline_payload ->> 'rowerNotes', ''),
    nullif(baseline_payload ->> 'versaDurationSeconds', '')::integer,
    nullif(baseline_payload ->> 'versaFeet', '')::integer,
    nullif(baseline_payload ->> 'versaCalories', '')::integer,
    nullif(baseline_payload ->> 'versaAverageHeartRate', '')::smallint,
    nullif(baseline_payload ->> 'versaNotes', ''),
    inbody_status
  );
  if inbody_status = 'completed' then
    insert into public.client_body_composition_assessments (
      organization_id, client_user_id, recorded_by, intake_id, measured_at,
      weight_kg, inbody_score, skeletal_muscle_mass_kg, body_fat_mass_kg,
      body_fat_percentage, bmi, visceral_fat_level, ecw_tbw, bmr_kcal, source
    ) values (
      target_organization_id, target_client_user_id, actor_user_id, target_intake_id,
      (inbody_date::timestamp + interval '12 hours') at time zone organization_timezone,
      nullif(inbody_payload ->> 'weightKg', '')::numeric,
      nullif(inbody_payload ->> 'inbodyScore', '')::numeric,
      nullif(inbody_payload ->> 'skeletalMuscleMassKg', '')::numeric,
      nullif(inbody_payload ->> 'bodyFatMassKg', '')::numeric,
      nullif(inbody_payload ->> 'bodyFatPercentage', '')::numeric,
      nullif(inbody_payload ->> 'bmi', '')::numeric,
      nullif(inbody_payload ->> 'visceralFatLevel', '')::numeric,
      nullif(inbody_payload ->> 'ecwTbw', '')::numeric,
      nullif(inbody_payload ->> 'bmrKcal', '')::integer,
      'intake_inbody'
    );
  end if;
  update public.client_states set state_values = state_values || jsonb_build_object(
    'baseline_intake_id', target_intake_id, 'inbody_status', inbody_status
  ) where intake_id = target_intake_id;
  return target_intake_id;
exception when no_data_found then raise exception 'An active assigned Coach is required';
end;
$$;

-- Product copy was not present in Ravoge's code, docs, or Git history. Eight
-- exact slots are created with no invented wording or numeric thresholds.
create table public.organization_preworkout_questions (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  position smallint not null check (position between 1 and 8),
  question_text text check (question_text is null or char_length(trim(question_text)) between 5 and 300),
  scale_min numeric(8,2),
  scale_max numeric(8,2),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (organization_id, position),
  check ((question_text is null and scale_min is null and scale_max is null)
    or (question_text is not null and scale_min is not null and scale_max is not null and scale_min < scale_max))
);

insert into public.organization_preworkout_questions (organization_id, position)
select organization.id, positions.position
from public.organizations organization
cross join generate_series(1, 8) as positions(position);

create function private.create_preworkout_question_slots()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.organization_preworkout_questions (organization_id, position)
  select new.id, positions.position from generate_series(1, 8) as positions(position);
  return new;
end;
$$;
create trigger organizations_create_preworkout_question_slots
  after insert on public.organizations for each row
  execute function private.create_preworkout_question_slots();

create function public.configure_preworkout_question(
  target_position smallint, target_text text, target_min numeric, target_max numeric
)
returns void language plpgsql security definer set search_path = ''
as $$
declare actor_user_id uuid := (select auth.uid()); actor_organization_id uuid;
begin
  select membership.organization_id into strict actor_organization_id
  from public.organization_memberships membership
  join public.organizations organization on organization.id = membership.organization_id and organization.status = 'active'
  join public.profiles profile on profile.id = membership.user_id and profile.account_status = 'active'
  where membership.user_id = actor_user_id and membership.role = 'owner' and membership.status = 'active';
  if target_position not between 1 and 8 then raise exception 'Choose a question position from 1 to 8'; end if;
  if target_text is null or trim(target_text) = '' then
    update public.organization_preworkout_questions
      set question_text = null, scale_min = null, scale_max = null,
        updated_by = actor_user_id, updated_at = now()
    where organization_id = actor_organization_id and position = target_position;
  else
    if char_length(trim(target_text)) not between 5 and 300
      or target_min is null or target_max is null or target_min >= target_max
    then raise exception 'Question wording and numeric response range are required'; end if;
    update public.organization_preworkout_questions
      set question_text = trim(target_text), scale_min = target_min, scale_max = target_max,
        updated_by = actor_user_id, updated_at = now()
    where organization_id = actor_organization_id and position = target_position;
  end if;
exception when no_data_found then raise exception 'An active Owner membership is required';
end;
$$;

alter table public.bookings add constraint bookings_id_org_client_key unique (id, organization_id, client_user_id);
alter table public.workout_assignments add constraint workout_assignments_id_org_client_key unique (id, organization_id, client_user_id);

create table public.preworkout_checkins (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_user_id uuid not null,
  booking_id uuid,
  workout_assignment_id uuid,
  completed_at timestamptz not null default now(),
  check (num_nonnulls(booking_id, workout_assignment_id) = 1),
  foreign key (organization_id, client_user_id)
    references public.organization_memberships (organization_id, user_id) on delete cascade,
  foreign key (booking_id, organization_id, client_user_id)
    references public.bookings (id, organization_id, client_user_id) on delete cascade,
  foreign key (workout_assignment_id, organization_id, client_user_id)
    references public.workout_assignments (id, organization_id, client_user_id) on delete cascade
);
create index preworkout_checkins_client_time_idx
  on public.preworkout_checkins (organization_id, client_user_id, completed_at desc);

create table public.preworkout_checkin_answers (
  checkin_id uuid not null references public.preworkout_checkins (id) on delete cascade,
  position smallint not null check (position between 1 and 8),
  question_text text not null check (char_length(trim(question_text)) between 5 and 300),
  answer numeric(8,2) not null,
  normalized_response numeric(6,5) not null check (normalized_response between 0 and 1),
  answered_at timestamptz not null default now(),
  primary key (checkin_id, position)
);

create function public.submit_preworkout_checkin(
  target_booking_id uuid, target_workout_assignment_id uuid, submitted_answers jsonb
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid()); actor_organization_id uuid;
  new_checkin_id uuid; question record; provided record; answered_count integer := 0;
begin
  if num_nonnulls(target_booking_id, target_workout_assignment_id) <> 1
    or jsonb_typeof(submitted_answers) <> 'array' or jsonb_array_length(submitted_answers) <> 8
  then raise exception 'Exactly eight answers tied to one session or workout are required'; end if;
  select membership.organization_id into strict actor_organization_id
  from public.organization_memberships membership
  join public.organizations organization on organization.id = membership.organization_id and organization.status = 'active'
  join public.profiles profile on profile.id = membership.user_id and profile.account_status = 'active'
  where membership.user_id = actor_user_id and membership.role = 'client' and membership.status = 'active';
  if target_booking_id is not null and not exists (
    select 1 from public.bookings booking
    where booking.id = target_booking_id and booking.organization_id = actor_organization_id
      and booking.client_user_id = actor_user_id and booking.status = 'scheduled'
  ) then raise exception 'That session is not available for this Client'; end if;
  if target_workout_assignment_id is not null and not exists (
    select 1 from public.workout_assignments workout
    where workout.id = target_workout_assignment_id and workout.organization_id = actor_organization_id
      and workout.client_user_id = actor_user_id and workout.status in ('assigned','in_progress')
  ) then raise exception 'That workout is not available for this Client'; end if;
  if (select count(*) from public.organization_preworkout_questions configured
      where configured.organization_id = actor_organization_id and configured.question_text is not null) <> 8
  then raise exception 'The eight pre-workout questions are awaiting approved wording and scales'; end if;
  insert into public.preworkout_checkins (organization_id, client_user_id, booking_id, workout_assignment_id)
  values (actor_organization_id, actor_user_id, target_booking_id, target_workout_assignment_id)
  returning id into new_checkin_id;
  for provided in
    select row.position, row.answer
    from jsonb_to_recordset(submitted_answers) as row(position smallint, answer numeric)
  loop
    select configured.position, configured.question_text, configured.scale_min, configured.scale_max
    into strict question
    from public.organization_preworkout_questions configured
    where configured.organization_id = actor_organization_id and configured.position = provided.position;
    if provided.answer is null or provided.answer < question.scale_min or provided.answer > question.scale_max
      then raise exception 'A check-in answer is outside its configured numeric range'; end if;
    insert into public.preworkout_checkin_answers (
      checkin_id, position, question_text, answer, normalized_response
    ) values (
      new_checkin_id, question.position, question.question_text, provided.answer,
      (provided.answer - question.scale_min) / (question.scale_max - question.scale_min)
    );
    answered_count := answered_count + 1;
  end loop;
  if answered_count <> 8 then raise exception 'Every configured question must be answered once'; end if;
  return new_checkin_id;
exception when no_data_found then raise exception 'An active Client membership is required';
end;
$$;

-- Exposed records are readable only through the same active organization and
-- assignment checks as the existing intake/client-domain records. Writes are
-- performed by narrowly authorized, atomic security-definer RPCs above.
alter table public.client_intake_baselines enable row level security;
alter table public.organization_preworkout_questions enable row level security;
alter table public.preworkout_checkins enable row level security;
alter table public.preworkout_checkin_answers enable row level security;

create policy client_intake_baselines_read on public.client_intake_baselines
  for select to authenticated
  using ((select private.can_read_client_domain(organization_id, client_user_id)));
create policy organization_preworkout_questions_read on public.organization_preworkout_questions
  for select to authenticated
  using ((select private.has_active_role(
    organization_id, array['owner','coach','client']::public.organization_role[]
  )) and (question_text is not null or (select private.has_active_role(
    organization_id, array['owner']::public.organization_role[]
  ))));
create policy preworkout_checkins_read on public.preworkout_checkins
  for select to authenticated
  using ((select private.can_read_client_domain(organization_id, client_user_id)));
create policy preworkout_checkin_answers_read on public.preworkout_checkin_answers
  for select to authenticated
  using (exists (
    select 1 from public.preworkout_checkins checkin
    where checkin.id = checkin_id
  ));

revoke all on public.client_intake_baselines, public.organization_preworkout_questions,
  public.preworkout_checkins, public.preworkout_checkin_answers from public, anon, authenticated;
grant select on public.client_intake_baselines, public.organization_preworkout_questions,
  public.preworkout_checkins, public.preworkout_checkin_answers to authenticated;

revoke all on function public.list_unassigned_clients_for_coach() from public, anon, authenticated;
revoke all on function public.claim_unassigned_client(uuid) from public, anon, authenticated;
revoke all on function public.get_staff_booking_availability(uuid, uuid, date, smallint) from public, anon, authenticated;
revoke all on function public.create_staff_booking(uuid, uuid, timestamptz, smallint, text) from public, anon, authenticated;
revoke all on function public.reschedule_staff_booking(uuid, timestamptz, smallint) from public, anon, authenticated;
revoke all on function public.cancel_staff_booking(uuid, text) from public, anon, authenticated;
revoke all on function public.save_client_intake_v1(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.configure_preworkout_question(smallint, text, numeric, numeric) from public, anon, authenticated;
revoke all on function public.submit_preworkout_checkin(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.update_unaffiliated_profile_photo(text) from public, anon, authenticated;
grant execute on function public.list_unassigned_clients_for_coach() to authenticated;
grant execute on function public.claim_unassigned_client(uuid) to authenticated;
grant execute on function public.get_staff_booking_availability(uuid, uuid, date, smallint) to authenticated;
grant execute on function public.create_staff_booking(uuid, uuid, timestamptz, smallint, text) to authenticated;
grant execute on function public.reschedule_staff_booking(uuid, timestamptz, smallint) to authenticated;
grant execute on function public.cancel_staff_booking(uuid, text) to authenticated;
grant execute on function public.save_client_intake_v1(uuid, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.configure_preworkout_question(smallint, text, numeric, numeric) to authenticated;
grant execute on function public.submit_preworkout_checkin(uuid, uuid, jsonb) to authenticated;
grant execute on function public.update_unaffiliated_profile_photo(text) to authenticated;

revoke all on function private.enforce_profile_avatar_owner() from public, anon, authenticated;
revoke all on function private.create_preworkout_question_slots() from public, anon, authenticated;

comment on table public.client_intake_baselines is
  'Versioned measured baseline; one record per immutable intake version. No Gate 4 prescription weights change.';
comment on table public.preworkout_checkins is
  'Historical, session/workout-scoped check-ins; interpretation and Bayesian weights are intentionally deferred.';
