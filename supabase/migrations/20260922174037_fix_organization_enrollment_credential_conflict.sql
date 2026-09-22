-- Qualify the unique conflict target by constraint name. The function's
-- table-return column names are PL/pgSQL variables and made the original
-- column-list conflict target ambiguous.
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

revoke all on function public.ensure_organization_enrollment_credential(
  public.organization_role, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.ensure_organization_enrollment_credential(
  public.organization_role, uuid, uuid, text
) to authenticated;
