create index workout_assignments_organization_coach_idx
  on public.workout_assignments (organization_id, coach_user_id);
create index workout_assignments_organization_client_idx
  on public.workout_assignments (organization_id, client_user_id);

drop index public.workout_exercises_assignment_order_idx;
