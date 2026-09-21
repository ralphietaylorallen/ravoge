create extension if not exists btree_gist with schema extensions;

create type public.booking_status as enum ('scheduled', 'completed', 'cancelled', 'no_show');
create type public.availability_exception_kind as enum ('unavailable', 'personal_block', 'vacation', 'available_override');
create type public.booking_event_type as enum ('booked', 'rescheduled', 'cancelled', 'completed', 'no_show');
create type public.email_delivery_status as enum ('pending', 'sent', 'failed', 'skipped');

alter table public.organizations
  add column timezone text not null default 'America/Denver',
  add column address text;

create function private.is_valid_timezone(value text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = value);
$$;

alter table public.organizations
  add constraint organizations_timezone_check check (private.is_valid_timezone(timezone)),
  add constraint organizations_address_length_check check (address is null or char_length(address) <= 500);

create table public.organization_hours (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  is_closed boolean not null default false,
  opens_at time,
  closes_at time,
  updated_by uuid not null references auth.users (id) on delete restrict,
  updated_at timestamptz not null default now(),
  primary key (organization_id, day_of_week),
  check (
    (is_closed and opens_at is null and closes_at is null)
    or (not is_closed and opens_at is not null and closes_at is not null and opens_at < closes_at)
  )
);

create table public.organization_special_hours (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  local_date date not null,
  label text not null default 'Special hours' check (char_length(trim(label)) between 2 and 120),
  is_closed boolean not null default true,
  opens_at time,
  closes_at time,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, local_date),
  check (
    (is_closed and opens_at is null and closes_at is null)
    or (not is_closed and opens_at is not null and closes_at is not null and opens_at < closes_at)
  )
);

create table public.organization_session_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  default_duration_minutes smallint not null default 60,
  permitted_durations smallint[] not null default array[30,45,60,90]::smallint[],
  slot_increment_minutes smallint not null default 15,
  minimum_notice_minutes integer not null default 120,
  maximum_advance_days smallint not null default 60,
  cancellation_cutoff_minutes integer not null default 720,
  buffer_before_minutes smallint not null default 0,
  buffer_after_minutes smallint not null default 0,
  updated_by uuid not null references auth.users (id) on delete restrict,
  updated_at timestamptz not null default now(),
  check (default_duration_minutes = any(permitted_durations)),
  check (cardinality(permitted_durations) between 1 and 8),
  check (permitted_durations <@ array[15,30,45,60,75,90,105,120]::smallint[]),
  check (slot_increment_minutes between 5 and 60),
  check (minimum_notice_minutes between 0 and 10080),
  check (maximum_advance_days between 1 and 365),
  check (cancellation_cutoff_minutes between 0 and 43200),
  check (buffer_before_minutes between 0 and 120),
  check (buffer_after_minutes between 0 and 120)
);

create table public.coach_availability (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  coach_user_id uuid not null references auth.users (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  availability_span int8range not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, coach_user_id)
    references public.organization_memberships (organization_id, user_id)
    on delete cascade,
  check (starts_at < ends_at)
);

alter table public.coach_availability
  add constraint coach_availability_no_overlap
  exclude using gist (
    organization_id with =,
    coach_user_id with =,
    day_of_week with =,
    availability_span with &&
  );

create table public.coach_availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  coach_user_id uuid not null references auth.users (id) on delete cascade,
  kind public.availability_exception_kind not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  label text check (label is null or char_length(label) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, coach_user_id)
    references public.organization_memberships (organization_id, user_id)
    on delete cascade,
  check (starts_at < ends_at)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  coach_user_id uuid not null references auth.users (id) on delete restrict,
  client_user_id uuid not null references auth.users (id) on delete restrict,
  session_type text not null default 'Private training' check (char_length(trim(session_type)) between 2 and 120),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null,
  buffer_before_minutes smallint not null default 0 check (buffer_before_minutes between 0 and 120),
  buffer_after_minutes smallint not null default 0 check (buffer_after_minutes between 0 and 120),
  blocked_span tstzrange not null,
  status public.booking_status not null default 'scheduled',
  booked_by uuid not null references auth.users (id) on delete restrict,
  notes text check (notes is null or char_length(notes) <= 1000),
  cancelled_at timestamptz,
  cancellation_reason text check (cancellation_reason is null or char_length(cancellation_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, coach_user_id)
    references public.organization_memberships (organization_id, user_id)
    on delete restrict,
  foreign key (organization_id, client_user_id)
    references public.organization_memberships (organization_id, user_id)
    on delete restrict,
  check (starts_at < ends_at),
  check (private.is_valid_timezone(timezone)),
  check ((status = 'cancelled') = (cancelled_at is not null))
);

alter table public.bookings
  add constraint bookings_coach_no_overlap
  exclude using gist (
    coach_user_id with =,
    blocked_span with &&
  ) where (status = 'scheduled'),
  add constraint bookings_client_no_overlap
  exclude using gist (
    client_user_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status = 'scheduled');

create table public.booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_user_id uuid not null references auth.users (id) on delete restrict,
  event_type public.booking_event_type not null,
  previous_starts_at timestamptz,
  previous_ends_at timestamptz,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.booking_status not null,
  created_at timestamptz not null default now()
);

create table public.booking_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_type public.booking_event_type not null check (event_type in ('booked','rescheduled','cancelled')),
  recipient_user_id uuid not null references auth.users (id) on delete restrict,
  status public.email_delivery_status not null default 'pending',
  provider text,
  provider_message_id text,
  error_message text check (error_message is null or char_length(error_message) <= 1000),
  created_at timestamptz not null default now(),
  attempted_at timestamptz,
  unique (booking_id, event_type, created_at)
);

create index organization_special_hours_org_date_idx on public.organization_special_hours (organization_id, local_date);
create index coach_availability_org_coach_day_idx on public.coach_availability (organization_id, coach_user_id, day_of_week);
create index coach_availability_exceptions_org_coach_time_idx on public.coach_availability_exceptions (organization_id, coach_user_id, starts_at, ends_at);
create index bookings_org_time_idx on public.bookings (organization_id, starts_at, coach_user_id);
create index bookings_coach_time_idx on public.bookings (coach_user_id, starts_at) where status = 'scheduled';
create index bookings_client_time_idx on public.bookings (client_user_id, starts_at);
create index booking_events_booking_created_idx on public.booking_events (booking_id, created_at desc);
create index booking_email_deliveries_booking_status_idx on public.booking_email_deliveries (booking_id, status, created_at desc);

create function private.enforce_schedule_actor_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare target_coach uuid;
begin
  target_coach := case when tg_table_name in ('coach_availability','coach_availability_exceptions') then new.coach_user_id else null end;
  if tg_table_name = 'coach_availability' then
    new.availability_span := int8range(extract(epoch from new.starts_at)::bigint, extract(epoch from new.ends_at)::bigint, '[)');
  end if;
  if tg_op = 'UPDATE' and (
    new.organization_id <> old.organization_id
    or (target_coach is not null and new.coach_user_id <> old.coach_user_id)
  ) then raise exception 'Schedule scope is immutable'; end if;

  if target_coach is not null and not exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = new.organization_id
      and membership.user_id = target_coach
      and membership.role = 'coach'
      and membership.status = 'active'
  ) then raise exception 'An active coach membership is required'; end if;
  return new;
end;
$$;

create function private.enforce_booking_integrity()
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
  if not private.has_active_coach_client_assignment(new.organization_id, new.coach_user_id, new.client_user_id)
    then raise exception 'An active Coach-Client assignment is required'; end if;
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

create trigger coach_availability_enforce_scope before insert or update on public.coach_availability
  for each row execute function private.enforce_schedule_actor_scope();
create trigger coach_availability_exceptions_enforce_scope before insert or update on public.coach_availability_exceptions
  for each row execute function private.enforce_schedule_actor_scope();
create trigger bookings_enforce_integrity before insert or update on public.bookings
  for each row execute function private.enforce_booking_integrity();

create trigger organization_hours_set_updated_at before update on public.organization_hours
  for each row execute function private.set_updated_at();
create trigger organization_special_hours_set_updated_at before update on public.organization_special_hours
  for each row execute function private.set_updated_at();
create trigger organization_session_settings_set_updated_at before update on public.organization_session_settings
  for each row execute function private.set_updated_at();
create trigger coach_availability_set_updated_at before update on public.coach_availability
  for each row execute function private.set_updated_at();
create trigger coach_availability_exceptions_set_updated_at before update on public.coach_availability_exceptions
  for each row execute function private.set_updated_at();
create trigger bookings_set_updated_at before update on public.bookings
  for each row execute function private.set_updated_at();

create function private.booking_slot_is_available(
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

  if not private.has_active_coach_client_assignment(target_organization_id, target_coach_user_id, target_client_user_id) then return false; end if;
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

  return true;
exception when no_data_found then return false;
end;
$$;

create function public.get_client_booking_availability(target_date date, target_duration smallint)
returns table (starts_at timestamptz, ends_at timestamptz, coach_user_id uuid, timezone text)
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
  select * into strict settings from public.organization_session_settings where organization_id = actor_organization_id;
  if not (target_duration = any(settings.permitted_durations)) then return; end if;

  for availability_window in
    select availability.starts_at, availability.ends_at
    from public.coach_availability availability
    where availability.organization_id = actor_organization_id
      and availability.coach_user_id = assigned_coach_id
      and availability.day_of_week = extract(dow from target_date)::smallint
    union all
    select (exception.starts_at at time zone organization_timezone)::time,
           (exception.ends_at at time zone organization_timezone)::time
    from public.coach_availability_exceptions exception
    where exception.organization_id = actor_organization_id
      and exception.coach_user_id = assigned_coach_id
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
        and private.booking_slot_is_available(actor_organization_id, assigned_coach_id, actor_user_id, candidate_start, candidate_end, null)
      then
        starts_at := candidate_start;
        ends_at := candidate_end;
        coach_user_id := assigned_coach_id;
        timezone := organization_timezone;
        return next;
      end if;
    end loop;
  end loop;
end;
$$;

create function private.log_booking_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare event_kind public.booking_event_type;
begin
  if tg_op = 'INSERT' then event_kind := 'booked';
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then event_kind := 'cancelled';
  elsif new.starts_at <> old.starts_at or new.ends_at <> old.ends_at then event_kind := 'rescheduled';
  elsif new.status = 'completed' and old.status <> 'completed' then event_kind := 'completed';
  elsif new.status = 'no_show' and old.status <> 'no_show' then event_kind := 'no_show';
  else return new; end if;

  insert into public.booking_events (
    booking_id, organization_id, actor_user_id, event_type,
    previous_starts_at, previous_ends_at, starts_at, ends_at, status
  ) values (
    new.id, new.organization_id, coalesce((select auth.uid()), new.booked_by), event_kind,
    case when tg_op = 'UPDATE' then old.starts_at else null end,
    case when tg_op = 'UPDATE' then old.ends_at else null end,
    new.starts_at, new.ends_at, new.status
  );
  if event_kind in ('booked','rescheduled','cancelled') then
    insert into public.booking_email_deliveries (
      booking_id, organization_id, event_type, recipient_user_id
    ) values (new.id, new.organization_id, event_kind, new.client_user_id);
  end if;
  return new;
end;
$$;

create trigger bookings_log_event after insert or update on public.bookings
  for each row execute function private.log_booking_event();

create function public.create_client_booking(target_starts_at timestamptz, target_duration smallint, client_notes text default null)
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
  select * into strict settings from public.organization_session_settings where organization_id = actor_organization_id;
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

create function public.cancel_client_booking(target_booking_id uuid, reason text default null)
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
  select cancellation_cutoff_minutes into cutoff from public.organization_session_settings where organization_id = target.organization_id;
  if target.starts_at < now() + make_interval(mins => cutoff) then raise exception 'The cancellation cutoff has passed'; end if;
  update public.bookings set status = 'cancelled', cancelled_at = now(), cancellation_reason = nullif(trim(coalesce(reason, '')), '')
    where id = target_booking_id;
exception when no_data_found then raise exception 'Booking is not available';
end;
$$;

create function public.reschedule_client_booking(target_booking_id uuid, target_starts_at timestamptz, target_duration smallint)
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
  select * into strict settings from public.organization_session_settings where organization_id = target.organization_id;
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

create function public.finalize_own_booking_email_delivery(
  target_delivery_id uuid,
  delivery_status public.email_delivery_status,
  delivery_provider text,
  delivery_provider_message_id text default null,
  delivery_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if delivery_status not in ('sent','failed','skipped') then raise exception 'Invalid delivery status'; end if;
  update public.booking_email_deliveries delivery
  set status = delivery_status,
      provider = left(delivery_provider, 80),
      provider_message_id = nullif(left(coalesce(delivery_provider_message_id, ''), 200), ''),
      error_message = nullif(left(coalesce(delivery_error, ''), 1000), ''),
      attempted_at = now()
  from public.bookings booking
  where delivery.id = target_delivery_id
    and booking.id = delivery.booking_id
    and booking.client_user_id = (select auth.uid())
    and delivery.status = 'pending';
  if not found then raise exception 'Email delivery is not available'; end if;
end;
$$;

alter table public.organization_hours enable row level security;
alter table public.organization_special_hours enable row level security;
alter table public.organization_session_settings enable row level security;
alter table public.coach_availability enable row level security;
alter table public.coach_availability_exceptions enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_events enable row level security;
alter table public.booking_email_deliveries enable row level security;

create policy organization_hours_select_members on public.organization_hours for select to authenticated
  using ((select private.has_active_role(organization_id, array['owner','coach','client']::public.organization_role[])));
create policy organization_hours_all_owner on public.organization_hours for all to authenticated
  using ((select private.has_active_role(organization_id, array['owner']::public.organization_role[])))
  with check (updated_by = (select auth.uid()) and (select private.has_active_role(organization_id, array['owner']::public.organization_role[])));
create policy organization_special_hours_select_members on public.organization_special_hours for select to authenticated
  using ((select private.has_active_role(organization_id, array['owner','coach','client']::public.organization_role[])));
create policy organization_special_hours_insert_owner on public.organization_special_hours for insert to authenticated
  with check (created_by = (select auth.uid()) and (select private.has_active_role(organization_id, array['owner']::public.organization_role[])));
create policy organization_special_hours_update_owner on public.organization_special_hours for update to authenticated
  using ((select private.has_active_role(organization_id, array['owner']::public.organization_role[])))
  with check ((select private.has_active_role(organization_id, array['owner']::public.organization_role[])));
create policy organization_special_hours_delete_owner on public.organization_special_hours for delete to authenticated
  using ((select private.has_active_role(organization_id, array['owner']::public.organization_role[])));
create policy organization_session_settings_select_members on public.organization_session_settings for select to authenticated
  using ((select private.has_active_role(organization_id, array['owner','coach','client']::public.organization_role[])));
create policy organization_session_settings_all_owner on public.organization_session_settings for all to authenticated
  using ((select private.has_active_role(organization_id, array['owner']::public.organization_role[])))
  with check (updated_by = (select auth.uid()) and (select private.has_active_role(organization_id, array['owner']::public.organization_role[])));

create policy coach_availability_select_authorized on public.coach_availability for select to authenticated
  using ((select private.has_active_role(organization_id, array['owner']::public.organization_role[]))
    or (coach_user_id = (select auth.uid()) and (select private.has_active_role(organization_id, array['coach']::public.organization_role[]))));
create policy coach_availability_all_authorized on public.coach_availability for all to authenticated
  using ((select private.has_active_role(organization_id, array['owner']::public.organization_role[]))
    or (coach_user_id = (select auth.uid()) and (select private.has_active_role(organization_id, array['coach']::public.organization_role[]))))
  with check ((select private.has_active_role(organization_id, array['owner']::public.organization_role[]))
    or (coach_user_id = (select auth.uid()) and (select private.has_active_role(organization_id, array['coach']::public.organization_role[]))));
create policy coach_availability_exceptions_select_authorized on public.coach_availability_exceptions for select to authenticated
  using ((select private.has_active_role(organization_id, array['owner']::public.organization_role[]))
    or (coach_user_id = (select auth.uid()) and (select private.has_active_role(organization_id, array['coach']::public.organization_role[]))));
create policy coach_availability_exceptions_all_authorized on public.coach_availability_exceptions for all to authenticated
  using ((select private.has_active_role(organization_id, array['owner']::public.organization_role[]))
    or (coach_user_id = (select auth.uid()) and (select private.has_active_role(organization_id, array['coach']::public.organization_role[]))))
  with check ((select private.has_active_role(organization_id, array['owner']::public.organization_role[]))
    or (coach_user_id = (select auth.uid()) and (select private.has_active_role(organization_id, array['coach']::public.organization_role[]))));

create policy bookings_select_authorized on public.bookings for select to authenticated
  using ((select private.has_active_role(organization_id, array['owner']::public.organization_role[]))
    or (coach_user_id = (select auth.uid()) and (select private.has_active_role(organization_id, array['coach']::public.organization_role[])))
    or (client_user_id = (select auth.uid()) and (select private.has_active_role(organization_id, array['client']::public.organization_role[]))));
create policy booking_events_select_authorized on public.booking_events for select to authenticated
  using (exists (select 1 from public.bookings booking where booking.id = booking_id));
create policy booking_email_deliveries_select_client on public.booking_email_deliveries for select to authenticated
  using (recipient_user_id = (select auth.uid()) and (select private.has_active_role(organization_id, array['client']::public.organization_role[])));

revoke all on public.organization_hours, public.organization_special_hours, public.organization_session_settings,
  public.coach_availability, public.coach_availability_exceptions, public.bookings, public.booking_events,
  public.booking_email_deliveries from anon, authenticated;
grant select, insert, update, delete on public.organization_hours, public.organization_special_hours,
  public.organization_session_settings, public.coach_availability, public.coach_availability_exceptions to authenticated;
grant select on public.bookings, public.booking_events, public.booking_email_deliveries to authenticated;

revoke all on function public.get_client_booking_availability(date, smallint) from public, anon, authenticated;
revoke all on function public.create_client_booking(timestamptz, smallint, text) from public, anon, authenticated;
revoke all on function public.cancel_client_booking(uuid, text) from public, anon, authenticated;
revoke all on function public.reschedule_client_booking(uuid, timestamptz, smallint) from public, anon, authenticated;
revoke all on function public.finalize_own_booking_email_delivery(uuid, public.email_delivery_status, text, text, text) from public, anon, authenticated;
grant execute on function public.get_client_booking_availability(date, smallint) to authenticated;
grant execute on function public.create_client_booking(timestamptz, smallint, text) to authenticated;
grant execute on function public.cancel_client_booking(uuid, text) to authenticated;
grant execute on function public.reschedule_client_booking(uuid, timestamptz, smallint) to authenticated;
grant execute on function public.finalize_own_booking_email_delivery(uuid, public.email_delivery_status, text, text, text) to authenticated;

revoke all on function private.is_valid_timezone(text) from public, anon, authenticated;
revoke all on function private.enforce_schedule_actor_scope() from public, anon, authenticated;
revoke all on function private.enforce_booking_integrity() from public, anon, authenticated;
revoke all on function private.booking_slot_is_available(uuid, uuid, uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke all on function private.log_booking_event() from public, anon, authenticated;
grant execute on function private.is_valid_timezone(text) to authenticated;

grant update (timezone, address) on public.organizations to authenticated;

comment on table public.bookings is 'Single source of truth for owner, coach, and client schedule views.';
comment on function public.create_client_booking(timestamptz, smallint, text) is
  'Derives organization, client, and assigned coach from auth context and revalidates availability atomically.';
