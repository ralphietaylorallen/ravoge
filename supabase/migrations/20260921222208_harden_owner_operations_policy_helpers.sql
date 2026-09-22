-- Keep the lower-level assignment predicate private while exposing only the
-- minimum boolean authorization decisions needed by RLS.
create function private.can_read_client_progress(
  target_organization_id uuid,
  target_client_user_id uuid
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
      array['owner']::public.organization_role[]
    )
    or (
      target_client_user_id = (select auth.uid())
      and private.has_active_role(
        target_organization_id,
        array['client']::public.organization_role[]
      )
    )
    or private.has_active_coach_client_assignment(
      target_organization_id,
      (select auth.uid()),
      target_client_user_id
    );
$$;

create function private.can_record_client_progress(
  target_organization_id uuid,
  target_client_user_id uuid
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
      array['owner']::public.organization_role[]
    )
    or private.has_active_coach_client_assignment(
      target_organization_id,
      (select auth.uid()),
      target_client_user_id
    );
$$;

drop policy client_body_composition_select_authorized
  on public.client_body_composition_assessments;
create policy client_body_composition_select_authorized
  on public.client_body_composition_assessments for select to authenticated
  using ((select private.can_read_client_progress(
    organization_id,
    client_user_id
  )));

drop policy client_body_composition_insert_authorized
  on public.client_body_composition_assessments;
create policy client_body_composition_insert_authorized
  on public.client_body_composition_assessments for insert to authenticated
  with check (
    recorded_by = (select auth.uid())
    and (select private.can_record_client_progress(
      organization_id,
      client_user_id
    ))
  );

revoke all on function private.can_read_client_progress(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.can_record_client_progress(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.can_read_client_progress(uuid, uuid)
  to authenticated;
grant execute on function private.can_record_client_progress(uuid, uuid)
  to authenticated;
