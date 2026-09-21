-- Separate a person's Ravoge identity intent from organization authorization.
-- This value drives unaffiliated onboarding only. All organization access
-- remains governed by organization_memberships and RLS.
alter table public.profiles
  add column account_type public.organization_role;

update public.profiles profile
set account_type = membership.role
from public.organization_memberships membership
where membership.user_id = profile.id
  and membership.status = 'active';

comment on column public.profiles.account_type is
  'Non-authorizing account intent used only for unaffiliated onboarding and routing. Organization access always requires an active membership.';

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  supplied_name text;
begin
  supplied_name := trim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  if char_length(supplied_name) < 2 then
    supplied_name := split_part(coalesce(new.email, 'Ravoge member'), '@', 1);
  end if;
  if char_length(supplied_name) < 2 then
    supplied_name := 'Ravoge member';
  end if;

  insert into public.profiles (id, full_name)
  values (new.id, left(supplied_name, 120));
  return new;
end;
$$;

create function public.register_unaffiliated_account_type(
  intended_type public.organization_role
)
returns public.organization_role
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  current_type public.organization_role;
begin
  if actor_user_id is null then
    raise exception 'Authentication is required';
  end if;
  if intended_type not in ('coach', 'client') then
    raise exception 'Only Coach or Client identity setup is supported';
  end if;
  if exists (
    select 1 from public.organization_memberships membership
    where membership.user_id = actor_user_id
  ) then
    raise exception 'This account already has a Ravoge membership';
  end if;

  select profile.account_type into current_type
  from public.profiles profile
  where profile.id = actor_user_id
    and profile.account_status = 'active'
  for update;

  if not found then
    raise exception 'An active Ravoge profile is required';
  end if;
  if current_type is not null and current_type <> intended_type then
    raise exception 'This account is already registered for another account type';
  end if;

  update public.profiles
  set account_type = intended_type
  where id = actor_user_id;
  return intended_type;
end;
$$;

create function private.enforce_membership_account_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_type public.organization_role;
begin
  select profile.account_type into current_type
  from public.profiles profile
  where profile.id = new.user_id
    and profile.account_status = 'active'
  for update;

  if not found then
    raise exception 'An active Ravoge profile is required';
  end if;
  if current_type is not null and current_type <> new.role then
    raise exception 'Account type does not match the membership role';
  end if;
  return new;
end;
$$;

create function private.sync_membership_account_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set account_type = new.role
  where id = new.user_id;
  return new;
end;
$$;

create trigger enforce_membership_account_type
  before insert on public.organization_memberships
  for each row execute function private.enforce_membership_account_type();

create trigger sync_membership_account_type
  after insert on public.organization_memberships
  for each row execute function private.sync_membership_account_type();

-- Allow an authenticated Coach or Client identity to maintain its base profile
-- before joining a gym. No organization-scoped fields are accepted here.
create or replace function public.update_own_profile(profile_patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_role public.organization_role;
  normalized_specialties text[];
begin
  if actor_user_id is null or profile_patch is null or jsonb_typeof(profile_patch) <> 'object' then
    raise exception 'A valid authenticated profile update is required';
  end if;

  if profile_patch - array['fullName','preferredName','bio','specialties','yearsCoaching','avatarPath'] <> '{}'::jsonb then
    raise exception 'Profile update contains unsupported fields';
  end if;

  select membership.role into actor_role
  from public.organization_memberships membership
  join public.organizations organization on organization.id = membership.organization_id
  join public.profiles profile on profile.id = membership.user_id
  where membership.user_id = actor_user_id
    and membership.status = 'active'
    and organization.status = 'active'
    and profile.account_status = 'active'
  order by membership.created_at
  limit 1;

  if actor_role is null then
    select profile.account_type into actor_role
    from public.profiles profile
    where profile.id = actor_user_id
      and profile.account_status = 'active';
  end if;

  if actor_role is null then
    raise exception 'A valid Ravoge account type is required';
  end if;

  if profile_patch ? 'specialties'
    and jsonb_typeof(profile_patch -> 'specialties') <> 'array' then
    raise exception 'Specialties must be an array';
  end if;

  normalized_specialties := case
    when profile_patch ? 'specialties' then array(
      select distinct left(trim(value), 80)
      from jsonb_array_elements_text(profile_patch -> 'specialties') value
      where char_length(trim(value)) > 0
      limit 20
    )
    else null
  end;

  if actor_role = 'coach' then
    update public.profiles
    set
      full_name = case when profile_patch ? 'fullName' then trim(profile_patch ->> 'fullName') else full_name end,
      preferred_name = case when profile_patch ? 'preferredName' then nullif(trim(profile_patch ->> 'preferredName'), '') else preferred_name end,
      bio = case when profile_patch ? 'bio' then nullif(trim(profile_patch ->> 'bio'), '') else bio end,
      specialties = coalesce(normalized_specialties, specialties),
      years_coaching = case when profile_patch ? 'yearsCoaching' and nullif(profile_patch ->> 'yearsCoaching', '') is not null
        then (profile_patch ->> 'yearsCoaching')::smallint
        when profile_patch ? 'yearsCoaching' then null else years_coaching end,
      avatar_path = case when profile_patch ? 'avatarPath' then nullif(profile_patch ->> 'avatarPath', '') else avatar_path end,
      avatar_updated_at = case when profile_patch ? 'avatarPath' then now() else avatar_updated_at end
    where id = actor_user_id;
  elsif actor_role = 'client' then
    if profile_patch ?| array['specialties','yearsCoaching'] then
      raise exception 'Clients cannot modify Coach profile fields';
    end if;
    update public.profiles
    set
      full_name = case when profile_patch ? 'fullName' then trim(profile_patch ->> 'fullName') else full_name end,
      preferred_name = case when profile_patch ? 'preferredName' then nullif(trim(profile_patch ->> 'preferredName'), '') else preferred_name end,
      bio = case when profile_patch ? 'bio' then nullif(trim(profile_patch ->> 'bio'), '') else bio end,
      avatar_path = case when profile_patch ? 'avatarPath' then nullif(profile_patch ->> 'avatarPath', '') else avatar_path end,
      avatar_updated_at = case when profile_patch ? 'avatarPath' then now() else avatar_updated_at end
    where id = actor_user_id;
  else
    if profile_patch ?| array['specialties','yearsCoaching'] then
      raise exception 'Owners cannot modify Coach profile fields';
    end if;
    update public.profiles
    set
      full_name = case when profile_patch ? 'fullName' then trim(profile_patch ->> 'fullName') else full_name end,
      preferred_name = case when profile_patch ? 'preferredName' then nullif(trim(profile_patch ->> 'preferredName'), '') else preferred_name end,
      bio = case when profile_patch ? 'bio' then nullif(trim(profile_patch ->> 'bio'), '') else bio end,
      avatar_path = case when profile_patch ? 'avatarPath' then nullif(profile_patch ->> 'avatarPath', '') else avatar_path end,
      avatar_updated_at = case when profile_patch ? 'avatarPath' then now() else avatar_updated_at end
    where id = actor_user_id;
  end if;
exception
  when invalid_text_representation then raise exception 'Profile values are invalid';
end;
$$;

alter table public.profiles
  drop constraint profiles_avatar_path_check,
  add constraint profiles_avatar_path_check check (
    avatar_path is null
    or avatar_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/avatar\.(jpg|png|webp)$'
  );

create or replace function private.can_write_profile_asset(asset_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  path_organization_id uuid;
  path_user_id uuid;
begin
  if asset_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/avatar\.(jpg|png|webp)$' then return false; end if;
  path_organization_id := split_part(asset_name, '/', 1)::uuid;
  path_user_id := split_part(asset_name, '/', 2)::uuid;
  if path_user_id <> (select auth.uid()) then return false; end if;

  if path_organization_id = '00000000-0000-0000-0000-000000000000'::uuid then
    return exists (
      select 1 from public.profiles profile
      where profile.id = path_user_id
        and profile.account_status = 'active'
        and profile.account_type in ('coach', 'client')
    );
  end if;

  return private.has_active_role(
    path_organization_id,
    array['owner','coach','client']::public.organization_role[]
  );
exception when invalid_text_representation then return false;
end;
$$;

create or replace function private.can_read_profile_asset(asset_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  path_organization_id uuid;
  path_user_id uuid;
begin
  if asset_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/avatar\.(jpg|png|webp)$' then return false; end if;
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
      and membership.user_id = path_user_id
      and membership.status = 'active'
      and organization.status = 'active'
      and profile.account_status = 'active'
  ) and private.can_view_profile(path_user_id);
exception when invalid_text_representation then return false;
end;
$$;

-- Invitation creation is a server-validated operation. Direct inserts and
-- updates are removed so organization, role, inviter, and email cannot be
-- changed through request tampering.
create type public.invitation_delivery_status as enum (
  'not_configured',
  'pending',
  'sent',
  'failed'
);

alter table public.organization_invitations
  add column delivery_status public.invitation_delivery_status not null default 'not_configured',
  add column delivery_attempted_at timestamptz,
  add column delivery_error text,
  add column provider_message_id text,
  add constraint organization_invitations_delivery_error_length_check
    check (delivery_error is null or char_length(delivery_error) <= 500),
  add constraint organization_invitations_provider_message_id_length_check
    check (provider_message_id is null or char_length(provider_message_id) <= 255);

with ranked_pending as (
  select invitation.id,
    row_number() over (
      partition by invitation.organization_id, invitation.email, invitation.role
      order by invitation.created_at desc, invitation.id desc
    ) as pending_rank
  from public.organization_invitations invitation
  where invitation.accepted_at is null
    and invitation.revoked_at is null
)
update public.organization_invitations invitation
set revoked_at = now()
from ranked_pending
where invitation.id = ranked_pending.id
  and ranked_pending.pending_rank > 1;

create unique index organization_invitations_one_pending_role_idx
  on public.organization_invitations (organization_id, email, role)
  where accepted_at is null and revoked_at is null;

create function public.create_organization_invitation(
  invited_email text,
  invited_role public.organization_role,
  invitation_token_hash text,
  invitation_expires_at timestamptz
)
returns table (
  invitation_id uuid,
  organization_id uuid,
  organization_name text,
  email text,
  role public.organization_role,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
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
  where membership.user_id = actor_user_id and membership.status = 'active'
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
$$;

create function public.get_organization_invitation_context(invitation_token text)
returns table (
  email text,
  role public.organization_role,
  organization_name text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select invitation.email, invitation.role, organization.name, invitation.expires_at
  from public.organization_invitations invitation
  join public.organizations organization
    on organization.id = invitation.organization_id and organization.status = 'active'
  where char_length(invitation_token) >= 32
    and invitation.token_hash = encode(extensions.digest(invitation_token, 'sha256'), 'hex')
    and invitation.accepted_at is null
    and invitation.revoked_at is null
    and invitation.expires_at > now()
  limit 1;
$$;

create function public.record_organization_invitation_delivery(
  target_invitation_id uuid,
  new_delivery_status public.invitation_delivery_status,
  new_delivery_error text default null,
  new_provider_message_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_invitation public.organization_invitations%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required'; end if;
  select * into strict target_invitation
  from public.organization_invitations invitation
  where invitation.id = target_invitation_id
  for update;

  if not private.has_active_role(target_invitation.organization_id, array['owner']::public.organization_role[])
    and not (
      target_invitation.invited_by = (select auth.uid())
      and private.has_active_role(target_invitation.organization_id, array['coach']::public.organization_role[])
    ) then
    raise exception 'Invitation access is not permitted';
  end if;

  update public.organization_invitations
  set delivery_status = new_delivery_status,
      delivery_attempted_at = now(),
      delivery_error = left(nullif(trim(new_delivery_error), ''), 500),
      provider_message_id = left(nullif(trim(new_provider_message_id), ''), 255)
  where id = target_invitation.id;
exception when no_data_found then raise exception 'Invitation not found';
end;
$$;

create function public.revoke_organization_invitation(target_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_invitation public.organization_invitations%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required'; end if;
  select * into strict target_invitation
  from public.organization_invitations invitation
  where invitation.id = target_invitation_id and invitation.accepted_at is null
  for update;

  if not private.has_active_role(target_invitation.organization_id, array['owner']::public.organization_role[])
    and not (
      target_invitation.invited_by = (select auth.uid())
      and private.has_active_role(target_invitation.organization_id, array['coach']::public.organization_role[])
    ) then
    raise exception 'Invitation access is not permitted';
  end if;

  update public.organization_invitations
  set revoked_at = coalesce(revoked_at, now())
  where id = target_invitation.id;
exception when no_data_found then raise exception 'Invitation not found';
end;
$$;

create or replace function public.accept_organization_invitation(invitation_token text)
returns public.organization_role
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  authenticated_email text;
  matching_invitation public.organization_invitations%rowtype;
  existing_membership public.organization_memberships%rowtype;
begin
  if actor_user_id is null or char_length(invitation_token) < 32 then
    raise exception 'Invalid invitation';
  end if;

  select lower(auth_user.email) into authenticated_email
  from auth.users auth_user
  join public.profiles profile on profile.id = auth_user.id and profile.account_status = 'active'
  where auth_user.id = actor_user_id and auth_user.email_confirmed_at is not null;
  if authenticated_email is null then raise exception 'An active account with a confirmed email is required'; end if;

  select * into strict matching_invitation
  from public.organization_invitations invitation
  where invitation.token_hash = encode(extensions.digest(invitation_token, 'sha256'), 'hex')
    and invitation.email = authenticated_email
  for update;

  if matching_invitation.accepted_at is not null then
    if matching_invitation.accepted_by = actor_user_id and exists (
      select 1 from public.organization_memberships membership
      where membership.user_id = actor_user_id
        and membership.organization_id = matching_invitation.organization_id
        and membership.role = matching_invitation.role
        and membership.status = 'active'
    ) then return matching_invitation.role; end if;
    raise exception 'Invitation has already been used';
  end if;
  if matching_invitation.revoked_at is not null or matching_invitation.expires_at <= now() then
    raise exception 'Invalid or expired invitation';
  end if;

  select * into existing_membership
  from public.organization_memberships membership
  where membership.user_id = actor_user_id
  order by membership.created_at limit 1;
  if found then raise exception 'This account already has a Ravoge membership'; end if;

  insert into public.organization_memberships (
    organization_id, user_id, role, status, invitation_id
  ) values (
    matching_invitation.organization_id, actor_user_id,
    matching_invitation.role, 'active', matching_invitation.id
  );
  return matching_invitation.role;
exception when no_data_found then raise exception 'Invalid or expired invitation';
end;
$$;

drop policy if exists invitations_insert_authorized on public.organization_invitations;
drop policy if exists invitations_update_authorized on public.organization_invitations;
revoke insert on public.organization_invitations from authenticated;
revoke update (revoked_at) on public.organization_invitations from authenticated;

revoke all on function public.register_unaffiliated_account_type(public.organization_role) from public, anon, authenticated;
grant execute on function public.register_unaffiliated_account_type(public.organization_role) to authenticated;
revoke all on function public.create_organization_invitation(text, public.organization_role, text, timestamptz) from public, anon, authenticated;
grant execute on function public.create_organization_invitation(text, public.organization_role, text, timestamptz) to authenticated;
revoke all on function public.get_organization_invitation_context(text) from public, anon, authenticated;
grant execute on function public.get_organization_invitation_context(text) to anon, authenticated;
revoke all on function public.record_organization_invitation_delivery(uuid, public.invitation_delivery_status, text, text) from public, anon, authenticated;
grant execute on function public.record_organization_invitation_delivery(uuid, public.invitation_delivery_status, text, text) to authenticated;
revoke all on function public.revoke_organization_invitation(uuid) from public, anon, authenticated;
grant execute on function public.revoke_organization_invitation(uuid) to authenticated;
revoke all on function public.accept_organization_invitation(text) from public, anon, authenticated;
grant execute on function public.accept_organization_invitation(text) to authenticated;

revoke execute on function private.enforce_membership_account_type() from public, anon, authenticated;
revoke execute on function private.sync_membership_account_type() from public, anon, authenticated;

comment on function public.register_unaffiliated_account_type(public.organization_role) is
  'Records non-authorizing Coach or Client identity intent for the authenticated user before gym membership.';
comment on function public.create_organization_invitation(text, public.organization_role, text, timestamptz) is
  'Creates one server-validated, email-bound gym invitation for the authenticated Owner or Coach.';
comment on function public.get_organization_invitation_context(text) is
  'Returns minimal context for a valid opaque invitation; possession does not grant membership.';
