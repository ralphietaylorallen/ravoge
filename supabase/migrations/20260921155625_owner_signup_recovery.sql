create table private.owner_signup_intents (
  id uuid primary key default gen_random_uuid(),
  email text not null check (
    email = lower(trim(email))
    and char_length(email) between 3 and 320
  ),
  organization_name text not null check (
    char_length(trim(organization_name)) between 2 and 120
  ),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by uuid references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at),
  check ((consumed_at is null) = (consumed_by is null))
);

create unique index owner_signup_intents_pending_email_idx
  on private.owner_signup_intents (email)
  where consumed_at is null;

alter table private.owner_signup_intents enable row level security;
revoke all on private.owner_signup_intents from public, anon, authenticated;

create function public.begin_owner_signup(
  owner_email text,
  gym_name text,
  signup_token text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(trim(owner_email));
  normalized_gym_name text := trim(gym_name);
  existing_intent private.owner_signup_intents%rowtype;
begin
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or char_length(normalized_email) > 320 then
    raise exception 'A valid email is required';
  end if;

  if char_length(normalized_gym_name) not between 2 and 120 then
    raise exception 'A valid gym name is required';
  end if;

  if char_length(signup_token) < 32 then
    raise exception 'A secure signup token is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(normalized_email, 0)
  );

  if exists (
    select 1
    from auth.users auth_user
    join public.organization_memberships membership
      on membership.user_id = auth_user.id
    where lower(auth_user.email) = normalized_email
  ) then
    raise exception 'This account is already linked to a Ravoge gym';
  end if;

  if exists (
    select 1
    from public.organization_invitations invitation
    where invitation.email = normalized_email
      and invitation.accepted_at is null
      and invitation.revoked_at is null
      and invitation.expires_at > now()
  ) then
    raise exception 'Use the existing organization invitation for this email';
  end if;

  select * into existing_intent
  from private.owner_signup_intents intent
  where intent.email = normalized_email
    and intent.consumed_at is null
  for update;

  if found then
    if existing_intent.organization_name <> normalized_gym_name then
      raise exception 'An Owner signup is already pending for this email';
    end if;

    update private.owner_signup_intents
    set token_hash = encode(extensions.digest(signup_token, 'sha256'), 'hex'),
        expires_at = now() + interval '7 days',
        updated_at = now()
    where id = existing_intent.id;
  else
    insert into private.owner_signup_intents (
      email,
      organization_name,
      token_hash,
      expires_at
    ) values (
      normalized_email,
      normalized_gym_name,
      encode(extensions.digest(signup_token, 'sha256'), 'hex'),
      now() + interval '7 days'
    );
  end if;
end;
$$;

create function public.has_pending_owner_signup()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users auth_user
    join public.profiles profile
      on profile.id = auth_user.id
     and profile.account_status = 'active'
    join private.owner_signup_intents intent
      on intent.email = lower(auth_user.email)
     and intent.consumed_at is null
     and intent.expires_at > now()
    where auth_user.id = (select auth.uid())
      and auth_user.email_confirmed_at is not null
      and not exists (
        select 1
        from public.organization_memberships membership
        where membership.user_id = auth_user.id
      )
      and not exists (
        select 1
        from public.organization_invitations invitation
        where invitation.email = intent.email
          and invitation.accepted_at is null
          and invitation.revoked_at is null
          and invitation.expires_at > now()
      )
  );
$$;

create function public.complete_owner_signup(
  signup_token text default null,
  confirmed_gym_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_user_id uuid := (select auth.uid());
  authenticated_email text;
  normalized_gym_name text := trim(coalesce(confirmed_gym_name, ''));
  existing_membership public.organization_memberships%rowtype;
  pending_intent private.owner_signup_intents%rowtype;
  provisioned_organization_id uuid;
begin
  if authenticated_user_id is null then
    raise exception 'Authentication is required';
  end if;

  select lower(auth_user.email)
  into authenticated_email
  from auth.users auth_user
  join public.profiles profile on profile.id = auth_user.id
  where auth_user.id = authenticated_user_id
    and auth_user.email_confirmed_at is not null
    and profile.account_status = 'active'
  for update of auth_user;

  if authenticated_email is null then
    raise exception 'An active account with a confirmed email is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(authenticated_email, 0)
  );

  select * into existing_membership
  from public.organization_memberships membership
  where membership.user_id = authenticated_user_id
  order by membership.created_at
  limit 1;

  if found then
    if existing_membership.role = 'owner'
      and existing_membership.status = 'active' then
      return existing_membership.organization_id;
    end if;
    raise exception 'This account already has a Ravoge membership';
  end if;

  if exists (
    select 1
    from public.organization_invitations invitation
    where invitation.email = authenticated_email
      and invitation.accepted_at is null
      and invitation.revoked_at is null
      and invitation.expires_at > now()
  ) then
    raise exception 'Use the existing organization invitation for this account';
  end if;

  select * into pending_intent
  from private.owner_signup_intents intent
  where intent.email = authenticated_email
    and intent.consumed_at is null
    and intent.expires_at > now()
    and (
      (
        signup_token is not null
        and signup_token <> ''
        and intent.token_hash = encode(
          extensions.digest(signup_token, 'sha256'),
          'hex'
        )
      )
      or (
        (signup_token is null or signup_token = '')
        and char_length(normalized_gym_name) between 2 and 120
        and intent.organization_name = normalized_gym_name
      )
    )
  for update;

  if not found then
    raise exception 'No verified Owner signup is pending for this account';
  end if;

  insert into public.organization_creation_requests (
    requested_by,
    organization_name
  ) values (
    authenticated_user_id,
    pending_intent.organization_name
  );

  select request.organization_id
  into provisioned_organization_id
  from public.organization_creation_requests request
  where request.requested_by = authenticated_user_id;

  if provisioned_organization_id is null or not exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = provisioned_organization_id
      and membership.user_id = authenticated_user_id
      and membership.role = 'owner'
      and membership.status = 'active'
      and membership.is_primary_owner
  ) then
    raise exception 'Owner provisioning did not complete';
  end if;

  update private.owner_signup_intents
  set consumed_at = now(),
      consumed_by = authenticated_user_id,
      updated_at = now()
  where id = pending_intent.id;

  return provisioned_organization_id;
end;
$$;

revoke all on function public.begin_owner_signup(text, text, text)
  from public, anon, authenticated;
grant execute on function public.begin_owner_signup(text, text, text)
  to anon, authenticated;

revoke all on function public.has_pending_owner_signup()
  from public, anon, authenticated;
grant execute on function public.has_pending_owner_signup()
  to authenticated;

revoke all on function public.complete_owner_signup(text, text)
  from public, anon, authenticated;
grant execute on function public.complete_owner_signup(text, text)
  to authenticated;

drop policy if exists organization_requests_insert_self
  on public.organization_creation_requests;
revoke insert on public.organization_creation_requests from authenticated;

comment on table private.owner_signup_intents is
  'Server-controlled, expiring Owner onboarding state. Never exposed through the Data API.';
comment on function public.begin_owner_signup(text, text, text) is
  'Creates durable Owner onboarding intent without granting organization access.';
comment on function public.has_pending_owner_signup() is
  'Reports only whether the authenticated confirmed email has recoverable Owner onboarding state.';
comment on function public.complete_owner_signup(text, text) is
  'Idempotently provisions a new gym only after a valid opaque token or exact authenticated recovery confirmation.';
