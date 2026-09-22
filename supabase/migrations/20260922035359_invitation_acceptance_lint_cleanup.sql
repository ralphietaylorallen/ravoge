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

  if exists (
    select 1
    from public.organization_memberships membership
    where membership.user_id = actor_user_id
  ) then
    raise exception 'This account already has a Ravoge membership';
  end if;

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

revoke all on function public.accept_organization_invitation(text)
  from public, anon, authenticated;
grant execute on function public.accept_organization_invitation(text)
  to authenticated;

comment on function public.accept_organization_invitation(text) is
  'Atomically accepts an exact-email invitation for an authenticated user without an existing Ravoge membership.';
