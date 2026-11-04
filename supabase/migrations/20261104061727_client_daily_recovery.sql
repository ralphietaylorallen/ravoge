-- Additive, client-authored logs. Never update assigned workouts, results or scores.
create table public.client_daily_totals (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_user_id uuid not null,
  log_date date not null check (log_date between date '1900-01-01' and date '2100-12-31'),
  calories integer check (calories between 0 and 30000),
  protein_grams numeric(7,2) check (protein_grams between 0 and 2000),
  updated_at timestamptz not null default now(),
  primary key (organization_id, client_user_id, log_date),
  foreign key (organization_id, client_user_id) references public.organization_memberships(organization_id,user_id)
);

create table public.client_activity_entries (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_user_id uuid not null,
  log_date date not null check (log_date between date '1900-01-01' and date '2100-12-31'),
  activity_type text not null check (activity_type in ('walk','jog','run','other')),
  duration_minutes numeric(7,2) not null check (duration_minutes > 0 and duration_minutes <= 1440),
  distance numeric(9,3) check (distance > 0 and distance <= 10000),
  distance_unit text not null default 'mi' check (distance_unit in ('mi','km')),
  effort smallint check (effort between 1 and 10),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, client_user_id) references public.organization_memberships(organization_id,user_id)
);
create index client_activity_entries_history on public.client_activity_entries(organization_id,client_user_id,log_date desc);

create table public.client_recovery_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_user_id uuid not null,
  workout_assignment_id uuid not null,
  log_date date not null check (log_date between date '1900-01-01' and date '2100-12-31'),
  recovery_type text not null check (recovery_type in ('sauna','cold_plunge')),
  duration_minutes numeric(7,2) not null check (duration_minutes > 0 and duration_minutes <= 1440),
  water_temperature numeric(5,2),
  temperature_unit text not null default 'F' check (temperature_unit in ('F','C')),
  updated_at timestamptz not null default now(),
  unique (workout_assignment_id,recovery_type),
  foreign key (workout_assignment_id,organization_id,client_user_id)
    references public.workout_assignments(id,organization_id,client_user_id),
  constraint recovery_temperature_valid check (
    (recovery_type='sauna' and water_temperature is null) or
    (recovery_type='cold_plunge' and (water_temperature is null or
      (temperature_unit='F' and water_temperature between 32 and 120) or
      (temperature_unit='C' and water_temperature between 0 and 49)))
  )
);
create index client_recovery_entries_history on public.client_recovery_entries(organization_id,client_user_id,log_date desc);
create index client_recovery_entries_workout_scope on public.client_recovery_entries(workout_assignment_id,organization_id,client_user_id);

alter table public.client_daily_totals enable row level security;
alter table public.client_activity_entries enable row level security;
alter table public.client_recovery_entries enable row level security;

create policy daily_totals_read on public.client_daily_totals for select to authenticated
using ((select private.can_read_client_domain(organization_id,client_user_id)));
create policy daily_totals_insert on public.client_daily_totals for insert to authenticated
with check (client_user_id=(select auth.uid()) and (select private.has_active_role(organization_id,array['client']::public.organization_role[])));
create policy daily_totals_update on public.client_daily_totals for update to authenticated
using (client_user_id=(select auth.uid()) and (select private.has_active_role(organization_id,array['client']::public.organization_role[])))
with check (client_user_id=(select auth.uid()) and (select private.has_active_role(organization_id,array['client']::public.organization_role[])));

create policy activity_read on public.client_activity_entries for select to authenticated
using ((select private.can_read_client_domain(organization_id,client_user_id)));
create policy activity_insert on public.client_activity_entries for insert to authenticated
with check (client_user_id=(select auth.uid()) and (select private.has_active_role(organization_id,array['client']::public.organization_role[])));
create policy activity_update on public.client_activity_entries for update to authenticated
using (client_user_id=(select auth.uid()) and (select private.has_active_role(organization_id,array['client']::public.organization_role[])))
with check (client_user_id=(select auth.uid()) and (select private.has_active_role(organization_id,array['client']::public.organization_role[])));
create policy activity_delete on public.client_activity_entries for delete to authenticated
using (client_user_id=(select auth.uid()) and (select private.has_active_role(organization_id,array['client']::public.organization_role[])));

create policy recovery_read on public.client_recovery_entries for select to authenticated
using ((select private.can_read_client_domain(organization_id,client_user_id)));
create policy recovery_insert on public.client_recovery_entries for insert to authenticated
with check (client_user_id=(select auth.uid()) and (select private.has_active_role(organization_id,array['client']::public.organization_role[]))
 and exists(select 1 from public.workout_assignments w where w.id=workout_assignment_id and w.organization_id=client_recovery_entries.organization_id and w.client_user_id=(select auth.uid()) and w.status='completed'));
create policy recovery_update on public.client_recovery_entries for update to authenticated
using (client_user_id=(select auth.uid()) and (select private.has_active_role(organization_id,array['client']::public.organization_role[])))
with check (client_user_id=(select auth.uid()) and (select private.has_active_role(organization_id,array['client']::public.organization_role[]))
 and exists(select 1 from public.workout_assignments w where w.id=workout_assignment_id and w.organization_id=client_recovery_entries.organization_id and w.client_user_id=(select auth.uid()) and w.status='completed'));

revoke all on public.client_daily_totals,public.client_activity_entries,public.client_recovery_entries from anon,authenticated;
grant select on public.client_daily_totals,public.client_activity_entries,public.client_recovery_entries to authenticated;
grant insert (organization_id,client_user_id,log_date,calories,protein_grams) on public.client_daily_totals to authenticated;
grant update (calories,protein_grams) on public.client_daily_totals to authenticated;
grant insert (id,organization_id,client_user_id,log_date,activity_type,duration_minutes,distance,distance_unit,effort) on public.client_activity_entries to authenticated;
grant update (log_date,activity_type,duration_minutes,distance,distance_unit,effort) on public.client_activity_entries to authenticated;
grant delete on public.client_activity_entries to authenticated;
grant insert (organization_id,client_user_id,workout_assignment_id,log_date,recovery_type,duration_minutes,water_temperature,temperature_unit) on public.client_recovery_entries to authenticated;
grant update (log_date,duration_minutes,water_temperature,temperature_unit) on public.client_recovery_entries to authenticated;

create trigger daily_totals_updated before update on public.client_daily_totals for each row execute function private.set_updated_at();
create trigger activity_updated before update on public.client_activity_entries for each row execute function private.set_updated_at();
create trigger recovery_updated before update on public.client_recovery_entries for each row execute function private.set_updated_at();

-- Invoker functions make retries idempotent while preserving column-level scope locks and RLS.
create function public.save_client_daily_totals(target_organization_id uuid,target_date date,total_calories integer,total_protein numeric)
returns void language sql security invoker set search_path='' as $$
  insert into public.client_daily_totals(organization_id,client_user_id,log_date,calories,protein_grams)
  values(target_organization_id,(select auth.uid()),target_date,total_calories,total_protein)
  on conflict(organization_id,client_user_id,log_date) do update set calories=excluded.calories,protein_grams=excluded.protein_grams;
$$;
create function public.save_client_activity(target_id uuid,target_organization_id uuid,target_date date,activity text,minutes numeric,activity_distance numeric,unit text,activity_effort smallint)
returns uuid language plpgsql security invoker set search_path='' as $$
declare saved_id uuid;
begin
  insert into public.client_activity_entries(id,organization_id,client_user_id,log_date,activity_type,duration_minutes,distance,distance_unit,effort)
  values(target_id,target_organization_id,(select auth.uid()),target_date,activity,minutes,activity_distance,unit,activity_effort)
  on conflict(id) do update set log_date=excluded.log_date,activity_type=excluded.activity_type,duration_minutes=excluded.duration_minutes,distance=excluded.distance,distance_unit=excluded.distance_unit,effort=excluded.effort
  where client_activity_entries.organization_id=excluded.organization_id and client_activity_entries.client_user_id=excluded.client_user_id returning id into saved_id;
  if saved_id is null then raise exception 'Activity access denied' using errcode='42501'; end if;
  return saved_id;
end;
$$;
create function public.save_client_recovery(target_organization_id uuid,target_workout_id uuid,target_date date,recovery text,minutes numeric,temperature numeric,unit text)
returns void language sql security invoker set search_path='' as $$
  insert into public.client_recovery_entries(organization_id,client_user_id,workout_assignment_id,log_date,recovery_type,duration_minutes,water_temperature,temperature_unit)
  values(target_organization_id,(select auth.uid()),target_workout_id,target_date,recovery,minutes,temperature,unit)
  on conflict(workout_assignment_id,recovery_type) do update set log_date=excluded.log_date,duration_minutes=excluded.duration_minutes,water_temperature=excluded.water_temperature,temperature_unit=excluded.temperature_unit;
$$;
revoke all on function public.save_client_daily_totals(uuid,date,integer,numeric), public.save_client_activity(uuid,uuid,date,text,numeric,numeric,text,smallint), public.save_client_recovery(uuid,uuid,date,text,numeric,numeric,text) from public,anon;
grant execute on function public.save_client_daily_totals(uuid,date,integer,numeric), public.save_client_activity(uuid,uuid,date,text,numeric,numeric,text,smallint), public.save_client_recovery(uuid,uuid,date,text,numeric,numeric,text) to authenticated;
