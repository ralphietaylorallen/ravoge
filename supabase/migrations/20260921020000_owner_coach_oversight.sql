-- Owners can choose a client's primary coach through a constrained RPC. The
-- organization is always derived from the authenticated owner's membership.
-- Every assignment state change records the real authenticated actor.

do $$
begin
  if exists (
    select 1
    from public.coach_client_assignments assignment
    where assignment.status = 'active'
    group by assignment.organization_id, assignment.client_user_id
    having count(*) > 1
  ) then
    raise exception 'Resolve clients with multiple active primary coaches before applying owner oversight';
  end if;
end;
$$;

create unique index coach_client_assignments_one_active_coach_per_client_idx
  on public.coach_client_assignments (organization_id, client_user_id)
  where status = 'active';

create table public.coach_client_assignment_audit (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references public.coach_client_assignments (id) on delete set null,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_user_id uuid not null references auth.users (id) on delete restrict,
  coach_user_id uuid not null references auth.users (id) on delete restrict,
  client_user_id uuid not null references auth.users (id) on delete restrict,
  action text not null check (action in ('assigned', 'reactivated', 'deactivated')),
  created_at timestamptz not null default now()
);

create index coach_client_assignment_audit_org_client_created_idx
  on public.coach_client_assignment_audit (organization_id, client_user_id, created_at desc);
create index coach_client_assignment_audit_org_coach_created_idx
  on public.coach_client_assignment_audit (organization_id, coach_user_id, created_at desc);
create index coach_client_assignment_audit_actor_idx
  on public.coach_client_assignment_audit (actor_user_id);
create index coach_client_assignment_audit_assignment_idx
  on public.coach_client_assignment_audit (assignment_id)
  where assignment_id is not null;

create function private.log_coach_client_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_actor uuid := (select auth.uid());
  event_action text;
begin
  -- Migration fixtures and trusted administrative maintenance can run without
  -- a request identity. All Data API mutations do have auth.uid() and are
  -- recorded here.
  if authenticated_actor is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    event_action := case when new.status = 'active' then 'assigned' else 'deactivated' end;
  elsif old.status = new.status then
    return new;
  elsif new.status = 'active' then
    event_action := 'reactivated';
  else
    event_action := 'deactivated';
  end if;

  insert into public.coach_client_assignment_audit (
    assignment_id,
    organization_id,
    actor_user_id,
    coach_user_id,
    client_user_id,
    action
  ) values (
    new.id,
    new.organization_id,
    authenticated_actor,
    new.coach_user_id,
    new.client_user_id,
    event_action
  );

  return new;
end;
$$;

create trigger log_coach_client_assignment_change
  after insert or update of status on public.coach_client_assignments
  for each row execute function private.log_coach_client_assignment_change();

create function public.assign_client_to_coach(
  target_client_user_id uuid,
  target_coach_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
    and client.role = 'client'
    and client.status = 'active'
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
$$;

alter table public.coach_client_assignment_audit enable row level security;

create policy coach_client_assignment_audit_select_owners
  on public.coach_client_assignment_audit for select to authenticated
  using ((select private.has_active_role(
    organization_id,
    array['owner']::public.organization_role[]
  )));

revoke all on public.coach_client_assignment_audit from public, anon, authenticated;
grant select on public.coach_client_assignment_audit to authenticated;

revoke all on function private.log_coach_client_assignment_change()
  from public, anon, authenticated;
revoke all on function public.assign_client_to_coach(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.assign_client_to_coach(uuid, uuid)
  to authenticated;

comment on table public.coach_client_assignment_audit is
  'Immutable assignment audit events. actor_user_id is always the authenticated user who made the change.';
comment on function public.assign_client_to_coach(uuid, uuid) is
  'Assigns one active primary coach to a same-organization client for the authenticated owner.';
