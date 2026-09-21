create index booking_email_deliveries_organization_idx
  on public.booking_email_deliveries (organization_id);
create index booking_email_deliveries_recipient_idx
  on public.booking_email_deliveries (recipient_user_id);
create index booking_events_organization_idx
  on public.booking_events (organization_id);
create index booking_events_actor_idx
  on public.booking_events (actor_user_id);
create index bookings_booked_by_idx
  on public.bookings (booked_by);
create index bookings_organization_client_idx
  on public.bookings (organization_id, client_user_id);
create index bookings_organization_coach_idx
  on public.bookings (organization_id, coach_user_id);
create index coach_availability_coach_idx
  on public.coach_availability (coach_user_id);
create index coach_availability_exceptions_coach_idx
  on public.coach_availability_exceptions (coach_user_id);
create index coach_certifications_coach_idx
  on public.coach_certifications (coach_user_id);
create index organization_hours_updated_by_idx
  on public.organization_hours (updated_by);
create index organization_session_settings_updated_by_idx
  on public.organization_session_settings (updated_by);
create index organization_special_hours_created_by_idx
  on public.organization_special_hours (created_by);

drop policy organization_hours_all_owner on public.organization_hours;
create policy organization_hours_insert_owner on public.organization_hours for insert to authenticated
  with check (updated_by = (select auth.uid())
    and (select private.has_active_role(organization_id, array['owner']::public.organization_role[])));
create policy organization_hours_update_owner on public.organization_hours for update to authenticated
  using ((select private.has_active_role(organization_id, array['owner']::public.organization_role[])))
  with check (updated_by = (select auth.uid())
    and (select private.has_active_role(organization_id, array['owner']::public.organization_role[])));
create policy organization_hours_delete_owner on public.organization_hours for delete to authenticated
  using ((select private.has_active_role(organization_id, array['owner']::public.organization_role[])));

drop policy organization_session_settings_all_owner on public.organization_session_settings;
create policy organization_session_settings_insert_owner on public.organization_session_settings for insert to authenticated
  with check (updated_by = (select auth.uid())
    and (select private.has_active_role(organization_id, array['owner']::public.organization_role[])));
create policy organization_session_settings_update_owner on public.organization_session_settings for update to authenticated
  using ((select private.has_active_role(organization_id, array['owner']::public.organization_role[])))
  with check (updated_by = (select auth.uid())
    and (select private.has_active_role(organization_id, array['owner']::public.organization_role[])));
create policy organization_session_settings_delete_owner on public.organization_session_settings for delete to authenticated
  using ((select private.has_active_role(organization_id, array['owner']::public.organization_role[])));

drop policy coach_availability_all_authorized on public.coach_availability;
create policy coach_availability_insert_authorized on public.coach_availability for insert to authenticated
  with check ((select private.has_active_role(organization_id, array['owner']::public.organization_role[]))
    or (coach_user_id = (select auth.uid())
      and (select private.has_active_role(organization_id, array['coach']::public.organization_role[]))));
create policy coach_availability_update_authorized on public.coach_availability for update to authenticated
  using ((select private.has_active_role(organization_id, array['owner']::public.organization_role[]))
    or (coach_user_id = (select auth.uid())
      and (select private.has_active_role(organization_id, array['coach']::public.organization_role[]))))
  with check ((select private.has_active_role(organization_id, array['owner']::public.organization_role[]))
    or (coach_user_id = (select auth.uid())
      and (select private.has_active_role(organization_id, array['coach']::public.organization_role[]))));
create policy coach_availability_delete_authorized on public.coach_availability for delete to authenticated
  using ((select private.has_active_role(organization_id, array['owner']::public.organization_role[]))
    or (coach_user_id = (select auth.uid())
      and (select private.has_active_role(organization_id, array['coach']::public.organization_role[]))));

drop policy coach_availability_exceptions_all_authorized on public.coach_availability_exceptions;
create policy coach_availability_exceptions_insert_authorized on public.coach_availability_exceptions for insert to authenticated
  with check ((select private.has_active_role(organization_id, array['owner']::public.organization_role[]))
    or (coach_user_id = (select auth.uid())
      and (select private.has_active_role(organization_id, array['coach']::public.organization_role[]))));
create policy coach_availability_exceptions_update_authorized on public.coach_availability_exceptions for update to authenticated
  using ((select private.has_active_role(organization_id, array['owner']::public.organization_role[]))
    or (coach_user_id = (select auth.uid())
      and (select private.has_active_role(organization_id, array['coach']::public.organization_role[]))))
  with check ((select private.has_active_role(organization_id, array['owner']::public.organization_role[]))
    or (coach_user_id = (select auth.uid())
      and (select private.has_active_role(organization_id, array['coach']::public.organization_role[]))));
create policy coach_availability_exceptions_delete_authorized on public.coach_availability_exceptions for delete to authenticated
  using ((select private.has_active_role(organization_id, array['owner']::public.organization_role[]))
    or (coach_user_id = (select auth.uid())
      and (select private.has_active_role(organization_id, array['coach']::public.organization_role[]))));
