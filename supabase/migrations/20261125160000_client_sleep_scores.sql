create table public.client_sleep_scores (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_user_id uuid not null,
  log_date date not null check (log_date between date '1900-01-01' and date '2100-12-31'),
  score integer not null check (score between 0 and 100),
  primary key (organization_id, client_user_id, log_date),
  foreign key (organization_id, client_user_id)
    references public.organization_memberships(organization_id, user_id) on delete cascade
);

alter table public.client_sleep_scores enable row level security;

create policy client_owns_sleep_scores on public.client_sleep_scores
for all to authenticated
using (
  client_user_id = (select auth.uid())
  and (select private.has_active_role(organization_id, array['client']::public.organization_role[]))
)
with check (
  client_user_id = (select auth.uid())
  and (select private.has_active_role(organization_id, array['client']::public.organization_role[]))
);

revoke all on public.client_sleep_scores from anon, authenticated;
grant select, insert, delete on public.client_sleep_scores to authenticated;
grant update (organization_id, client_user_id, log_date, score) on public.client_sleep_scores to authenticated;
