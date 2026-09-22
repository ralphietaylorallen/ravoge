-- Reusable, organization-scoped Coach and Client enrollment credentials.
-- Raw bearer tokens are never stored. The application derives them from the
-- credential id + rotation nonce with a server-only HMAC key and stores only
-- the SHA-256 digest used for resolution.

create table public.organization_enrollment_credentials (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  authorized_role public.organization_role not null
    check (authorized_role in ('coach', 'client')),
  status text not null default 'active'
    check (status in ('active', 'disabled')),
  token_hash text not null unique
    check (token_hash ~ '^[0-9a-f]{64}$'),
  rotation_nonce uuid not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  rotated_at timestamptz,
  expires_at timestamptz,
  unique (organization_id, authorized_role),
  check (expires_at is null or expires_at > created_at),
  check (
    (status = 'active' and revoked_at is null)
    or (status = 'disabled' and revoked_at is not null)
  )
);

create index organization_enrollment_credentials_resolution_idx
  on public.organization_enrollment_credentials (token_hash)
  where status = 'active';

alter table public.organization_enrollment_credentials enable row level security;

create policy organization_enrollment_credentials_owner_select
  on public.organization_enrollment_credentials
  for select to authenticated
  using (
    private.has_active_role(
      organization_id,
      array['owner']::public.organization_role[]
    )
  );

revoke all on public.organization_enrollment_credentials
  from public, anon, authenticated;

comment on table public.organization_enrollment_credentials is
  'Owner-controlled reusable organization enrollment credentials. Only token digests are stored; organization and role are resolved server-side.';

create function public.ensure_organization_enrollment_credential(
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
  on conflict (organization_id, authorized_role) do nothing;

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

create function public.rotate_organization_enrollment_credential(
  requested_role public.organization_role,
  requested_rotation_nonce uuid,
  requested_token_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_organization_id uuid;
begin
  if actor_user_id is null then raise exception 'Authentication is required'; end if;
  if requested_role not in ('coach', 'client')
    or requested_rotation_nonce is null
    or requested_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'A valid enrollment credential is required';
  end if;

  select membership.organization_id into strict actor_organization_id
  from public.organization_memberships membership
  join public.organizations organization
    on organization.id = membership.organization_id and organization.status = 'active'
  join public.profiles profile
    on profile.id = membership.user_id and profile.account_status = 'active'
  where membership.user_id = actor_user_id
    and membership.role = 'owner'
    and membership.status = 'active'
  for update of membership, organization, profile;

  update public.organization_enrollment_credentials
  set rotation_nonce = requested_rotation_nonce,
      token_hash = requested_token_hash,
      status = 'active',
      revoked_at = null,
      rotated_at = now(),
      expires_at = null
  where organization_id = actor_organization_id
    and authorized_role = requested_role;
  if not found then raise exception 'Enrollment credential not found'; end if;
exception when no_data_found then raise exception 'An active Owner membership is required';
end;
$$;

create function public.disable_organization_enrollment_credential(
  requested_role public.organization_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_organization_id uuid;
begin
  if actor_user_id is null then raise exception 'Authentication is required'; end if;
  if requested_role not in ('coach', 'client') then
    raise exception 'Only Coach or Client enrollment is supported';
  end if;

  select membership.organization_id into strict actor_organization_id
  from public.organization_memberships membership
  join public.organizations organization
    on organization.id = membership.organization_id and organization.status = 'active'
  join public.profiles profile
    on profile.id = membership.user_id and profile.account_status = 'active'
  where membership.user_id = actor_user_id
    and membership.role = 'owner'
    and membership.status = 'active'
  for update of membership, organization, profile;

  update public.organization_enrollment_credentials
  set status = 'disabled', revoked_at = now()
  where organization_id = actor_organization_id
    and authorized_role = requested_role;
  if not found then raise exception 'Enrollment credential not found'; end if;
exception when no_data_found then raise exception 'An active Owner membership is required';
end;
$$;

create function public.get_organization_enrollment_handoff(enrollment_token text)
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
    where credential.status = 'active'
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

create function public.accept_organization_enrollment(enrollment_token text)
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
  if target_credential.status <> 'active'
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

revoke all on function public.ensure_organization_enrollment_credential(
  public.organization_role, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.ensure_organization_enrollment_credential(
  public.organization_role, uuid, uuid, text
) to authenticated;

revoke all on function public.rotate_organization_enrollment_credential(
  public.organization_role, uuid, text
) from public, anon, authenticated;
grant execute on function public.rotate_organization_enrollment_credential(
  public.organization_role, uuid, text
) to authenticated;

revoke all on function public.disable_organization_enrollment_credential(
  public.organization_role
) from public, anon, authenticated;
grant execute on function public.disable_organization_enrollment_credential(
  public.organization_role
) to authenticated;

revoke all on function public.get_organization_enrollment_handoff(text)
  from public, anon, authenticated;
grant execute on function public.get_organization_enrollment_handoff(text)
  to anon, authenticated;

revoke all on function public.accept_organization_enrollment(text)
  from public, anon, authenticated;
grant execute on function public.accept_organization_enrollment(text)
  to authenticated;

comment on function public.ensure_organization_enrollment_credential(
  public.organization_role, uuid, uuid, text
) is 'Creates or returns the reusable Coach or Client enrollment credential for the authenticated Owner organization.';
comment on function public.rotate_organization_enrollment_credential(
  public.organization_role, uuid, text
) is 'Atomically rotates and re-enables an Owner organization enrollment credential, invalidating its former bearer token.';
comment on function public.disable_organization_enrollment_credential(
  public.organization_role
) is 'Disables new enrollment through an organization role QR without changing existing memberships.';
comment on function public.get_organization_enrollment_handoff(text) is
  'Resolves an active organization QR or email invitation. Possession alone grants no membership.';
comment on function public.accept_organization_enrollment(text) is
  'Accepts an organization QR or email invitation for the authenticated user while enforcing the server-resolved organization and role.';
