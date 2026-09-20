create index coach_client_assignments_org_client_idx
  on public.coach_client_assignments (organization_id, client_user_id);

create index organization_invitations_accepted_by_idx
  on public.organization_invitations (accepted_by);

create index organization_invitations_invited_by_idx
  on public.organization_invitations (invited_by);

revoke all on function public.rls_auto_enable() from public, anon, authenticated;
