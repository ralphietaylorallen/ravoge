begin;
-- Fixture setup only. All access and mutations below run as authenticated users.
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('95000000-0000-0000-0000-000000000001','authenticated','authenticated','group-owner-a@example.test','{"provider":"email"}','{"full_name":"Group Owner A"}',now(),now()),
 ('95000000-0000-0000-0000-000000000002','authenticated','authenticated','group-coach@example.test','{"provider":"email"}','{"full_name":"Group Coach"}',now(),now()),
 ('95000000-0000-0000-0000-000000000003','authenticated','authenticated','group-denied@example.test','{"provider":"email"}','{"full_name":"Group Denied"}',now(),now()),
 ('95000000-0000-0000-0000-000000000004','authenticated','authenticated','group-client@example.test','{"provider":"email"}','{"full_name":"Group Client"}',now(),now()),
 ('95000000-0000-0000-0000-000000000005','authenticated','authenticated','group-owner-b@example.test','{"provider":"email"}','{"full_name":"Group Owner B"}',now(),now());
insert into public.organizations(id,name) values ('95a00000-0000-0000-0000-000000000001','Group Gym A'),('95a00000-0000-0000-0000-000000000002','Group Gym B');
insert into public.organization_memberships(organization_id,user_id,role) values
 ('95a00000-0000-0000-0000-000000000001','95000000-0000-0000-0000-000000000001','owner'),
 ('95a00000-0000-0000-0000-000000000001','95000000-0000-0000-0000-000000000002','coach'),
 ('95a00000-0000-0000-0000-000000000001','95000000-0000-0000-0000-000000000003','coach'),
 ('95a00000-0000-0000-0000-000000000001','95000000-0000-0000-0000-000000000004','client'),
 ('95a00000-0000-0000-0000-000000000002','95000000-0000-0000-0000-000000000005','owner');
set local role authenticated;
select set_config('request.jwt.claim.sub','95000000-0000-0000-0000-000000000001',true);
select public.set_group_programming_permission('95000000-0000-0000-0000-000000000002',true);
do $$ begin
  if not public.can_manage_group_programming() then raise exception 'Owner denied'; end if;
  begin
    perform public.set_group_programming_permission('95000000-0000-0000-0000-000000000005',true);
    raise exception 'Granted cross-gym or non-Coach permission';
  exception when raise_exception then if sqlerrm='Granted cross-gym or non-Coach permission' then raise; end if; end;
end $$;

select set_config('request.jwt.claim.sub','95000000-0000-0000-0000-000000000002',true);
do $$ declare row public.group_daily_programs; d date; raw_text text := E'  EMOM 12\n1. Row 250 m\n2. 8 / side @ 55 lb\n3. 65%\tAMRAP  \n'; begin
  if not public.can_manage_group_programming() then raise exception 'Authorized Coach denied'; end if;
  if (select count(*) from public.group_programming_team())<>3 then raise exception 'Shared editor labels missing or overexposed'; end if;
  for d in select generate_series(date '2026-11-02',date '2026-11-07',interval '1 day')::date loop
    row:=public.save_group_program(d,case when d=date '2026-11-07' then E' \n\t' else raw_text||d::text end,0);
    if row.organization_id<>'95a00000-0000-0000-0000-000000000001' or row.created_by<>auth.uid() then raise exception 'Wrong gym or author'; end if;
    if row.raw_workout_text is distinct from case when d=date '2026-11-07' then E' \n\t' else raw_text||d::text end then raise exception 'Formatting lost'; end if;
  end loop;
  if exists(select 1 from public.group_program_sync_attempts) then raise exception 'Draft triggered sync'; end if;
  row:=public.publish_group_program('2026-11-02',1);
  if row.published_revision<>1 or row.mindbody_sync_status<>'blocked' or row.last_sync_at is not null then raise exception 'Publication fake or missing'; end if;
  perform public.publish_group_program('2026-11-02',1);
  if (select count(*) from public.group_program_sync_attempts)<>1 then raise exception 'Repeat publication duplicated operation'; end if;
  if (select count(*) from public.group_daily_programs where published_at is not null)<>1 then raise exception 'Single-date publish changed other dates'; end if;
  perform public.publish_group_program('2026-11-04',1);
  perform public.publish_group_program('2026-11-06',1);
  if (select count(*) from public.group_daily_programs where published_at is not null)<>3 then raise exception 'Selected dates scope wrong'; end if;
  begin perform public.publish_group_program('2026-11-07',1); raise exception 'Blank published';
  exception when raise_exception then if sqlerrm='Blank published' then raise; end if; end;
  for d in select programming_date from public.group_daily_programs where raw_workout_text ~ '\S' loop perform public.publish_group_program(d,1); end loop;
  if (select count(*) from public.group_daily_programs where published_at is not null)<>5 then raise exception 'Week publication scope wrong'; end if;
  row:=public.save_group_program('2026-11-02',raw_text||'republished',1);
  if row.revision<>2 or row.published_revision<>1 then raise exception 'Draft overwrote published version'; end if;
  if not exists(select 1 from public.group_program_versions where program_id=row.id and revision=1 and raw_workout_text=raw_text||'2026-11-02' and published_at is not null) then raise exception 'Published text lost'; end if;
  begin perform public.save_group_program('2026-11-02','stale overwrite',1); raise exception 'Stale write accepted';
  exception when serialization_failure then null; end;
  perform public.publish_group_program('2026-11-02',2);
  if (select count(*) from public.group_daily_programs where programming_date='2026-11-02')<>1 then raise exception 'Republish duplicated date'; end if;
  if (select count(*) from public.group_program_versions where program_id=row.id)<>2 then raise exception 'Version history missing'; end if;
  begin update public.group_daily_programs set organization_id='95a00000-0000-0000-0000-000000000002'; raise exception 'Direct DML allowed'; exception when insufficient_privilege then null; end;
  begin perform public.set_group_programming_permission('95000000-0000-0000-0000-000000000003',true); raise exception 'Coach granted access'; exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','95000000-0000-0000-0000-000000000005',true);
do $$ begin
  if exists(select 1 from public.group_daily_programs) or exists(select 1 from public.group_program_versions) or exists(select 1 from public.group_program_sync_attempts) then raise exception 'Cross gym read'; end if;
  begin perform public.publish_group_program('2026-11-02',2); raise exception 'Cross gym publish'; exception when raise_exception then if sqlerrm='Cross gym publish' then raise; end if; end;
  perform public.save_group_program('2026-11-02','Gym B only',0);
  if exists(select 1 from public.group_daily_programs where organization_id<>'95a00000-0000-0000-0000-000000000002') then raise exception 'Gym B isolation failed'; end if;
end $$;

select set_config('request.jwt.claim.sub','95000000-0000-0000-0000-000000000003',true);
do $$ begin
  if public.can_manage_group_programming() or exists(select 1 from public.group_daily_programs) or exists(select 1 from public.group_programming_team()) then raise exception 'Unauthorized Coach read'; end if;
  begin perform public.save_group_program('2026-11-02','denied',0); raise exception 'Unauthorized Coach saved'; exception when insufficient_privilege then null; end;
  begin perform public.publish_group_program('2026-11-02',2); raise exception 'Unauthorized Coach published'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','95000000-0000-0000-0000-000000000004',true);
do $$ begin
  if public.can_manage_group_programming() or exists(select 1 from public.group_daily_programs) or exists(select 1 from public.group_program_versions) then raise exception 'Client accessed group programming'; end if;
  begin perform public.save_group_program('2026-11-02','denied',0); raise exception 'Client saved'; exception when insufficient_privilege then null; end;
end $$;

-- Revocation and inactive membership take effect without needing a new JWT.
select set_config('request.jwt.claim.sub','95000000-0000-0000-0000-000000000001',true);
select public.set_group_programming_permission('95000000-0000-0000-0000-000000000002',false);
select set_config('request.jwt.claim.sub','95000000-0000-0000-0000-000000000002',true);
do $$ begin if public.can_manage_group_programming() or exists(select 1 from public.group_daily_programs) then raise exception 'Revoked Coach retains access'; end if; end $$;
select set_config('request.jwt.claim.sub','95000000-0000-0000-0000-000000000001',true);
select public.set_group_programming_permission('95000000-0000-0000-0000-000000000002',true);
reset role;
update public.organization_memberships set status='inactive' where user_id='95000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','95000000-0000-0000-0000-000000000002',true);
do $$ begin if public.can_manage_group_programming() or exists(select 1 from public.group_daily_programs) then raise exception 'Inactive Coach retains access'; end if; end $$;
reset role;
-- There is deliberately no integration credential table, write adapter or success flag setter.
do $$ begin
  if exists(select 1 from public.group_daily_programs where mindbody_sync_status='synced' or last_sync_at is not null) then raise exception 'False sync success'; end if;
end $$;
rollback;
