-- Additive RPC only: preserve the existing tables, RLS, saves and publication.
-- Reverse the schema addition by dropping the public function, then the private
-- function with the same signature. Copied programming/history is never deleted.
create function private.duplicate_group_programming_week(source_monday date, conflict_mode text, expected_destination jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  org uuid := private.group_programming_organization();
  source_row public.group_daily_programs;
  destination_row public.group_daily_programs;
  target_day date; lock_day date; snapshot jsonb; rows_json jsonb;
  expected integer; copied integer := 0; skipped integer := 0;
begin
  if auth.uid() is null or org is null then raise exception 'Owner access required' using errcode='42501'; end if;
  -- Keep active Owner authorization valid for this transaction, including sessions
  -- issued before a membership was deactivated. Coaches cannot use this RPC.
  perform 1 from public.organization_memberships where organization_id=org and user_id=auth.uid() and role='owner' and status='active' for share;
  if not found then raise exception 'Owner access required' using errcode='42501'; end if;
  if source_monday is null or extract(isodow from source_monday)<>1
     or source_monday < date '2000-01-01' or source_monday+12 > date '2100-12-31'
     or conflict_mode is null or conflict_mode not in ('check','empty','replace') then
    raise exception 'Choose a valid Monday and copy option' using errcode='22023';
  end if;
  if conflict_mode='replace' then
    if expected_destination is null or jsonb_typeof(expected_destination)<>'object' then raise exception 'Reload the destination before replacing' using errcode='22023'; end if;
    for target_day in select source_monday+7+i from generate_series(0,5) i loop
      if jsonb_typeof(expected_destination->target_day::text) is distinct from 'number'
         or (expected_destination->>target_day::text) !~ '^[0-9]{1,10}$'
         or (expected_destination->>target_day::text)::bigint>2147483646 then
        raise exception 'Reload the destination before replacing' using errcode='22023';
      end if;
    end loop;
    if (select count(*) from jsonb_object_keys(expected_destination))<>6 then raise exception 'Invalid destination snapshot' using errcode='22023'; end if;
  end if;
  -- Reuse the existing save RPC's date locks, in ascending order. Row locks also
  -- coordinate with publishing. Concurrent saves/copies cannot race the check.
  for lock_day in select source_monday+i from generate_series(0,12) i loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(org::text||lock_day::text,0));
  end loop;
  perform 1 from public.group_daily_programs where organization_id=org and programming_date between source_monday and source_monday+12 order by programming_date for update;
  if not exists(select 1 from public.group_daily_programs where organization_id=org and programming_date between source_monday and source_monday+5) then
    raise exception 'Save at least one programming day before duplicating' using errcode='P0002';
  end if;
  select jsonb_object_agg(d::text,coalesce(p.revision,0)) into snapshot
    from (select source_monday+7+i as d from generate_series(0,5) i) dates
    left join public.group_daily_programs p on p.organization_id=org and p.programming_date=dates.d;
  if conflict_mode='check' and exists(select 1 from public.group_daily_programs where organization_id=org and programming_date between source_monday+7 and source_monday+12) then
    return jsonb_build_object('status','conflict','destinationWeek',source_monday+7,'expectedDestination',snapshot);
  end if;
  for source_row in select * from public.group_daily_programs where organization_id=org and programming_date between source_monday and source_monday+5 order by programming_date loop
    target_day := source_row.programming_date+7;
    select * into destination_row from public.group_daily_programs where organization_id=org and programming_date=target_day;
    if destination_row.id is not null and conflict_mode<>'replace' then skipped:=skipped+1; continue; end if;
    if conflict_mode='replace' then
      expected := (expected_destination->>target_day::text)::integer;
      if coalesce(destination_row.revision,0)<>expected then
        -- A retry of a completed copy is a no-op. A later edit/publication is
        -- never silently overwritten, even when an earlier response was lost.
        if destination_row.revision=expected+1 and destination_row.raw_workout_text=source_row.raw_workout_text and destination_row.published_revision is null then
          skipped:=skipped+1; continue;
        end if;
        raise exception 'Destination changed. Review the next week again before replacing' using errcode='40001';
      end if;
    end if;
    if destination_row.id is null then
      insert into public.group_daily_programs(organization_id,programming_date,raw_workout_text,revision,content_hash,created_by,updated_by)
        values(org,target_day,source_row.raw_workout_text,1,source_row.content_hash,auth.uid(),auth.uid()) returning * into destination_row;
    else
      update public.group_daily_programs set raw_workout_text=source_row.raw_workout_text,revision=revision+1,content_hash=source_row.content_hash,
        updated_by=auth.uid(),updated_at=clock_timestamp(),published_revision=null,published_at=null,
        mindbody_sync_status='not_configured',last_sync_at=null,last_safe_sync_error=null
        where id=destination_row.id and organization_id=org returning * into destination_row;
    end if;
    insert into public.group_program_versions(program_id,organization_id,revision,raw_workout_text,content_hash,edited_by)
      values(destination_row.id,org,destination_row.revision,destination_row.raw_workout_text,destination_row.content_hash,auth.uid());
    copied:=copied+1;
  end loop;
  select coalesce(jsonb_agg(to_jsonb(p) order by programming_date),'[]'::jsonb) into rows_json from public.group_daily_programs p
    where organization_id=org and programming_date between source_monday+7 and source_monday+12;
  return jsonb_build_object('status','success','destinationWeek',source_monday+7,'programs',rows_json,'copiedDays',copied,'skippedDays',skipped);
end;
$$;
create function public.duplicate_group_programming_week(source_monday date, conflict_mode text default 'check', expected_destination jsonb default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.duplicate_group_programming_week(source_monday,conflict_mode,expected_destination);
$$;
revoke all on function private.duplicate_group_programming_week(date,text,jsonb),public.duplicate_group_programming_week(date,text,jsonb) from public,anon;
grant execute on function private.duplicate_group_programming_week(date,text,jsonb),public.duplicate_group_programming_week(date,text,jsonb) to authenticated;
