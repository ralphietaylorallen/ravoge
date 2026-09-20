alter table public.organization_memberships
  add column is_primary_owner boolean not null default false;

alter table public.organization_memberships
  add constraint organization_memberships_primary_owner_role_check
  check (not is_primary_owner or (role = 'owner' and status = 'active'));

-- Existing organizations receive one deterministic owner of record. Refuse to
-- migrate an organization whose current data is already ownerless.
do $$
begin
  if exists (
    select 1
    from public.organizations organization
    where not exists (
      select 1
      from public.organization_memberships membership
      where membership.organization_id = organization.id
        and membership.role = 'owner'
        and membership.status = 'active'
    )
  ) then
    raise exception 'Cannot add primary owners while an organization has no active owner';
  end if;
end;
$$;

with ranked_owners as (
  select
    membership.id,
    row_number() over (
      partition by membership.organization_id
      order by membership.created_at, membership.id
    ) as owner_rank
  from public.organization_memberships membership
  where membership.role = 'owner'
    and membership.status = 'active'
)
update public.organization_memberships membership
set is_primary_owner = true
from ranked_owners
where membership.id = ranked_owners.id
  and ranked_owners.owner_rank = 1;

create unique index organization_memberships_one_primary_owner_idx
  on public.organization_memberships (organization_id)
  where is_primary_owner;

create or replace function private.assign_initial_primary_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role <> 'owner' or new.status <> 'active' then
    new.is_primary_owner := false;
    return new;
  end if;

  -- Lock the parent organization so concurrent owner inserts cannot both
  -- become the owner of record.
  perform 1
  from public.organizations
  where id = new.organization_id
  for update;

  new.is_primary_owner := not exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = new.organization_id
      and membership.is_primary_owner
  );

  return new;
end;
$$;

create trigger assign_initial_primary_owner
  before insert on public.organization_memberships
  for each row execute function private.assign_initial_primary_owner();

create or replace function private.enforce_membership_immutability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.organization_id <> old.organization_id
    or new.user_id <> old.user_id
    or new.role <> old.role
    or new.invitation_id is distinct from old.invitation_id
    or new.is_primary_owner is distinct from old.is_primary_owner then
    raise exception 'Membership identity, role, and primary-owner status are immutable';
  end if;
  return new;
end;
$$;

create function private.protect_organization_owners()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  removing_active_owner boolean;
begin
  if old.is_primary_owner and (
    tg_op = 'DELETE'
    or new.status <> 'active'
    or new.role <> 'owner'
    or not new.is_primary_owner
  ) then
    raise exception 'Transfer primary ownership before removing or deactivating the primary owner';
  end if;

  removing_active_owner := old.role = 'owner'
    and old.status = 'active'
    and (
      tg_op = 'DELETE'
      or new.role <> 'owner'
      or new.status <> 'active'
    );

  if removing_active_owner then
    perform 1
    from public.organizations
    where id = old.organization_id
    for update;

    if not exists (
      select 1
      from public.organization_memberships membership
      where membership.organization_id = old.organization_id
        and membership.id <> old.id
        and membership.role = 'owner'
        and membership.status = 'active'
    ) then
      raise exception 'An organization must retain at least one active owner';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger protect_organization_owners
  before update or delete on public.organization_memberships
  for each row execute function private.protect_organization_owners();

revoke execute on function private.assign_initial_primary_owner() from public, anon, authenticated;
revoke execute on function private.protect_organization_owners() from public, anon, authenticated;

alter table public.organization_invitations
  drop constraint if exists organization_invitations_role_check;

alter table public.organization_invitations
  add constraint organization_invitations_role_check
  check (role in ('owner', 'coach', 'client'));

drop policy invitations_insert_authorized on public.organization_invitations;
create policy invitations_insert_authorized
  on public.organization_invitations for insert to authenticated
  with check (
    invited_by = (select auth.uid())
    and accepted_at is null
    and accepted_by is null
    and revoked_at is null
    and expires_at <= now() + interval '8 days'
    and (
      (
        role in ('owner', 'coach', 'client')
        and (select private.has_active_role(
          organization_id,
          array['owner']::public.organization_role[]
        ))
      )
      or (
        role = 'client'
        and (select private.has_active_role(
          organization_id,
          array['coach']::public.organization_role[]
        ))
      )
    )
  );

comment on column public.organization_memberships.is_primary_owner is
  'Marks the organization owner of record. Immutable until a future audited transfer operation is implemented.';
