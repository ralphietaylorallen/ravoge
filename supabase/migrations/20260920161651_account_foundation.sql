create type public.account_status as enum ('active', 'inactive');
create type public.organization_status as enum ('active', 'inactive');
create type public.organization_role as enum ('owner', 'coach', 'client');
create type public.membership_status as enum ('active', 'inactive');
create type public.assignment_status as enum ('active', 'inactive');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  account_status public.account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  status public.organization_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  invited_by uuid not null references auth.users (id) on delete restrict,
  email text not null check (email = lower(trim(email)) and char_length(email) <= 320),
  role public.organization_role not null check (role in ('coach', 'client')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (accepted_at is null or accepted_by is not null)
);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.organization_role not null,
  status public.membership_status not null default 'active',
  invitation_id uuid unique references public.organization_invitations (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table public.coach_client_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  coach_user_id uuid not null references auth.users (id) on delete cascade,
  client_user_id uuid not null references auth.users (id) on delete cascade,
  status public.assignment_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, coach_user_id, client_user_id),
  check (coach_user_id <> client_user_id),
  foreign key (organization_id, coach_user_id)
    references public.organization_memberships (organization_id, user_id)
    on delete cascade,
  foreign key (organization_id, client_user_id)
    references public.organization_memberships (organization_id, user_id)
    on delete cascade
);

create table public.organization_creation_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null unique references auth.users (id) on delete cascade,
  organization_name text not null check (char_length(trim(organization_name)) between 2 and 120),
  organization_id uuid unique references public.organizations (id) on delete set null,
  created_at timestamptz not null default now()
);

create index organization_memberships_user_status_idx
  on public.organization_memberships (user_id, status, organization_id);
create index organization_memberships_org_role_status_idx
  on public.organization_memberships (organization_id, role, status);
create index organization_invitations_org_created_idx
  on public.organization_invitations (organization_id, created_at desc);
create index organization_invitations_pending_email_idx
  on public.organization_invitations (email, role, expires_at)
  where accepted_at is null and revoked_at is null;
create index coach_client_assignments_coach_active_idx
  on public.coach_client_assignments (coach_user_id, organization_id, client_user_id)
  where status = 'active';
create index coach_client_assignments_client_active_idx
  on public.coach_client_assignments (client_user_id, organization_id, coach_user_id)
  where status = 'active';

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create function private.has_active_role(
  target_organization_id uuid,
  allowed_roles public.organization_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    join public.organizations organization
      on organization.id = membership.organization_id
    join public.profiles profile
      on profile.id = membership.user_id
    where membership.organization_id = target_organization_id
      and membership.user_id = (select auth.uid())
      and membership.role = any (allowed_roles)
      and membership.status = 'active'
      and organization.status = 'active'
      and profile.account_status = 'active'
  );
$$;

create function private.can_view_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_user_id = (select auth.uid())
    or exists (
      select 1
      from public.organization_memberships viewer
      join public.organization_memberships target
        on target.organization_id = viewer.organization_id
      join public.organizations organization on organization.id = viewer.organization_id
      where viewer.user_id = (select auth.uid())
        and viewer.role = 'owner'
        and viewer.status = 'active'
        and target.user_id = target_user_id
        and target.status = 'active'
        and organization.status = 'active'
    )
    or exists (
      select 1
      from public.coach_client_assignments assignment
      join public.organization_memberships viewer
        on viewer.organization_id = assignment.organization_id
       and viewer.user_id = assignment.coach_user_id
       and viewer.role = 'coach'
       and viewer.status = 'active'
      join public.organization_memberships client
        on client.organization_id = assignment.organization_id
       and client.user_id = assignment.client_user_id
       and client.role = 'client'
       and client.status = 'active'
      join public.organizations organization on organization.id = assignment.organization_id
      where assignment.coach_user_id = (select auth.uid())
        and assignment.client_user_id = target_user_id
        and assignment.status = 'active'
        and organization.status = 'active'
    )
    or exists (
      select 1
      from public.coach_client_assignments assignment
      join public.organization_memberships viewer
        on viewer.organization_id = assignment.organization_id
       and viewer.user_id = assignment.client_user_id
       and viewer.role = 'client'
       and viewer.status = 'active'
      join public.organization_memberships coach
        on coach.organization_id = assignment.organization_id
       and coach.user_id = assignment.coach_user_id
       and coach.role = 'coach'
       and coach.status = 'active'
      join public.organizations organization on organization.id = assignment.organization_id
      where assignment.client_user_id = (select auth.uid())
        and assignment.coach_user_id = target_user_id
        and assignment.status = 'active'
        and organization.status = 'active'
    );
$$;

create function private.can_view_membership(
  target_organization_id uuid,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_user_id = (select auth.uid())
    or private.has_active_role(target_organization_id, array['owner']::public.organization_role[])
    or exists (
      select 1
      from public.coach_client_assignments assignment
      where assignment.organization_id = target_organization_id
        and assignment.coach_user_id = (select auth.uid())
        and assignment.client_user_id = target_user_id
        and assignment.status = 'active'
        and private.has_active_role(target_organization_id, array['coach']::public.organization_role[])
    );
$$;

create function private.can_create_assignment(
  target_organization_id uuid,
  target_coach_user_id uuid,
  target_client_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.has_active_role(target_organization_id, array['owner']::public.organization_role[])
    or (
      target_coach_user_id = (select auth.uid())
      and private.has_active_role(target_organization_id, array['coach']::public.organization_role[])
      and exists (
        select 1
        from public.organization_memberships client_membership
        join public.organization_invitations invitation
          on invitation.id = client_membership.invitation_id
        where client_membership.organization_id = target_organization_id
          and client_membership.user_id = target_client_user_id
          and client_membership.role = 'client'
          and client_membership.status = 'active'
          and invitation.invited_by = (select auth.uid())
          and invitation.accepted_by = target_client_user_id
      )
    );
$$;

revoke all on function private.has_active_role(uuid, public.organization_role[]) from public, anon;
revoke all on function private.can_view_profile(uuid) from public, anon;
revoke all on function private.can_view_membership(uuid, uuid) from public, anon;
revoke all on function private.can_create_assignment(uuid, uuid, uuid) from public, anon;
grant execute on function private.has_active_role(uuid, public.organization_role[]) to authenticated;
grant execute on function private.can_view_profile(uuid) to authenticated;
grant execute on function private.can_view_membership(uuid, uuid) to authenticated;
grant execute on function private.can_create_assignment(uuid, uuid, uuid) to authenticated;

create function public.accept_organization_invitation(invitation_token text)
returns public.organization_role
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_user_id uuid := (select auth.uid());
  authenticated_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
  matching_invitation public.organization_invitations%rowtype;
begin
  if authenticated_user_id is null or char_length(invitation_token) < 32 then
    raise exception 'Invalid invitation';
  end if;

  if not exists (
    select 1
    from auth.users
    where id = authenticated_user_id
      and email_confirmed_at is not null
      and lower(email) = authenticated_email
  ) then
    raise exception 'A confirmed email is required';
  end if;

  select * into strict matching_invitation
  from public.organization_invitations
  where token_hash = encode(extensions.digest(invitation_token, 'sha256'), 'hex')
    and email = authenticated_email
    and accepted_at is null
    and revoked_at is null
    and expires_at > now()
  for update;

  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    status,
    invitation_id
  ) values (
    matching_invitation.organization_id,
    authenticated_user_id,
    matching_invitation.role,
    'active',
    matching_invitation.id
  );

  return matching_invitation.role;
exception
  when no_data_found then
    raise exception 'Invalid or expired invitation';
end;
$$;

revoke all on function public.accept_organization_invitation(text) from public, anon, authenticated;
grant execute on function public.accept_organization_invitation(text) to authenticated;

create function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create function private.handle_new_auth_user()
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

create function private.fulfill_organization_creation_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_organization_id uuid;
begin
  if new.requested_by <> (select auth.uid()) then
    raise exception 'Organization request identity mismatch';
  end if;

  if exists (
    select 1 from public.organization_memberships
    where user_id = new.requested_by
  ) then
    raise exception 'A membership already exists for this user';
  end if;

  insert into public.organizations (name)
  values (trim(new.organization_name))
  returning id into new_organization_id;

  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    status
  ) values (
    new_organization_id,
    new.requested_by,
    'owner',
    'active'
  );

  update public.organization_creation_requests
  set organization_id = new_organization_id
  where id = new.id;

  return new;
end;
$$;

create trigger fulfill_organization_creation_request
  after insert on public.organization_creation_requests
  for each row execute function private.fulfill_organization_creation_request();

create function private.enforce_membership_immutability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.organization_id <> old.organization_id
    or new.user_id <> old.user_id
    or new.role <> old.role
    or new.invitation_id is distinct from old.invitation_id then
    raise exception 'Membership identity and role are immutable';
  end if;
  return new;
end;
$$;

create trigger enforce_membership_immutability
  before update on public.organization_memberships
  for each row execute function private.enforce_membership_immutability();

create function private.accept_membership_invitation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  matching_invitation public.organization_invitations%rowtype;
  inviter_role public.organization_role;
begin
  if new.invitation_id is null then
    return new;
  end if;

  select * into strict matching_invitation
  from public.organization_invitations
  where id = new.invitation_id
    and organization_id = new.organization_id
    and role = new.role
    and accepted_at is null
    and revoked_at is null
    and expires_at > now();

  update public.organization_invitations
  set accepted_at = now(), accepted_by = new.user_id
  where id = matching_invitation.id;

  if new.role = 'client' then
    select role into inviter_role
    from public.organization_memberships
    where organization_id = new.organization_id
      and user_id = matching_invitation.invited_by
      and status = 'active';

    if inviter_role = 'coach' then
      insert into public.coach_client_assignments (
        organization_id,
        coach_user_id,
        client_user_id
      ) values (
        new.organization_id,
        matching_invitation.invited_by,
        new.user_id
      ) on conflict (organization_id, coach_user_id, client_user_id)
        do update set status = 'active', updated_at = now();
    end if;
  end if;

  return new;
end;
$$;

create trigger accept_membership_invitation
  after insert on public.organization_memberships
  for each row execute function private.accept_membership_invitation();

create function private.enforce_assignment_membership_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.organization_memberships
    where organization_id = new.organization_id
      and user_id = new.coach_user_id
      and role = 'coach'
      and status = 'active'
  ) then
    raise exception 'Coach must have an active coach membership in the organization';
  end if;

  if not exists (
    select 1 from public.organization_memberships
    where organization_id = new.organization_id
      and user_id = new.client_user_id
      and role = 'client'
      and status = 'active'
  ) then
    raise exception 'Client must have an active client membership in the organization';
  end if;

  if tg_op = 'UPDATE' and (
    new.organization_id <> old.organization_id
    or new.coach_user_id <> old.coach_user_id
    or new.client_user_id <> old.client_user_id
  ) then
    raise exception 'Assignment identities are immutable';
  end if;

  return new;
end;
$$;

create trigger enforce_assignment_membership_roles
  before insert or update on public.coach_client_assignments
  for each row execute function private.enforce_assignment_membership_roles();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function private.set_updated_at();
create trigger memberships_set_updated_at
  before update on public.organization_memberships
  for each row execute function private.set_updated_at();
create trigger assignments_set_updated_at
  before update on public.coach_client_assignments
  for each row execute function private.set_updated_at();

revoke execute on function private.set_updated_at() from public, anon, authenticated;
revoke execute on function private.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function private.fulfill_organization_creation_request() from public, anon, authenticated;
revoke execute on function private.enforce_membership_immutability() from public, anon, authenticated;
revoke execute on function private.accept_membership_invitation() from public, anon, authenticated;
revoke execute on function private.enforce_assignment_membership_roles() from public, anon, authenticated;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.coach_client_assignments enable row level security;
alter table public.organization_creation_requests enable row level security;

create policy profiles_select_authorized
  on public.profiles for select to authenticated
  using ((select private.can_view_profile(id)));
create policy profiles_update_self
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy organizations_select_members
  on public.organizations for select to authenticated
  using ((select private.has_active_role(id, array['owner', 'coach', 'client']::public.organization_role[])));
create policy organizations_update_owners
  on public.organizations for update to authenticated
  using ((select private.has_active_role(id, array['owner']::public.organization_role[])))
  with check ((select private.has_active_role(id, array['owner']::public.organization_role[])));

create policy memberships_select_authorized
  on public.organization_memberships for select to authenticated
  using ((select private.can_view_membership(organization_id, user_id)));
create policy memberships_update_owners
  on public.organization_memberships for update to authenticated
  using ((select private.has_active_role(organization_id, array['owner']::public.organization_role[])))
  with check ((select private.has_active_role(organization_id, array['owner']::public.organization_role[])));

create policy invitations_select_authorized
  on public.organization_invitations for select to authenticated
  using (
    invited_by = (select auth.uid())
    or (select private.has_active_role(organization_id, array['owner']::public.organization_role[]))
  );
create policy invitations_insert_authorized
  on public.organization_invitations for insert to authenticated
  with check (
    invited_by = (select auth.uid())
    and accepted_at is null
    and accepted_by is null
    and revoked_at is null
    and expires_at <= now() + interval '8 days'
    and (
      (role in ('coach', 'client') and (select private.has_active_role(organization_id, array['owner']::public.organization_role[])))
      or (role = 'client' and (select private.has_active_role(organization_id, array['coach']::public.organization_role[])))
    )
  );
create policy invitations_update_authorized
  on public.organization_invitations for update to authenticated
  using (
    invited_by = (select auth.uid())
    or (select private.has_active_role(organization_id, array['owner']::public.organization_role[]))
  )
  with check (
    invited_by = (select auth.uid())
    or (select private.has_active_role(organization_id, array['owner']::public.organization_role[]))
  );

create policy assignments_select_authorized
  on public.coach_client_assignments for select to authenticated
  using (
    (select private.has_active_role(organization_id, array['owner']::public.organization_role[]))
    or (
      coach_user_id = (select auth.uid())
      and (select private.has_active_role(organization_id, array['coach']::public.organization_role[]))
    )
    or (
      client_user_id = (select auth.uid())
      and (select private.has_active_role(organization_id, array['client']::public.organization_role[]))
    )
  );
create policy assignments_insert_authorized
  on public.coach_client_assignments for insert to authenticated
  with check ((select private.can_create_assignment(organization_id, coach_user_id, client_user_id)));
create policy assignments_update_authorized
  on public.coach_client_assignments for update to authenticated
  using (
    (select private.has_active_role(organization_id, array['owner']::public.organization_role[]))
    or (
      coach_user_id = (select auth.uid())
      and (select private.has_active_role(organization_id, array['coach']::public.organization_role[]))
    )
  )
  with check (
    (select private.has_active_role(organization_id, array['owner']::public.organization_role[]))
    or (
      coach_user_id = (select auth.uid())
      and (select private.has_active_role(organization_id, array['coach']::public.organization_role[]))
    )
  );

create policy organization_requests_select_self
  on public.organization_creation_requests for select to authenticated
  using (requested_by = (select auth.uid()));
create policy organization_requests_insert_self
  on public.organization_creation_requests for insert to authenticated
  with check (
    requested_by = (select auth.uid())
    and organization_id is null
  );

revoke all on public.profiles from anon, authenticated;
revoke all on public.organizations from anon, authenticated;
revoke all on public.organization_invitations from anon, authenticated;
revoke all on public.organization_memberships from anon, authenticated;
revoke all on public.coach_client_assignments from anon, authenticated;
revoke all on public.organization_creation_requests from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant select on public.organizations to authenticated;
grant update (name) on public.organizations to authenticated;
grant select, insert on public.organization_invitations to authenticated;
grant update (revoked_at) on public.organization_invitations to authenticated;
grant select on public.organization_memberships to authenticated;
grant update (status) on public.organization_memberships to authenticated;
grant select, insert on public.coach_client_assignments to authenticated;
grant update (status) on public.coach_client_assignments to authenticated;
grant select, insert on public.organization_creation_requests to authenticated;
