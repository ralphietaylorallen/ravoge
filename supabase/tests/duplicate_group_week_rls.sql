begin;
-- Disposable fixtures only; all product calls run as ordinary authenticated users.
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('96000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'authenticated','authenticated','duplicate-week-'||i||'@example.test','{"provider":"email"}'::jsonb,'{"full_name":"Duplicate week QA"}'::jsonb,now(),now() from generate_series(1,6) i;
insert into public.organizations(id,name,timezone) values ('96a00000-0000-0000-0000-000000000001','Duplicate Gym A','America/Denver'),('96a00000-0000-0000-0000-000000000002','Duplicate Gym B','Pacific/Auckland');
insert into public.organization_memberships(organization_id,user_id,role) values
 ('96a00000-0000-0000-0000-000000000001','96000000-0000-0000-0000-000000000001','owner'),
 ('96a00000-0000-0000-0000-000000000001','96000000-0000-0000-0000-000000000002','coach'),
 ('96a00000-0000-0000-0000-000000000001','96000000-0000-0000-0000-000000000003','client'),
 ('96a00000-0000-0000-0000-000000000002','96000000-0000-0000-0000-000000000004','owner'),
 ('96a00000-0000-0000-0000-000000000001','96000000-0000-0000-0000-000000000005','owner'),
 ('96a00000-0000-0000-0000-000000000001','96000000-0000-0000-0000-000000000006','coach');
set local role authenticated;
select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000001',true);
select public.set_group_programming_permission('96000000-0000-0000-0000-000000000002',true);
set local timezone = 'America/Denver';
do $$
declare d date; row public.group_daily_programs; result jsonb; before_source jsonb; before_destination jsonb; snapshot jsonb; original_published_revision integer;
  raw_text text := E'  Strength + Conditioning — Class A\nTITLE: Friday strength\n\nEMOM 12\n1. Row 250 m\n2. 8 / side @ 55 lb\n65% — 4 rounds\tNotes: preserve everything  \n';
begin
  for d in select date '2026-10-26'+i from generate_series(0,5) i loop
    perform public.save_group_program(d,raw_text||d::text,0);
  end loop;
  perform public.publish_group_program('2026-10-26',1);
  select jsonb_agg(to_jsonb(p) order by programming_date) into before_source from public.group_daily_programs p where programming_date between '2026-10-26' and '2026-10-31';
  result := public.duplicate_group_programming_week('2026-10-26');
  if result->>'status'<>'success' or (result->>'copiedDays')::integer<>6 or result->>'destinationWeek'<>'2026-11-02' then raise exception 'Complete week/date mapping failed'; end if;
  if (select count(*) from public.group_daily_programs where programming_date between '2026-11-02' and '2026-11-07')<>6 then raise exception 'Missing copied days'; end if;
  if exists(select 1 from public.group_daily_programs s join public.group_daily_programs t on t.programming_date=s.programming_date+7 where s.programming_date between '2026-10-26' and '2026-10-31' and (s.id=t.id or s.raw_workout_text is distinct from t.raw_workout_text or s.content_hash<>t.content_hash or t.published_revision is not null or t.published_at is not null or t.revision<>1 or t.last_sync_at is not null or t.mindbody_sync_status<>'not_configured')) then raise exception 'Copied text, independence or draft status failed'; end if;
  if (select jsonb_agg(to_jsonb(p) order by programming_date) from public.group_daily_programs p where programming_date between '2026-10-26' and '2026-10-31') is distinct from before_source then raise exception 'Source week changed'; end if;
  if (select count(*) from public.group_program_sync_attempts)<>1 then raise exception 'Copy sent to Mindbody'; end if;
  -- Repeating the initial request only reports conflicts, never duplicate records.
  result := public.duplicate_group_programming_week('2026-10-26');
  if result->>'status'<>'conflict' then raise exception 'Destination conflicts not detected'; end if;
  if (select count(*) from public.group_daily_programs where programming_date between '2026-11-02' and '2026-11-07')<>6 then raise exception 'Repeated request duplicated records'; end if;
  -- A copied day edits and publishes through exactly the existing operations.
  row := public.save_group_program('2026-11-02',raw_text||'Edited destination only',1);
  row := public.publish_group_program('2026-11-02',row.revision);
  original_published_revision := row.revision;
  if row.published_revision<>2 or row.raw_workout_text<>raw_text||'Edited destination only' then raise exception 'Existing save/publish regression'; end if;
  if (select jsonb_agg(to_jsonb(p) order by programming_date) from public.group_daily_programs p where programming_date between '2026-10-26' and '2026-10-31') is distinct from before_source then raise exception 'Editing copy changed source'; end if;
  result := public.duplicate_group_programming_week('2026-10-26'); snapshot:=result->'expectedDestination';
  -- This check-only call is also the cancel path: it must not mutate anything.
  select jsonb_agg(to_jsonb(p) order by programming_date) into before_destination from public.group_daily_programs p where programming_date between '2026-11-02' and '2026-11-07';
  perform public.duplicate_group_programming_week('2026-10-26');
  if (select jsonb_agg(to_jsonb(p) order by programming_date) from public.group_daily_programs p where programming_date between '2026-11-02' and '2026-11-07') is distinct from before_destination then raise exception 'Conflict check/cancel mutated destination'; end if;
  result := public.duplicate_group_programming_week('2026-10-26','replace',snapshot);
  if result->>'status'<>'success' or (result->>'copiedDays')::integer<>6 then raise exception 'Confirmed replacement failed'; end if;
  if exists(select 1 from public.group_daily_programs where programming_date between '2026-11-02' and '2026-11-07' and published_revision is not null) then raise exception 'Replaced copy was automatically published'; end if;
  if not exists(select 1 from public.group_program_versions v join public.group_daily_programs p on v.program_id=p.id where p.programming_date='2026-11-02' and v.revision=original_published_revision and v.published_at is not null and v.raw_workout_text=raw_text||'Edited destination only') then raise exception 'Destination history destroyed'; end if;
  select jsonb_agg(to_jsonb(p) order by programming_date) into before_destination from public.group_daily_programs p where programming_date between '2026-11-02' and '2026-11-07';
  result := public.duplicate_group_programming_week('2026-10-26','replace',snapshot);
  if (result->>'copiedDays')::integer<>0 then raise exception 'Replacement retry created revisions'; end if;
  if (select jsonb_agg(to_jsonb(p) order by programming_date) from public.group_daily_programs p where programming_date between '2026-11-02' and '2026-11-07') is distinct from before_destination then raise exception 'Replacement retry changed records'; end if;

  -- Partial source and destination. Tuesday has no corresponding source and must survive.
  perform public.save_group_program('2026-11-16','Source Monday',0);
  perform public.save_group_program('2026-11-18','Source Wednesday',0);
  perform public.save_group_program('2026-11-21','Source Saturday',0);
  perform public.save_group_program('2026-11-23','Keep Monday',0);
  perform public.save_group_program('2026-11-24','Keep Tuesday',0);
  perform public.save_group_program('2026-11-30','Outside destination',0);
  result:=public.duplicate_group_programming_week('2026-11-16');
  if result->>'status'<>'conflict' then raise exception 'Partial conflict missing'; end if;
  result:=public.duplicate_group_programming_week('2026-11-16','empty');
  if (result->>'copiedDays')::integer<>2 or (result->>'skippedDays')::integer<>1 then raise exception 'Empty-only copy failed'; end if;
  if (select raw_workout_text from public.group_daily_programs where programming_date='2026-11-23')<>'Keep Monday' or (select raw_workout_text from public.group_daily_programs where programming_date='2026-11-24')<>'Keep Tuesday' then raise exception 'Empty-only overwrote existing destination'; end if;
  result:=public.duplicate_group_programming_week('2026-11-16'); snapshot:=result->'expectedDestination';
  -- Force a stale Wednesday after Monday would have been replaced. The whole
  -- function call must roll back, proving there can be no partial copy.
  perform public.save_group_program('2026-11-25','Concurrent Wednesday edit',1);
  select jsonb_agg(to_jsonb(p) order by programming_date) into before_destination from public.group_daily_programs p where programming_date between '2026-11-23' and '2026-11-28';
  begin
    perform public.duplicate_group_programming_week('2026-11-16','replace',snapshot);
    raise exception 'Stale replacement accepted';
  exception when serialization_failure then null; end;
  if (select jsonb_agg(to_jsonb(p) order by programming_date) from public.group_daily_programs p where programming_date between '2026-11-23' and '2026-11-28') is distinct from before_destination then raise exception 'Failed replacement left partial writes'; end if;
  result:=public.duplicate_group_programming_week('2026-11-16');
  result:=public.duplicate_group_programming_week('2026-11-16','replace',result->'expectedDestination');
  if (result->>'copiedDays')::integer<>3 then raise exception 'Partial-source replacement failed'; end if;
  if (select raw_workout_text from public.group_daily_programs where programming_date='2026-11-24')<>'Keep Tuesday' or (select raw_workout_text from public.group_daily_programs where programming_date='2026-11-30')<>'Outside destination' then raise exception 'Replacement affected unrelated date'; end if;
  begin perform public.duplicate_group_programming_week('2026-11-01'); raise exception 'Sunday accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.duplicate_group_programming_week('2026-10-26','replace','{}'); raise exception 'Missing confirmation snapshot accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.duplicate_group_programming_week('2026-10-26','anything'); raise exception 'Invalid mode accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.duplicate_group_programming_week('2100-12-27'); raise exception 'Date range overflow accepted'; exception when invalid_parameter_value then null; end;
end $$;
select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000004',true);
set local timezone = 'Pacific/Auckland';
do $$ declare result jsonb; begin
  if exists(select 1 from public.group_daily_programs) then raise exception 'Another gym read source/destination'; end if;
  begin perform public.duplicate_group_programming_week('2026-10-26'); raise exception 'Another gym copied private source'; exception when no_data_found then null; end;
  perform public.save_group_program('2026-10-26','Gym B only',0);
  result:=public.duplicate_group_programming_week('2026-10-26');
  if (result->>'copiedDays')::integer<>1 or (select raw_workout_text from public.group_daily_programs where programming_date='2026-11-02')<>'Gym B only' then raise exception 'Gym isolation or timezone mapping failed'; end if;
  if exists(select 1 from public.group_daily_programs where organization_id<>'96a00000-0000-0000-0000-000000000002') then raise exception 'Cross-gym copy leaked data'; end if;
end $$;
-- Coaches cannot duplicate even if authorized for the existing editor/publication.
select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000002',true);
do $$ begin
  if not public.can_manage_group_programming() then raise exception 'Existing Coach permission regressed'; end if;
  begin perform public.duplicate_group_programming_week('2026-10-26'); raise exception 'Coach duplicated'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000006',true);
do $$ begin begin perform public.duplicate_group_programming_week('2026-10-26'); raise exception 'Unpermitted Coach duplicated'; exception when insufficient_privilege then null; end; end $$;
select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000003',true);
do $$ begin
  if exists(select 1 from public.group_daily_programs) then raise exception 'Client read group programming'; end if;
  begin perform public.duplicate_group_programming_week('2026-10-26'); raise exception 'Client duplicated'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.organization_memberships set status='inactive' where user_id='96000000-0000-0000-0000-000000000005';
set local role authenticated;
select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000005',true);
do $$ begin begin perform public.duplicate_group_programming_week('2026-10-26'); raise exception 'Inactive Owner duplicated'; exception when insufficient_privilege then null; end; end $$;
reset role;
do $$ begin
  if has_function_privilege('anon','public.duplicate_group_programming_week(date,text,jsonb)','execute') or has_function_privilege('anon','private.duplicate_group_programming_week(date,text,jsonb)','execute') then raise exception 'Anonymous duplication exposed'; end if;
end $$;
rollback;
