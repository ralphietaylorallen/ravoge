-- Cover the direct Auth-user foreign key as well as the organization-scoped
-- timeline index. Advisor finding: training_readiness_checkins_client_user_id_fkey.
create index training_readiness_client_user_lookup_idx on public.training_readiness_checkins(client_user_id);
