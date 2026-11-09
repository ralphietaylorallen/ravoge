-- Date selections reuse the existing exception table. Recurring windows,
-- bookings, manual time off, gym hours and booking validation remain intact.
create function public.save_coach_calendar_day(
  target_organization_id uuid, target_date date, requested_increment integer, requested_ranges jsonb
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  actor uuid := auth.uid();
  zone text;
  marker text := 'Ravoge calendar availability v1:';
  r jsonb;
  start_min integer;
  end_min integer;
  cursor_min integer := 0;
  local_start timestamp;
  local_end timestamp;
  start_instant timestamptz;
  end_instant timestamptz;
begin
  if actor is null or not exists (
    select 1 from public.get_my_authorized_memberships() m
    where m.organization_id=target_organization_id and m.role='coach' and m.status='active'
  ) then raise exception 'Active Coach access required' using errcode='42501'; end if;
  select timezone into strict zone from public.organizations where id=target_organization_id and status='active';
  if target_date is null or target_date < (now() at time zone zone)::date
    or requested_increment is null or requested_increment not in (45,60)
    or requested_ranges is null or jsonb_typeof(requested_ranges)<>'array' or jsonb_array_length(requested_ranges)>96
  then raise exception 'Invalid availability selection'; end if;
  -- Serialize edits to this coach/date; one call is one atomic replacement.
  perform pg_advisory_xact_lock(hashtextextended(target_organization_id::text || actor::text || target_date::text, 0));
  delete from public.coach_availability_exceptions
    where organization_id=target_organization_id and coach_user_id=actor
      and starts_at >= target_date::timestamp at time zone zone
      and starts_at < (target_date+1)::timestamp at time zone zone
      and label in (marker || '45', marker || '60');
  for r in select value from jsonb_array_elements(requested_ranges) loop
    if jsonb_typeof(r->'start') is distinct from 'number' or jsonb_typeof(r->'end') is distinct from 'number'
      or (r->>'start')::numeric <> trunc((r->>'start')::numeric) or (r->>'end')::numeric <> trunc((r->>'end')::numeric)
    then raise exception 'Invalid time range'; end if;
    start_min := (r->>'start')::integer; end_min := (r->>'end')::integer;
    if start_min < cursor_min or start_min < 0 or end_min > 1440 or start_min >= end_min then raise exception 'Invalid time range'; end if;
    local_start := target_date::timestamp + make_interval(mins=>start_min);
    local_end := target_date::timestamp + make_interval(mins=>end_min);
    start_instant := local_start at time zone zone; end_instant := local_end at time zone zone;
    if start_instant at time zone zone <> local_start or end_instant at time zone zone <> local_end then raise exception 'Nonexistent local time'; end if;
    if cursor_min < start_min then
      insert into public.coach_availability_exceptions(organization_id,coach_user_id,kind,starts_at,ends_at,label)
      values(target_organization_id,actor,'unavailable',(target_date::timestamp+make_interval(mins=>cursor_min)) at time zone zone,start_instant,marker || requested_increment);
    end if;
    insert into public.coach_availability_exceptions(organization_id,coach_user_id,kind,starts_at,ends_at,label)
    values(target_organization_id,actor,'available_override',start_instant,end_instant,marker || requested_increment);
    cursor_min := end_min;
  end loop;
  if cursor_min < 1440 then
    insert into public.coach_availability_exceptions(organization_id,coach_user_id,kind,starts_at,ends_at,label)
    values(target_organization_id,actor,'unavailable',(target_date::timestamp+make_interval(mins=>cursor_min)) at time zone zone,(target_date+1)::timestamp at time zone zone,marker || requested_increment);
  end if;
end;
$$;
revoke all on function public.save_coach_calendar_day(uuid,date,integer,jsonb) from public,anon;
grant execute on function public.save_coach_calendar_day(uuid,date,integer,jsonb) to authenticated;

-- Coaches can share only their gym's existing Client enrollment link. They
-- cannot create, rotate, disable, or read Coach enrollment credentials.
create function private.coach_client_enrollment_credential(target_organization_id uuid)
returns table(credential_id uuid, organization_id uuid, organization_name text,
  authorized_role public.organization_role, credential_status text, rotation_nonce uuid,
  created_at timestamptz, rotated_at timestamptz, revoked_at timestamptz, expires_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from private.request_memberships m
    join public.profiles p on p.id=m.user_id and p.account_status='active'
    join public.organizations o on o.id=m.organization_id and o.status='active'
    where m.user_id=auth.uid() and m.organization_id=target_organization_id and m.role='coach' and m.status='active'
  ) then raise exception 'Active Coach access required' using errcode='42501'; end if;
  return query select c.id,c.organization_id,o.name,c.authorized_role,c.status,c.rotation_nonce,c.created_at,c.rotated_at,c.revoked_at,c.expires_at
    from public.organization_enrollment_credentials c join public.organizations o on o.id=c.organization_id
    where c.organization_id=target_organization_id and c.authorized_role='client' and c.status='active'
      and c.revoked_at is null and (c.expires_at is null or c.expires_at>now());
end;
$$;
revoke all on function private.coach_client_enrollment_credential(uuid) from public,anon;
grant execute on function private.coach_client_enrollment_credential(uuid) to authenticated;
create function public.get_coach_client_enrollment_credential(target_organization_id uuid)
returns table(credential_id uuid, organization_id uuid, organization_name text,
  authorized_role public.organization_role, credential_status text, rotation_nonce uuid,
  created_at timestamptz, rotated_at timestamptz, revoked_at timestamptz, expires_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select * from private.coach_client_enrollment_credential(target_organization_id);
$$;
revoke all on function public.get_coach_client_enrollment_credential(uuid) from public,anon;
grant execute on function public.get_coach_client_enrollment_credential(uuid) to authenticated;
