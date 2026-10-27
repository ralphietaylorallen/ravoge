-- Additive, separate from personal-training programming. No existing records changed.
create table public.group_programming_permissions (
  organization_id uuid not null,
  coach_user_id uuid not null,
  granted_by uuid not null references public.profiles(id),
  granted_at timestamptz not null default now(),
  primary key (organization_id, coach_user_id),
  foreign key (organization_id, coach_user_id) references public.organization_memberships(organization_id,user_id) on delete cascade
);
create index group_programming_permissions_coach_idx on public.group_programming_permissions(coach_user_id);
create index group_programming_permissions_granter_idx on public.group_programming_permissions(granted_by);

create table public.group_daily_programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  programming_date date not null check (programming_date between date '2000-01-01' and date '2100-12-31' and extract(isodow from programming_date) <= 6),
  raw_workout_text text not null check (char_length(raw_workout_text) <= 50000),
  revision integer not null check (revision > 0),
  content_hash text not null,
  published_revision integer,
  published_at timestamptz,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  mindbody_sync_status text not null default 'not_configured' check (mindbody_sync_status in ('not_configured','blocked','failed','synced')),
  last_sync_at timestamptz,
  last_safe_sync_error text,
  unique (organization_id, programming_date),
  unique (id, organization_id),
  check ((published_revision is null) = (published_at is null)),
  check (published_revision is null or published_revision <= revision)
);
create index group_daily_programs_creator_idx on public.group_daily_programs(created_by);
create index group_daily_programs_editor_idx on public.group_daily_programs(updated_by);

-- Every changed save is recoverable; published text is never overwritten by a draft.
create table public.group_program_versions (
  program_id uuid not null,
  organization_id uuid not null,
  revision integer not null,
  raw_workout_text text not null,
  content_hash text not null,
  edited_by uuid not null references public.profiles(id),
  edited_at timestamptz not null default now(),
  published_at timestamptz,
  published_by uuid references public.profiles(id),
  primary key (program_id, revision),
  foreign key (program_id,organization_id) references public.group_daily_programs(id,organization_id) on delete cascade
);
create index group_program_versions_org_idx on public.group_program_versions(organization_id,program_id);
create index group_program_versions_editor_idx on public.group_program_versions(edited_by);
create index group_program_versions_publisher_idx on public.group_program_versions(published_by);

create table public.group_program_sync_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  program_id uuid not null,
  revision integer not null,
  content_hash text not null,
  attempted_by uuid not null references public.profiles(id),
  attempted_at timestamptz not null default now(),
  status text not null check (status in ('blocked','failed','synced')),
  safe_error text,
  foreign key (program_id,organization_id) references public.group_daily_programs(id,organization_id) on delete cascade,
  foreign key (program_id,revision) references public.group_program_versions(program_id,revision) on delete cascade
);
create index group_program_sync_attempts_org_idx on public.group_program_sync_attempts(organization_id,attempted_at desc);
create index group_program_sync_attempts_version_idx on public.group_program_sync_attempts(program_id,revision);
create index group_program_sync_attempts_actor_idx on public.group_program_sync_attempts(attempted_by);

-- Restricted private helpers follow the existing membership/RPC pattern. Always
-- derive the gym from current, active membership, never request-supplied gym IDs.
create function private.group_programming_organization()
returns uuid language sql stable security definer set search_path = '' as $$
  select m.organization_id from public.organization_memberships m
  where m.user_id=(select auth.uid()) and m.status='active'
    and private.has_active_role(m.organization_id,array['owner','coach']::public.organization_role[])
    and (m.role='owner' or (m.role='coach' and exists (
      select 1 from public.group_programming_permissions p where p.organization_id=m.organization_id and p.coach_user_id=m.user_id
    ))) limit 1;
$$;
revoke all on function private.group_programming_organization() from public,anon;
grant execute on function private.group_programming_organization() to authenticated;

alter table public.group_programming_permissions enable row level security;
alter table public.group_daily_programs enable row level security;
alter table public.group_program_versions enable row level security;
alter table public.group_program_sync_attempts enable row level security;
create policy group_permission_read on public.group_programming_permissions for select to authenticated using (
  private.has_active_role(organization_id,array['owner']::public.organization_role[])
  or (coach_user_id=(select auth.uid()) and organization_id=(select private.group_programming_organization()))
);
create policy group_program_read on public.group_daily_programs for select to authenticated using (organization_id=(select private.group_programming_organization()));
create policy group_version_read on public.group_program_versions for select to authenticated using (organization_id=(select private.group_programming_organization()));
create policy group_attempt_read on public.group_program_sync_attempts for select to authenticated using (organization_id=(select private.group_programming_organization()));
revoke all on public.group_programming_permissions, public.group_daily_programs, public.group_program_versions, public.group_program_sync_attempts from public,anon,authenticated;
grant select on public.group_programming_permissions, public.group_daily_programs, public.group_program_versions, public.group_program_sync_attempts to authenticated;

create function public.can_manage_group_programming()
returns boolean language sql stable security invoker set search_path = '' as $$ select private.group_programming_organization() is not null; $$;
revoke all on function public.can_manage_group_programming() from public,anon;
grant execute on function public.can_manage_group_programming() to authenticated;

-- Minimal editor labels for this shared workspace, without broadening profile RLS.
create function private.group_programming_team()
returns table(user_id uuid,full_name text,role public.organization_role,status public.membership_status)
language sql stable security definer set search_path = '' as $$
  select m.user_id,p.full_name,m.role,m.status from public.organization_memberships m join public.profiles p on p.id=m.user_id
  where m.organization_id=private.group_programming_organization() and m.role in ('owner','coach');
$$;
create function public.group_programming_team()
returns table(user_id uuid,full_name text,role public.organization_role,status public.membership_status)
language sql stable security invoker set search_path = '' as $$ select * from private.group_programming_team(); $$;
revoke all on function private.group_programming_team(),public.group_programming_team() from public,anon;
grant execute on function private.group_programming_team(),public.group_programming_team() to authenticated;

create function private.set_group_programming_permission(target_coach uuid, allowed boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare org uuid := private.group_programming_organization();
begin
  if org is null or not private.has_active_role(org,array['owner']::public.organization_role[]) then raise exception 'Owner access required' using errcode='42501'; end if;
  if allowed is null or not exists(select 1 from public.organization_memberships where organization_id=org and user_id=target_coach and role='coach' and status='active') then raise exception 'Choose an active Coach in your gym'; end if;
  if allowed then
    insert into public.group_programming_permissions(organization_id,coach_user_id,granted_by) values(org,target_coach,auth.uid()) on conflict do nothing;
  else
    delete from public.group_programming_permissions where organization_id=org and coach_user_id=target_coach;
  end if;
end;
$$;
create function public.set_group_programming_permission(target_coach uuid, allowed boolean)
returns void language sql security invoker set search_path = '' as $$ select private.set_group_programming_permission(target_coach,allowed); $$;

create function private.save_group_program(target_date date, workout_text text, expected_revision integer)
returns public.group_daily_programs language plpgsql security definer set search_path = '' as $$
declare org uuid := private.group_programming_organization(); current_row public.group_daily_programs; new_hash text;
begin
  if org is null then raise exception 'Group programming permission required' using errcode='42501'; end if;
  if target_date is null or target_date not between date '2000-01-01' and date '2100-12-31' or extract(isodow from target_date)>6 or workout_text is null or char_length(workout_text)>50000 then raise exception 'Choose Monday through Saturday and at most 50,000 characters'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(org::text||target_date::text,0));
  select * into current_row from public.group_daily_programs where organization_id=org and programming_date=target_date for update;
  if coalesce(current_row.revision,0) is distinct from expected_revision then raise exception 'Another editor saved this date. Keep your text, reload, and compare before saving.' using errcode='40001'; end if;
  if current_row.id is not null and current_row.raw_workout_text=workout_text then return current_row; end if;
  new_hash := encode(extensions.digest(convert_to(workout_text,'UTF8'),'sha256'),'hex');
  if current_row.id is null then
    insert into public.group_daily_programs(organization_id,programming_date,raw_workout_text,revision,content_hash,created_by,updated_by)
    values(org,target_date,workout_text,1,new_hash,auth.uid(),auth.uid()) returning * into current_row;
  else
    update public.group_daily_programs set raw_workout_text=workout_text,revision=revision+1,content_hash=new_hash,updated_by=auth.uid(),updated_at=clock_timestamp()
    where id=current_row.id returning * into current_row;
  end if;
  insert into public.group_program_versions(program_id,organization_id,revision,raw_workout_text,content_hash,edited_by)
    values(current_row.id,org,current_row.revision,workout_text,new_hash,auth.uid());
  return current_row;
end;
$$;
create function public.save_group_program(target_date date, workout_text text, expected_revision integer)
returns public.group_daily_programs language sql security invoker set search_path = '' as $$ select private.save_group_program(target_date,workout_text,expected_revision); $$;

create function private.publish_group_program(target_date date, expected_revision integer, retry_sync boolean)
returns public.group_daily_programs language plpgsql security definer set search_path = '' as $$
declare org uuid := private.group_programming_organization(); current_row public.group_daily_programs;
  blocked_reason constant text := 'Mindbody sync unavailable: a supported date-specific workout field and branded-app display must be verified. No Mindbody data was changed.';
begin
  if org is null then raise exception 'Group programming permission required' using errcode='42501'; end if;
  select * into current_row from public.group_daily_programs where organization_id=org and programming_date=target_date for update;
  if current_row.id is null or current_row.raw_workout_text !~ '\S' then raise exception 'Save workout text before publishing'; end if;
  if current_row.revision is distinct from expected_revision then raise exception 'This date changed. Reload and review before publishing.' using errcode='40001'; end if;
  if retry_sync and current_row.published_revision is distinct from current_row.revision then raise exception 'Publish the updated draft before retrying'; end if;
  if current_row.published_revision=current_row.revision and not retry_sync then return current_row; end if;
  update public.group_program_versions set published_at=coalesce(published_at,clock_timestamp()),published_by=coalesce(published_by,auth.uid())
    where program_id=current_row.id and revision=current_row.revision;
  update public.group_daily_programs set published_revision=revision,published_at=case when published_revision=revision then published_at else clock_timestamp() end,
    mindbody_sync_status='blocked',last_safe_sync_error=blocked_reason
    where id=current_row.id returning * into current_row;
  insert into public.group_program_sync_attempts(organization_id,program_id,revision,content_hash,attempted_by,status,safe_error)
    values(org,current_row.id,current_row.revision,current_row.content_hash,auth.uid(),'blocked',blocked_reason);
  return current_row;
end;
$$;
create function public.publish_group_program(target_date date, expected_revision integer, retry_sync boolean default false)
returns public.group_daily_programs language sql security invoker set search_path = '' as $$ select private.publish_group_program(target_date,expected_revision,retry_sync); $$;

revoke all on function private.set_group_programming_permission(uuid,boolean), public.set_group_programming_permission(uuid,boolean),
  private.save_group_program(date,text,integer), public.save_group_program(date,text,integer),
  private.publish_group_program(date,integer,boolean), public.publish_group_program(date,integer,boolean) from public,anon;
grant execute on function private.set_group_programming_permission(uuid,boolean), public.set_group_programming_permission(uuid,boolean),
  private.save_group_program(date,text,integer), public.save_group_program(date,text,integer),
  private.publish_group_program(date,integer,boolean), public.publish_group_program(date,integer,boolean) to authenticated;

comment on table public.group_daily_programs is 'Plain-text group programming only. One gym/date. Separate from all personal-training and scheduling data.';
comment on table public.group_program_versions is 'Recoverable save and publication history. No direct client DML. Published text remains intact while newer drafts are edited.';
comment on table public.group_program_sync_attempts is 'Safe audit only. Mindbody writes are blocked until the official API and branded-app proof gate passes; never simulated success.';
