-- Cover the complete composite foreign keys in their declared column order.
create index group_program_versions_program_org_idx on public.group_program_versions(program_id,organization_id);
create index group_program_sync_attempts_program_org_idx on public.group_program_sync_attempts(program_id,organization_id);
