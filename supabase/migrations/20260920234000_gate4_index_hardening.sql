create index client_intakes_client_user_idx
  on public.client_intakes (client_user_id);
create index client_intakes_completed_by_idx
  on public.client_intakes (completed_by);
create index client_intakes_org_completed_by_idx
  on public.client_intakes (organization_id, completed_by);

create index client_states_calculated_by_idx
  on public.client_states (calculated_by);
create index client_states_client_user_idx
  on public.client_states (client_user_id);
create index client_states_intake_org_client_idx
  on public.client_states (intake_id, organization_id, client_user_id);
create index client_states_org_calculated_by_idx
  on public.client_states (organization_id, calculated_by);

create index exercise_library_created_by_idx
  on public.exercise_library (created_by)
  where created_by is not null;

create index generated_prescriptions_client_user_idx
  on public.generated_prescriptions (client_user_id);
create index generated_prescriptions_intake_org_client_idx
  on public.generated_prescriptions (intake_id, organization_id, client_user_id);
create index generated_prescriptions_org_coach_idx
  on public.generated_prescriptions (organization_id, coach_user_id);
create index generated_prescriptions_state_org_client_idx
  on public.generated_prescriptions (state_id, organization_id, client_user_id);
create index generated_prescriptions_workout_idx
  on public.generated_prescriptions (workout_assignment_id)
  where workout_assignment_id is not null;

create index organization_equipment_created_by_idx
  on public.organization_equipment (created_by);
create index organization_equipment_org_created_by_idx
  on public.organization_equipment (organization_id, created_by);

create index training_library_items_created_by_idx
  on public.training_library_items (created_by);
create index training_library_items_org_created_by_idx
  on public.training_library_items (organization_id, created_by);

create index workout_assignments_source_prescription_idx
  on public.workout_assignments (source_prescription_id)
  where source_prescription_id is not null;
create index workout_exercises_library_exercise_idx
  on public.workout_exercises (library_exercise_id)
  where library_exercise_id is not null;
