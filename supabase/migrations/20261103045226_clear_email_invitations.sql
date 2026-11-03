-- Clearing is an audited visibility change, never deletion or membership removal.
alter table public.organization_invitations
  add column cleared_at timestamptz,
  add column cleared_by uuid references public.profiles(id) on delete set null,
  add constraint organization_invitations_cleared_unaccepted_check
    check (cleared_at is null or (revoked_at is not null and accepted_at is null));
create index organization_invitations_cleared_by_idx on public.organization_invitations(cleared_by);

create function private.clear_email_invitations(invitation_ids uuid[])
returns integer language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid(); org uuid; invitation record; matched integer; changed integer;
begin
  if actor is null then raise exception 'Owner access required' using errcode='42501'; end if;
  select m.organization_id into org from public.organization_memberships m
    where m.user_id=actor and m.role='owner' and m.status='active' for share;
  if org is null or not private.has_active_role(org,array['owner']::public.organization_role[]) then
    raise exception 'Owner access required' using errcode='42501';
  end if;
  if invitation_ids is null or cardinality(invitation_ids) not between 1 and 1000
    or (select count(distinct id) from unnest(invitation_ids) id)<>cardinality(invitation_ids) then
    raise exception 'Select between 1 and 1000 different invitations' using errcode='22023';
  end if;
  -- Same row locks as acceptance/refresh/revocation. Validate the entire batch
  -- before changing any row; an accepted or foreign invitation aborts all of it.
  perform i.id from public.organization_invitations i where i.id=any(invitation_ids) and i.organization_id=org order by i.id for update;
  select count(*) into matched from public.organization_invitations i
    where i.id=any(invitation_ids) and i.organization_id=org and i.accepted_at is null;
  if matched<>cardinality(invitation_ids) then
    raise exception 'Some invitations are unavailable or already accepted' using errcode='42501';
  end if;
  for invitation in select i.id from public.organization_invitations i
    where i.id=any(invitation_ids) and i.organization_id=org and i.cleared_at is null order by i.id loop
    -- Reuse the existing signup-link revocation rules.
    perform public.revoke_organization_invitation(invitation.id);
  end loop;
  update public.organization_invitations i set cleared_at=now(),cleared_by=actor
    where i.id=any(invitation_ids) and i.organization_id=org and i.cleared_at is null and i.accepted_at is null;
  get diagnostics changed = row_count;
  return changed;
end;
$$;
create function public.clear_email_invitations(invitation_ids uuid[])
returns integer language sql security invoker set search_path='' as $$
  select private.clear_email_invitations(invitation_ids);
$$;
revoke all on function private.clear_email_invitations(uuid[]),public.clear_email_invitations(uuid[]) from public,anon;
grant execute on function private.clear_email_invitations(uuid[]),public.clear_email_invitations(uuid[]) to authenticated;
-- Existing RLS and restricted DML grants remain unchanged. Owners retain audit
-- read access; the Team page alone filters cleared rows out of its active list.
