create unique index organization_memberships_one_active_per_user_idx
  on public.organization_memberships (user_id)
  where status = 'active';

create or replace function private.can_view_profile(target_user_id uuid)
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
      join public.profiles viewer_profile
        on viewer_profile.id = viewer.user_id
       and viewer_profile.account_status = 'active'
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
      join public.profiles viewer_profile
        on viewer_profile.id = viewer.user_id
       and viewer_profile.account_status = 'active'
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
      join public.profiles viewer_profile
        on viewer_profile.id = viewer.user_id
       and viewer_profile.account_status = 'active'
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

create or replace function private.can_view_membership(
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
    private.has_active_role(
      target_organization_id,
      array['owner', 'coach', 'client']::public.organization_role[]
    )
    and (
      target_user_id = (select auth.uid())
      or private.has_active_role(
        target_organization_id,
        array['owner']::public.organization_role[]
      )
      or exists (
        select 1
        from public.coach_client_assignments assignment
        join public.organization_memberships client
          on client.organization_id = assignment.organization_id
         and client.user_id = assignment.client_user_id
         and client.role = 'client'
         and client.status = 'active'
        where assignment.organization_id = target_organization_id
          and assignment.coach_user_id = (select auth.uid())
          and assignment.client_user_id = target_user_id
          and assignment.status = 'active'
          and private.has_active_role(
            target_organization_id,
            array['coach']::public.organization_role[]
          )
      )
    );
$$;

create or replace function public.accept_organization_invitation(invitation_token text)
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
    from auth.users auth_user
    join public.profiles profile on profile.id = auth_user.id
    where auth_user.id = authenticated_user_id
      and auth_user.email_confirmed_at is not null
      and lower(auth_user.email) = authenticated_email
      and profile.account_status = 'active'
  ) then
    raise exception 'An active account with a confirmed email is required';
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

drop policy invitations_select_authorized on public.organization_invitations;
create policy invitations_select_authorized
  on public.organization_invitations for select to authenticated
  using (
    (select private.has_active_role(
      organization_id,
      array['owner']::public.organization_role[]
    ))
    or (
      invited_by = (select auth.uid())
      and (select private.has_active_role(
        organization_id,
        array['coach']::public.organization_role[]
      ))
    )
  );

drop policy invitations_update_authorized on public.organization_invitations;
create policy invitations_update_authorized
  on public.organization_invitations for update to authenticated
  using (
    (select private.has_active_role(
      organization_id,
      array['owner']::public.organization_role[]
    ))
    or (
      invited_by = (select auth.uid())
      and (select private.has_active_role(
        organization_id,
        array['coach']::public.organization_role[]
      ))
    )
  )
  with check (
    revoked_at is not null
    and (
      (select private.has_active_role(
        organization_id,
        array['owner']::public.organization_role[]
      ))
      or (
        invited_by = (select auth.uid())
        and (select private.has_active_role(
          organization_id,
          array['coach']::public.organization_role[]
        ))
      )
    )
  );
