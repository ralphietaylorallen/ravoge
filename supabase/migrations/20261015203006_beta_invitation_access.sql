-- Preserve every identity and membership. Reusable QR access is Client-only.
update public.organization_enrollment_credentials
set status='disabled',revoked_at=coalesce(revoked_at,now())
where authorized_role='coach' and status='active';

create function private.enforce_client_only_enrollment() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.authorized_role<>'client' and new.status='active' then
    raise exception 'Coaches require an individual email invitation. Use /coach/install for installation.';
  end if;
  return new;
end $$;
create trigger enforce_client_only_enrollment before insert or update
on public.organization_enrollment_credentials for each row execute function private.enforce_client_only_enrollment();
revoke all on function private.enforce_client_only_enrollment() from public,anon,authenticated;

create or replace function public.get_organization_enrollment_handoff(enrollment_token text)
returns table (
  enrollment_kind text,
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
  with supplied as (
    select encode(extensions.digest(enrollment_token, 'sha256'), 'hex') as token_hash
    where char_length(enrollment_token) >= 32
  ), valid_qr as (
    select 'organization_qr'::text as enrollment_kind,
      null::text as email,
      credential.authorized_role as role,
      organization.name as organization_name,
      coalesce(creator.preferred_name, creator.full_name) as inviter_name,
      'owner'::public.organization_role as inviter_role,
      credential.expires_at,
      false as account_exists,
      1 as precedence
    from supplied
    join public.organization_enrollment_credentials credential
      on credential.token_hash = supplied.token_hash
    join public.organizations organization
      on organization.id = credential.organization_id
     and organization.status = 'active'
    join public.profiles creator on creator.id = credential.created_by
    where credential.authorized_role = 'client'
      and credential.status = 'active'
      and credential.revoked_at is null
      and (credential.expires_at is null or credential.expires_at > now())
  ), valid_invitation as (
    select 'email_invitation'::text,
      invitation.email,
      invitation.role,
      organization.name,
      coalesce(inviter.preferred_name, inviter.full_name),
      inviter_membership.role,
      invitation.expires_at,
      exists (
        select 1 from auth.users account
        where lower(account.email) = invitation.email
      ),
      2
    from supplied
    join public.organization_invitations invitation
      on invitation.token_hash = supplied.token_hash
    join public.organizations organization
      on organization.id = invitation.organization_id
     and organization.status = 'active'
    join public.profiles inviter on inviter.id = invitation.invited_by
    join public.organization_memberships inviter_membership
      on inviter_membership.organization_id = invitation.organization_id
     and inviter_membership.user_id = invitation.invited_by
     and inviter_membership.status = 'active'
    where invitation.accepted_at is null
      and invitation.revoked_at is null
      and invitation.expires_at > now()
  )
  select result.enrollment_kind,
    result.email,
    result.role,
    result.organization_name,
    result.inviter_name,
    result.inviter_role,
    result.expires_at,
    result.account_exists
  from (
    select * from valid_qr
    union all
    select * from valid_invitation
  ) result
  order by result.precedence
  limit 1;
$$;

create or replace function public.accept_organization_enrollment(enrollment_token text)
returns public.organization_role
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_credential public.organization_enrollment_credentials%rowtype;
  existing_membership public.organization_memberships%rowtype;
begin
  if actor_user_id is null or char_length(enrollment_token) < 32 then
    raise exception 'Invalid enrollment';
  end if;

  if not exists (
    select 1
    from auth.users auth_user
    join public.profiles profile
      on profile.id = auth_user.id and profile.account_status = 'active'
    where auth_user.id = actor_user_id
      and auth_user.email_confirmed_at is not null
  ) then
    raise exception 'An active account with a confirmed email is required';
  end if;

  select credential.* into target_credential
  from public.organization_enrollment_credentials credential
  join public.organizations organization
    on organization.id = credential.organization_id
   and organization.status = 'active'
  where credential.token_hash = encode(extensions.digest(enrollment_token, 'sha256'), 'hex')
  for update of credential;

  if not found then
    return public.accept_organization_invitation(enrollment_token);
  end if;
  if target_credential.authorized_role <> 'client'
    or target_credential.status <> 'active'
    or target_credential.revoked_at is not null
    or (target_credential.expires_at is not null and target_credential.expires_at <= now()) then
    raise exception 'Invalid or disabled enrollment';
  end if;

  select * into existing_membership
  from public.organization_memberships membership
  where membership.user_id = actor_user_id
  order by membership.created_at
  limit 1
  for update;

  if found then
    if existing_membership.organization_id = target_credential.organization_id
      and existing_membership.role = target_credential.authorized_role
      and existing_membership.status = 'active' then
      return existing_membership.role;
    end if;
    raise exception 'This account already has a conflicting Ravoge membership';
  end if;

  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    status,
    invitation_id
  ) values (
    target_credential.organization_id,
    actor_user_id,
    target_credential.authorized_role,
    'active',
    null
  );
  return target_credential.authorized_role;
end;
$$;



-- The server supplies a new random token hash. Role/email/gym are read only from
-- the existing invitation, never from the browser. Old links stop working.
create function public.refresh_organization_invitation(
  target_invitation_id uuid,new_token_hash text,new_expires_at timestamptz
) returns table(invitation_id uuid,email text,role public.organization_role,organization_name text)
language plpgsql security definer set search_path='' as $$
declare target public.organization_invitations%rowtype;
begin
  if (select auth.uid()) is null or new_token_hash is null or new_token_hash !~ '^[0-9a-f]{64}$'
    or new_expires_at is null or new_expires_at<=now() or new_expires_at>now()+interval '8 days' then
    raise exception 'Invalid invitation refresh';
  end if;
  select i.* into strict target from public.organization_invitations i where i.id=target_invitation_id for update;
  if not private.has_active_role(target.organization_id,array['owner']::public.organization_role[])
    or target.accepted_at is not null or target.revoked_at is not null then
    raise exception 'An active Owner and an unaccepted, unrevoked invitation are required';
  end if;
  update public.organization_invitations i set token_hash=new_token_hash,expires_at=new_expires_at,
    delivery_status='pending',delivery_attempted_at=null,delivery_error=null,provider_message_id=null
    where i.id=target.id;
  return query select target.id,target.email,target.role,o.name from public.organizations o where o.id=target.organization_id;
exception when no_data_found then raise exception 'Invitation unavailable';
end $$;
revoke all on function public.refresh_organization_invitation(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.refresh_organization_invitation(uuid,text,timestamptz) to authenticated;

create or replace function public.ensure_organization_enrollment_credential(
  requested_role public.organization_role,
  requested_credential_id uuid,
  requested_rotation_nonce uuid,
  requested_token_hash text
)
returns table (
  credential_id uuid,
  organization_id uuid,
  organization_name text,
  authorized_role public.organization_role,
  credential_status text,
  rotation_nonce uuid,
  created_at timestamptz,
  rotated_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_organization_id uuid;
begin
  if actor_user_id is null then
    raise exception 'Authentication is required';
  end if;
  if requested_role not in ('coach', 'client') then
    raise exception 'Only Coach or Client enrollment is supported';
  end if;
  if requested_credential_id is null
    or requested_rotation_nonce is null
    or requested_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'A valid enrollment credential is required';
  end if;

  select membership.organization_id
  into strict actor_organization_id
  from public.organization_memberships membership
  join public.organizations organization
    on organization.id = membership.organization_id
   and organization.status = 'active'
  join public.profiles profile
    on profile.id = membership.user_id
   and profile.account_status = 'active'
  where membership.user_id = actor_user_id
    and membership.role = 'owner'
    and membership.status = 'active'
  for update of membership, organization, profile;

  -- Keep the old Owner Apps page readable during the migration/deploy window.
  -- Existing Coach credentials are returned disabled and can never enroll.
  if requested_role='coach' then
    return query select c.id,c.organization_id,o.name,c.authorized_role,c.status,
      c.rotation_nonce,c.created_at,c.rotated_at,c.revoked_at,c.expires_at
    from public.organization_enrollment_credentials c
    join public.organizations o on o.id=c.organization_id
    where c.organization_id=actor_organization_id and c.authorized_role='coach' and c.status='disabled';
    if not found then raise exception 'Coaches require an individual email invitation'; end if;
    return;
  end if;

  insert into public.organization_enrollment_credentials (
    id,
    organization_id,
    authorized_role,
    token_hash,
    rotation_nonce,
    created_by
  ) values (
    requested_credential_id,
    actor_organization_id,
    requested_role,
    requested_token_hash,
    requested_rotation_nonce,
    actor_user_id
  )
  on conflict on constraint
    organization_enrollment_credentials_organization_id_authorized_key
  do nothing;

  return query
  select credential.id,
    credential.organization_id,
    organization.name,
    credential.authorized_role,
    credential.status,
    credential.rotation_nonce,
    credential.created_at,
    credential.rotated_at,
    credential.revoked_at,
    credential.expires_at
  from public.organization_enrollment_credentials credential
  join public.organizations organization on organization.id = credential.organization_id
  where credential.organization_id = actor_organization_id
    and credential.authorized_role = requested_role;
exception
  when no_data_found then
    raise exception 'An active Owner membership is required';
end;
$$;
