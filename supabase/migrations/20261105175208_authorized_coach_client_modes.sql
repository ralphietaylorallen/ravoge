-- Keep the unique (organization_id,user_id) anchor and all historical foreign
-- keys. A Coach's optional Client access is independently revocable; no rows,
-- profiles, auth identities or assignments are converted/backfilled here.
alter table public.organization_memberships
  add column client_access_status public.membership_status,
  add constraint coach_client_access_only check (client_access_status is null or role = 'coach');
revoke update (client_access_status) on public.organization_memberships from anon, authenticated;

-- Read-only role projection. security_invoker preserves membership RLS.
create view public.organization_member_roles with (security_invoker = true) as
select m.id, m.organization_id, m.user_id, access.role, access.status,
  case when access.role = m.role then m.invitation_id else null end as invitation_id,
  m.created_at, m.updated_at,
  (m.is_primary_owner and access.role = 'owner') as is_primary_owner,
  m.client_access_status
from public.organization_memberships m
cross join lateral (
  select m.role, m.status
  union all
  select 'client'::public.organization_role, m.client_access_status
  where m.role = 'coach' and m.client_access_status is not null
) access;
revoke all on public.organization_member_roles from public, anon, authenticated;
grant select on public.organization_member_roles to authenticated;

-- No client may call/read the following internal views directly. Their owner
-- privileges are used ONLY by existing checked definer functions/RLS helpers.
create view private.member_roles as select * from public.organization_member_roles;
revoke all on private.member_roles from public, anon, authenticated;

create function private.selected_membership()
returns table(id uuid, role public.organization_role)
language sql stable security definer set search_path = '' as $$
  with headers as (
    select coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb h
  ), authorized as (
    select m.id, m.role, m.organization_id
    from private.member_roles m
    join public.organizations o on o.id=m.organization_id and o.status='active'
    join public.profiles p on p.id=m.user_id and p.account_status='active'
    where m.user_id=(select auth.uid()) and m.status='active'
  )
  select a.id,a.role from authorized a cross join headers
  where case when h ? 'x-ravoge-organization' or h ? 'x-ravoge-view'
    then a.organization_id::text = h->>'x-ravoge-organization' and a.role::text = h->>'x-ravoge-view'
    else (select count(*) from authorized)=1 end;
$$;
revoke all on function private.selected_membership() from public, anon, authenticated;

-- Existing business functions may continue reading a single actor membership.
-- Selection narrows verified access; headers never grant a role or a gym.
-- Other members' roles remain available to checked roster/assignment lookups.
create view private.request_memberships as
select m.* from private.member_roles m
where m.user_id is distinct from (select auth.uid())
  or exists(select 1 from private.selected_membership() s where s.id=m.id and s.role=m.role);
revoke all on private.request_memberships from public, anon, authenticated;

create function private.my_authorized_memberships()
returns table(id uuid, user_id uuid, organization_id uuid, organization_name text,
  role public.organization_role, status public.membership_status)
language sql stable security definer set search_path = '' as $$
  select m.id,m.user_id,m.organization_id,o.name,m.role,m.status
  from private.member_roles m
  join public.organizations o on o.id=m.organization_id and o.status='active'
  join public.profiles p on p.id=m.user_id and p.account_status='active'
  where m.user_id=(select auth.uid()) and m.status='active'
  order by m.created_at,m.organization_id,m.role;
$$;
revoke all on function private.my_authorized_memberships() from public, anon;
grant execute on function private.my_authorized_memberships() to authenticated;
create function public.get_my_authorized_memberships()
returns table(id uuid, user_id uuid, organization_id uuid, organization_name text,
  role public.organization_role, status public.membership_status)
language sql stable security invoker set search_path = '' as $$
  select * from private.my_authorized_memberships();
$$;
revoke all on function public.get_my_authorized_memberships() from public, anon;
grant execute on function public.get_my_authorized_memberships() to authenticated;

create function private.create_my_client_access(target_organization_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare membership_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select m.id into membership_id from public.organization_memberships m
  join public.organizations o on o.id=m.organization_id and o.status='active'
  join public.profiles p on p.id=m.user_id and p.account_status='active'
  where m.user_id=auth.uid() and m.organization_id=target_organization_id
    and m.role='coach' and m.status='active' for update of m;
  if not found then raise exception 'Active Coach access to this gym required' using errcode='42501'; end if;
  update public.organization_memberships set client_access_status='active'
    where id=membership_id and client_access_status is distinct from 'active'::public.membership_status;
  return membership_id;
end;
$$;
revoke all on function private.create_my_client_access(uuid) from public, anon;
grant execute on function private.create_my_client_access(uuid) to authenticated;
create function public.create_my_client_access(target_organization_id uuid)
returns uuid language sql security invoker set search_path = '' as $$
  select private.create_my_client_access(target_organization_id);
$$;
revoke all on function public.create_my_client_access(uuid) from public, anon;
grant execute on function public.create_my_client_access(uuid) to authenticated;

-- Rebind existing, explicitly listed membership READS to the role projection.
-- Their payload validation, calculations, data writes and grants are unchanged.
-- No lifecycle function, invitation acceptance or membership writer is rebound.
-- Stored function definitions are used so future schema dependencies remain intact.
do $compat$
declare f record; definition text; revised text; statement text; relation text;
begin
  for f in
    select p.oid,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    join (values ('private', 'announcement_owner_org'),
    ('private', 'announcement_recipient_eligible'),
    ('private', 'booking_slot_permitted'),
    ('private', 'can_create_assignment'),
    ('private', 'can_manage_profile_photo'),
    ('private', 'can_read_profile_asset'),
    ('private', 'can_view_membership'),
    ('private', 'can_view_profile'),
    ('private', 'claim_announcement_recipient'),
    ('private', 'claim_workout_completion_email'),
    ('private', 'clear_email_invitations'),
    ('private', 'create_announcement_preview'),
    ('private', 'duplicate_group_programming_week'),
    ('private', 'enforce_assignment_membership_roles'),
    ('private', 'enforce_body_composition_scope'),
    ('private', 'enforce_booking_integrity'),
    ('private', 'enforce_coach_certification_scope'),
    ('private', 'enforce_profile_avatar_owner'),
    ('private', 'enforce_schedule_actor_scope'),
    ('private', 'group_programming_organization'),
    ('private', 'group_programming_team'),
    ('private', 'has_active_coach_client_assignment'),
    ('private', 'has_active_role'),
    ('private', 'owner_announcement_audience'),
    ('private', 'set_announcement_preference'),
    ('private', 'set_group_programming_permission'),
    ('public', 'add_equipment_checklist'),
    ('public', 'cancel_staff_booking'),
    ('public', 'configure_coach_compensation'),
    ('public', 'configure_organization_session_pricing'),
    ('public', 'configure_preworkout_question'),
    ('public', 'create_client_booking'),
    ('public', 'create_staff_booking'),
    ('public', 'create_workout_assignment'),
    ('public', 'disable_organization_enrollment_credential'),
    ('public', 'ensure_organization_enrollment_credential'),
    ('public', 'generate_initial_prescription_v0'),
    ('public', 'get_client_booking_calendar'),
    ('public', 'get_my_assigned_coach'),
    ('public', 'get_organization_enrollment_handoff'),
    ('public', 'get_organization_invitation_context_v2'),
    ('public', 'get_organization_invitation_handoff'),
    ('public', 'get_staff_booking_calendar'),
    ('public', 'get_training_catalog_counts'),
    ('public', 'get_training_catalog_counts_before_references'),
    ('public', 'get_workout_generation_readiness'),
    ('public', 'import_training_library_rows'),
    ('public', 'list_other_assigned_clients_for_coach'),
    ('public', 'list_unassigned_clients_for_coach'),
    ('public', 'record_coach_preworkout_checkin'),
    ('public', 'reschedule_staff_booking'),
    ('public', 'reserve_equipment_scan'),
    ('public', 'rotate_organization_enrollment_credential'),
    ('public', 'save_client_injury_spot'),
    ('public', 'save_client_intake_before_load_engine'),
    ('public', 'save_exercise_load_rule'),
    ('public', 'save_gym_resource'),
    ('public', 'save_organization_schedule_settings'),
    ('public', 'save_programming_profile'),
    ('public', 'set_gym_references'),
    ('public', 'set_training_generation_status'),
    ('public', 'share_six_week_report'),
    ('public', 'submit_preworkout_checkin'),
    ('public', 'submit_training_readiness'),
    ('public', 'update_own_profile'),
    ('public', 'update_unaffiliated_profile_photo'),
    ('public', 'upsert_client_intake')) allowed(schema_name,function_name)
      on allowed.schema_name=n.nspname and allowed.function_name=p.proname
    where p.prokind='f'
  loop
    definition:=pg_get_functiondef(f.oid);
    -- RLS/target-membership checks use the union of actual permissions, never
    -- a chosen view. Business operations that infer their actor gym use the
    -- explicit selection. A view choice is not an authorization boundary.
    relation:=case when f.nspname='private' and f.proname in (
      'has_active_role','has_active_coach_client_assignment','can_create_assignment',
      'can_manage_profile_photo','can_read_profile_asset','can_view_membership','can_view_profile',
      'booking_slot_permitted','enforce_assignment_membership_roles','enforce_body_composition_scope',
      'enforce_booking_integrity','enforce_coach_certification_scope','enforce_profile_avatar_owner',
      'enforce_schedule_actor_scope','announcement_recipient_eligible'
    ) then 'private.member_roles' else 'private.request_memberships' end;
    revised:='';
    foreach statement in array string_to_array(definition,';') loop
      if statement ~* 'for (update|share)' then
        -- Keep physical membership row locks. Actor locks are scoped to the
        -- already authorized selection; target locks keep their existing scope.
        statement:=regexp_replace(statement,
          '(membership\.user_id = actor_user_id)',
          '\1 and exists(select 1 from private.selected_membership() s where s.id=membership.id and s.role=membership.role)', 'g');
        statement:=regexp_replace(statement,
          '(m\.user_id=(auth.uid\(\)|actor))',
          '\1 and exists(select 1 from private.selected_membership() s where s.id=m.id and s.role=m.role)', 'g');
      else
        statement:=regexp_replace(statement, '(from|join) public\.organization_memberships', '\1 '||relation, 'gi');
      end if;
      revised:=revised || statement || ';';
    end loop;
    if revised=definition then raise exception 'Missing membership read in %', f.oid::regprocedure; end if;
    execute revised;
  end loop;
end $compat$;

-- Preserve physical membership locking and role-locked invitations.
CREATE OR REPLACE FUNCTION public.assign_client_to_coach(target_client_user_id uuid, target_coach_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  authenticated_owner_id uuid := (select auth.uid());
  owner_organization_id uuid;
  selected_assignment_id uuid;
begin
  if authenticated_owner_id is null
    or target_client_user_id is null
    or target_coach_user_id is null
    or target_client_user_id = target_coach_user_id then
    raise exception 'A valid owner, coach, and client are required';
  end if;

  select membership.organization_id
  into strict owner_organization_id
  from public.organization_memberships membership
  join public.organizations organization
    on organization.id = membership.organization_id
   and organization.status = 'active'
  join public.profiles profile
    on profile.id = membership.user_id
   and profile.account_status = 'active'
  where membership.user_id = authenticated_owner_id
    and exists(select 1 from private.selected_membership() selected where selected.id=membership.id and selected.role=membership.role)
    and membership.role = 'owner'
    and membership.status = 'active';

  perform 1
  from public.organization_memberships coach
  join public.profiles profile
    on profile.id = coach.user_id
   and profile.account_status = 'active'
  where coach.organization_id = owner_organization_id
    and coach.user_id = target_coach_user_id
    and coach.role = 'coach'
    and coach.status = 'active'
  for update of coach;
  if not found then
    raise exception 'The selected coach is not an active coach in this organization';
  end if;

  perform 1
  from public.organization_memberships client
  join public.profiles profile
    on profile.id = client.user_id
   and profile.account_status = 'active'
  where client.organization_id = owner_organization_id
    and client.user_id = target_client_user_id
    and ((client.role='client' and client.status='active') or (client.role='coach' and client.client_access_status='active'))
  for update of client;
  if not found then
    raise exception 'The selected client is not an active client in this organization';
  end if;

  update public.coach_client_assignments assignment
  set status = 'inactive'
  where assignment.organization_id = owner_organization_id
    and assignment.client_user_id = target_client_user_id
    and assignment.coach_user_id <> target_coach_user_id
    and assignment.status = 'active';

  insert into public.coach_client_assignments (
    organization_id,
    coach_user_id,
    client_user_id,
    status
  ) values (
    owner_organization_id,
    target_coach_user_id,
    target_client_user_id,
    'active'
  )
  on conflict (organization_id, coach_user_id, client_user_id)
  do update set status = 'active'
  returning id into selected_assignment_id;

  return selected_assignment_id;
exception
  when no_data_found then
    raise exception 'An active owner membership is required';
  when too_many_rows then
    raise exception 'Owner membership is ambiguous';
end;
$function$
;

-- Preserve physical membership locking and role-locked invitations.
CREATE OR REPLACE FUNCTION public.claim_unassigned_client(target_client_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor_user_id uuid := (select auth.uid()); actor_organization_id uuid; claimed_id uuid;
begin
  if actor_user_id is null or target_client_user_id is null then raise exception 'A valid Coach and Client are required'; end if;
  select membership.organization_id into strict actor_organization_id
  from public.organization_memberships membership
  join public.organizations organization on organization.id = membership.organization_id and organization.status = 'active'
  join public.profiles profile on profile.id = membership.user_id and profile.account_status = 'active'
  where membership.user_id = actor_user_id
    and exists(select 1 from private.selected_membership() selected where selected.id=membership.id and selected.role=membership.role) and membership.role = 'coach' and membership.status = 'active';
  perform 1 from public.organization_memberships client
  join public.profiles profile on profile.id = client.user_id and profile.account_status = 'active'
  where client.organization_id = actor_organization_id and client.user_id = target_client_user_id
    and ((client.role='client' and client.status='active') or (client.role='coach' and client.client_access_status='active'))
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
$function$
;

-- Preserve physical membership locking and role-locked invitations.
CREATE OR REPLACE FUNCTION public.create_organization_invitation(invited_email text, invited_role organization_role, invitation_token_hash text, invitation_expires_at timestamp with time zone)
 RETURNS TABLE(invitation_id uuid, organization_id uuid, organization_name text, email text, role organization_role, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_user_id uuid := (select auth.uid());
  normalized_email text := lower(trim(invited_email));
  inviter_membership public.organization_memberships%rowtype;
  resolved_organization_name text;
  new_invitation_id uuid;
begin
  if actor_user_id is null then raise exception 'Authentication is required'; end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or char_length(normalized_email) > 320 then
    raise exception 'A valid email is required';
  end if;
  if invitation_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'A secure invitation token hash is required';
  end if;
  if invitation_expires_at <= now() or invitation_expires_at > now() + interval '8 days' then
    raise exception 'Invitation expiration is invalid';
  end if;

  select membership.* into strict inviter_membership
  from public.organization_memberships membership
  join public.organizations organization
    on organization.id = membership.organization_id and organization.status = 'active'
  join public.profiles profile
    on profile.id = membership.user_id and profile.account_status = 'active'
  where membership.user_id = actor_user_id
    and exists(select 1 from private.selected_membership() selected where selected.id=membership.id and selected.role=membership.role) and membership.status = 'active'
  for update of membership;

  if inviter_membership.role = 'client'
    or (inviter_membership.role = 'coach' and invited_role <> 'client') then
    raise exception 'That invitation type is not permitted';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      inviter_membership.organization_id::text || ':' || normalized_email || ':' || invited_role::text,
      0
    )
  );

  if exists (
    select 1 from auth.users auth_user
    join public.organization_memberships membership on membership.user_id = auth_user.id
    where lower(auth_user.email) = normalized_email
      and membership.organization_id = inviter_membership.organization_id
  ) then
    raise exception 'This person already has a membership in this gym';
  end if;

  if exists (
    select 1 from private.owner_signup_intents intent
    where intent.email = normalized_email
      and intent.consumed_at is null
      and intent.expires_at > now()
  ) then
    raise exception 'This email already has a pending Owner signup';
  end if;

  update public.organization_invitations invitation
  set revoked_at = now()
  where invitation.organization_id = inviter_membership.organization_id
    and invitation.email = normalized_email
    and invitation.role = invited_role
    and invitation.accepted_at is null
    and invitation.revoked_at is null;

  insert into public.organization_invitations (
    organization_id, invited_by, email, role, token_hash, expires_at, delivery_status
  ) values (
    inviter_membership.organization_id, actor_user_id, normalized_email,
    invited_role, invitation_token_hash, invitation_expires_at, 'pending'
  ) returning id into new_invitation_id;

  select organization.name into strict resolved_organization_name
  from public.organizations organization
  where organization.id = inviter_membership.organization_id;

  return query select new_invitation_id, inviter_membership.organization_id,
    resolved_organization_name, normalized_email, invited_role, invitation_expires_at;
exception when no_data_found then
  raise exception 'An active Ravoge membership is required';
end;
$function$
;

CREATE OR REPLACE FUNCTION private.lock_training_member_access()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare matched integer;
begin
 if tg_table_name='bookings' then if new.status<>'scheduled' then return new; end if;
 else if new.status<>'active' then return new; end if; end if;
 perform m.id from public.organization_memberships m where m.organization_id=new.organization_id and m.user_id in (new.coach_user_id,new.client_user_id) order by m.user_id for share;
 select count(*) into matched from public.organization_memberships m join public.profiles p on p.id=m.user_id and p.account_status='active'
 where m.organization_id=new.organization_id and ((m.user_id=new.coach_user_id and m.role='coach' and m.status='active') or (m.user_id=new.client_user_id and ((m.role='client' and m.status='active') or (m.role='coach' and m.client_access_status='active'))));
 if matched<>2 then raise exception 'An active Coach and Client in this gym are required'; end if;
 return new;
end $function$
;
-- Role-scoped removal retains the original confirmation/appointment safeguards.
create function private.member_removal_context(target_user_id uuid, target_role public.organization_role)
returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid; target public.organization_memberships%rowtype; effective_status public.membership_status;
begin
 select m.organization_id into org from private.request_memberships m
 where m.user_id=auth.uid() and m.role='owner' and m.status='active';
 if org is null or not private.has_active_role(org,array['owner']::public.organization_role[]) then
   raise exception 'Owner access required' using errcode='42501'; end if;
 select * into target from public.organization_memberships m where m.organization_id=org and m.user_id=target_user_id;
 if not found or target_role is null or target_role not in ('coach','client') or target.is_primary_owner or target.user_id=auth.uid()
   or not (target.role=target_role or (target.role='coach' and target_role='client' and target.client_access_status is not null)) then
   raise exception 'Coach or Client not available in this gym' using errcode='42501'; end if;
 effective_status:=case when target.role=target_role then target.status else target.client_access_status end;
 return jsonb_build_object('name',(select full_name from public.profiles where id=target_user_id),
 'role',target_role,'status',effective_status,'gym',(select name from public.organizations where id=org),
 'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'coach',cp.full_name,'client',p.full_name,'clientId',a.client_user_id) order by a.id)
 from public.coach_client_assignments a join public.profiles cp on cp.id=a.coach_user_id join public.profiles p on p.id=a.client_user_id
 where a.organization_id=org and a.status='active' and case when target_role='coach' then a.coach_user_id=target_user_id else a.client_user_id=target_user_id end),'[]'::jsonb),
 'bookings',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'coachName',cp.full_name,'clientName',p.full_name,'clientUserId',b.client_user_id,'startsAt',b.starts_at,'endsAt',b.ends_at,'timezone',b.timezone,'status',b.status,'sessionType',b.session_type,'gymName',o.name) order by b.starts_at)
 from public.bookings b join public.profiles cp on cp.id=b.coach_user_id join public.profiles p on p.id=b.client_user_id join public.organizations o on o.id=b.organization_id
 where b.organization_id=org and b.status='scheduled' and b.ends_at>now() and case when target_role='coach' then b.coach_user_id=target_user_id else b.client_user_id=target_user_id end),'[]'::jsonb));
end;
$$;
revoke all on function private.member_removal_context(uuid,public.organization_role) from public,anon;
grant execute on function private.member_removal_context(uuid,public.organization_role) to authenticated;
create function public.member_removal_context(target_user_id uuid, target_role public.organization_role)
returns jsonb language sql security invoker set search_path='' as $$
 select private.member_removal_context(target_user_id,target_role);
$$;
revoke all on function public.member_removal_context(uuid,public.organization_role) from public,anon;
grant execute on function public.member_removal_context(uuid,public.organization_role) to authenticated;

create function private.remove_organization_member(target_user_id uuid, target_role public.organization_role, confirmed_assignment_ids uuid[])
returns boolean language plpgsql security definer set search_path='' as $$
declare org uuid; target public.organization_memberships%rowtype; actual_ids uuid[]; supplied_ids uuid[];
begin
 select m.organization_id into org from public.organization_memberships m
 where m.user_id=auth.uid() and m.role='owner' and m.status='active'
   and exists(select 1 from private.selected_membership() s where s.id=m.id and s.role='owner') for share;
 if org is null or not private.has_active_role(org,array['owner']::public.organization_role[]) then raise exception 'Owner access required' using errcode='42501'; end if;
 select * into target from public.organization_memberships m where m.organization_id=org and m.user_id=target_user_id for update;
 if not found or target_role is null or target_role not in ('coach','client') or target.is_primary_owner or target.user_id=auth.uid()
   or not (target.role=target_role or (target.role='coach' and target_role='client' and target.client_access_status is not null)) then
   raise exception 'Only another Coach or Client in this gym may be removed' using errcode='42501'; end if;
 if (case when target.role=target_role then target.status else target.client_access_status end)='inactive' then return false; end if;
 if exists(select 1 from public.bookings b where b.organization_id=org and b.status='scheduled' and b.ends_at>now()
   and case when target_role='coach' then b.coach_user_id=target_user_id else b.client_user_id=target_user_id end) then
   raise exception 'Resolve future or in-progress appointments before removing access' using errcode='22023'; end if;
 perform a.id from public.coach_client_assignments a where a.organization_id=org and a.status='active'
   and case when target_role='coach' then a.coach_user_id=target_user_id else a.client_user_id=target_user_id end order by a.id for update;
 select coalesce(array_agg(a.id order by a.id),'{}'::uuid[]) into actual_ids from public.coach_client_assignments a where a.organization_id=org and a.status='active'
   and case when target_role='coach' then a.coach_user_id=target_user_id else a.client_user_id=target_user_id end;
 select coalesce(array_agg(id order by id),'{}'::uuid[]) into supplied_ids from unnest(confirmed_assignment_ids) id;
 if confirmed_assignment_ids is null or cardinality(confirmed_assignment_ids)>1000 or supplied_ids is distinct from actual_ids then
   raise exception 'Assignments changed. Review and explicitly confirm each affected assignment' using errcode='22023'; end if;
 update public.coach_client_assignments set status='inactive' where organization_id=org and id=any(actual_ids);
 if target.role=target_role then update public.organization_memberships set status='inactive' where id=target.id;
 else update public.organization_memberships set client_access_status='inactive' where id=target.id; end if;
 insert into public.member_access_removals(organization_id,membership_id,member_user_id,actor_user_id,member_name,member_role,ended_assignment_ids)
 select org,target.id,target_user_id,auth.uid(),p.full_name,target_role,actual_ids from public.profiles p where p.id=target_user_id;
 return true;
end;
$$;
revoke all on function private.remove_organization_member(uuid,public.organization_role,uuid[]) from public,anon;
grant execute on function private.remove_organization_member(uuid,public.organization_role,uuid[]) to authenticated;
create function public.remove_organization_member(target_user_id uuid, target_role public.organization_role, confirmed_assignment_ids uuid[])
returns boolean language sql security invoker set search_path='' as $$
 select private.remove_organization_member(target_user_id,target_role,confirmed_assignment_ids);
$$;
revoke all on function public.remove_organization_member(uuid,public.organization_role,uuid[]) from public,anon;
grant execute on function public.remove_organization_member(uuid,public.organization_role,uuid[]) to authenticated;

-- Compatibility for callers already deployed with the original signatures:
-- remove only the original role, retaining any independently active Client role.
create or replace function private.member_removal_context(target_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare selected_role public.organization_role;
begin
 select m.role into selected_role from private.request_memberships owner
 join public.organization_memberships m on m.organization_id=owner.organization_id
 where owner.user_id=auth.uid() and owner.role='owner' and owner.status='active' and m.user_id=target_user_id;
 return private.member_removal_context(target_user_id,selected_role);
end;
$$;
create or replace function private.remove_organization_member(target_user_id uuid, confirmed_assignment_ids uuid[])
returns boolean language plpgsql security definer set search_path='' as $$
declare selected_role public.organization_role;
begin
 select m.role into selected_role from private.request_memberships owner
 join public.organization_memberships m on m.organization_id=owner.organization_id
 where owner.user_id=auth.uid() and owner.role='owner' and owner.status='active' and m.user_id=target_user_id;
 return private.remove_organization_member(target_user_id,selected_role,confirmed_assignment_ids);
end;
$$;
