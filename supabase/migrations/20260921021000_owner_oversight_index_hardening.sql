create index coach_client_assignment_audit_coach_user_idx
  on public.coach_client_assignment_audit (coach_user_id);

create index coach_client_assignment_audit_client_user_idx
  on public.coach_client_assignment_audit (client_user_id);
