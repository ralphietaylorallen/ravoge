create index organization_session_pricing_updated_by_idx
  on public.organization_session_pricing (updated_by);
create index coach_compensation_configs_updated_by_idx
  on public.coach_compensation_configs (updated_by);
create index client_body_composition_recorded_by_idx
  on public.client_body_composition_assessments (recorded_by);
