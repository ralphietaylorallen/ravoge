create or replace function public.get_organization_invitation_handoff(invitation_token text)
returns table (
  email text,
  role public.organization_role,
  organization_name text,
  inviter_name text,
  inviter_role public.organization_role,
  expires_at timestamptz,
  account_exists boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select invitation.email,
    invitation.role,
    organization.name,
    coalesce(inviter.preferred_name, inviter.full_name),
    inviter_membership.role,
    invitation.expires_at,
    exists (
      select 1
      from auth.users account
      where lower(account.email) = invitation.email
    )
  from public.organization_invitations invitation
  join public.organizations organization
    on organization.id = invitation.organization_id
   and organization.status = 'active'
  join public.profiles inviter on inviter.id = invitation.invited_by
  join public.organization_memberships inviter_membership
    on inviter_membership.organization_id = invitation.organization_id
   and inviter_membership.user_id = invitation.invited_by
   and inviter_membership.status = 'active'
  where char_length(invitation_token) >= 32
    and invitation.token_hash = encode(extensions.digest(invitation_token, 'sha256'), 'hex')
    and invitation.accepted_at is null
    and invitation.revoked_at is null
    and invitation.expires_at > now()
  limit 1;
$$;

revoke all on function public.get_organization_invitation_handoff(text)
  from public, anon, authenticated;
grant execute on function public.get_organization_invitation_handoff(text)
  to anon, authenticated;

comment on function public.get_organization_invitation_handoff(text) is
  'Resolves a valid opaque invitation for the server-controlled install handoff. Possession grants no membership.';

create or replace function public.save_organization_schedule_settings(
  requested_timezone text,
  requested_address text,
  requested_hours jsonb,
  requested_default_duration smallint,
  requested_permitted_durations smallint[],
  requested_slot_increment smallint,
  requested_minimum_notice integer,
  requested_maximum_advance smallint,
  requested_cancellation_cutoff integer,
  requested_buffer_before smallint,
  requested_buffer_after smallint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_organization_id uuid;
  hour_record record;
begin
  if actor_user_id is null then
    raise exception 'Authentication is required';
  end if;

  select membership.organization_id
  into strict actor_organization_id
  from public.organization_memberships membership
  join public.organizations organization
    on organization.id = membership.organization_id
   and organization.status = 'active'
  where membership.user_id = actor_user_id
    and membership.role = 'owner'
    and membership.status = 'active'
  for update of membership, organization;

  if requested_timezone is null
    or char_length(requested_timezone) > 100
    or not exists (
      select 1 from pg_catalog.pg_timezone_names zone
      where zone.name = requested_timezone
    ) then
    raise exception 'Choose a valid organization timezone';
  end if;
  if requested_address is not null and char_length(requested_address) > 500 then
    raise exception 'The gym address is too long';
  end if;
  if jsonb_typeof(requested_hours) <> 'array'
    or jsonb_array_length(requested_hours) <> 7 then
    raise exception 'Submit exactly seven organization hour records';
  end if;
  if (
    select count(distinct row.day_of_week)
    from jsonb_to_recordset(requested_hours) as row(
      day_of_week smallint,
      is_closed boolean,
      opens_at text,
      closes_at text
    )
  ) <> 7 then
    raise exception 'Organization hours must contain each day exactly once';
  end if;

  for hour_record in
    select row.day_of_week, row.is_closed, row.opens_at, row.closes_at
    from jsonb_to_recordset(requested_hours) as row(
      day_of_week smallint,
      is_closed boolean,
      opens_at text,
      closes_at text
    )
  loop
    if hour_record.day_of_week not between 0 and 6
      or hour_record.is_closed is null then
      raise exception 'Organization hours contain an invalid day';
    end if;
    if hour_record.is_closed then
      if hour_record.opens_at is not null or hour_record.closes_at is not null then
        raise exception 'Closed days cannot contain opening times';
      end if;
    elsif hour_record.opens_at is null
      or hour_record.closes_at is null
      or hour_record.opens_at !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or hour_record.closes_at !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or hour_record.opens_at::time >= hour_record.closes_at::time then
      raise exception 'Every open day needs a valid opening and closing time';
    end if;
  end loop;

  if requested_default_duration is null
    or requested_permitted_durations is null
    or cardinality(requested_permitted_durations) not between 1 and 8
    or not requested_permitted_durations <@ array[15,30,45,60,75,90,105,120]::smallint[]
    or not requested_default_duration = any(requested_permitted_durations)
    or requested_slot_increment not between 5 and 60
    or requested_minimum_notice not between 0 and 10080
    or requested_maximum_advance not between 1 and 365
    or requested_cancellation_cutoff not between 0 and 43200
    or requested_buffer_before not between 0 and 120
    or requested_buffer_after not between 0 and 120 then
    raise exception 'Review the organization session settings';
  end if;

  update public.organizations
  set timezone = requested_timezone,
      address = nullif(trim(requested_address), '')
  where id = actor_organization_id;

  insert into public.organization_hours (
    organization_id, day_of_week, is_closed, opens_at, closes_at, updated_by
  )
  select actor_organization_id,
    row.day_of_week,
    row.is_closed,
    case when row.is_closed then null else row.opens_at::time end,
    case when row.is_closed then null else row.closes_at::time end,
    actor_user_id
  from jsonb_to_recordset(requested_hours) as row(
    day_of_week smallint,
    is_closed boolean,
    opens_at text,
    closes_at text
  )
  on conflict (organization_id, day_of_week) do update
  set is_closed = excluded.is_closed,
      opens_at = excluded.opens_at,
      closes_at = excluded.closes_at,
      updated_by = actor_user_id;

  insert into public.organization_session_settings (
    organization_id,
    default_duration_minutes,
    permitted_durations,
    slot_increment_minutes,
    minimum_notice_minutes,
    maximum_advance_days,
    cancellation_cutoff_minutes,
    buffer_before_minutes,
    buffer_after_minutes,
    updated_by
  ) values (
    actor_organization_id,
    requested_default_duration,
    requested_permitted_durations,
    requested_slot_increment,
    requested_minimum_notice,
    requested_maximum_advance,
    requested_cancellation_cutoff,
    requested_buffer_before,
    requested_buffer_after,
    actor_user_id
  )
  on conflict (organization_id) do update
  set default_duration_minutes = excluded.default_duration_minutes,
      permitted_durations = excluded.permitted_durations,
      slot_increment_minutes = excluded.slot_increment_minutes,
      minimum_notice_minutes = excluded.minimum_notice_minutes,
      maximum_advance_days = excluded.maximum_advance_days,
      cancellation_cutoff_minutes = excluded.cancellation_cutoff_minutes,
      buffer_before_minutes = excluded.buffer_before_minutes,
      buffer_after_minutes = excluded.buffer_after_minutes,
      updated_by = actor_user_id;
exception
  when no_data_found then
    raise exception 'An active Owner membership is required';
end;
$$;

revoke all on function public.save_organization_schedule_settings(
  text, text, jsonb, smallint, smallint[], smallint, integer, smallint,
  integer, smallint, smallint
) from public, anon, authenticated;
grant execute on function public.save_organization_schedule_settings(
  text, text, jsonb, smallint, smallint[], smallint, integer, smallint,
  integer, smallint, smallint
) to authenticated;

comment on function public.save_organization_schedule_settings(
  text, text, jsonb, smallint, smallint[], smallint, integer, smallint,
  integer, smallint, smallint
) is
  'Atomically validates and saves an active Owner organization timezone, address, hours, and booking settings.';
