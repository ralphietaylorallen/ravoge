-- Versioned structured reviews alongside the existing immutable fixed-set
-- revisions. No historical review or raw source row is rewritten.
alter table public.training_library_reviews add column structure_version integer not null default 1 check(structure_version in (1,2)),
 add column source_confirmed boolean not null default false;
alter table public.training_library_items add column generation_excluded boolean not null default false;
alter table public.training_library_reviews drop constraint training_library_reviews_primary_goal_check;
alter table public.training_library_reviews add constraint training_library_reviews_primary_goal_check check(primary_goal in ('strength','muscle_gain','general_fitness','conditioning','fat_loss','athletic_performance','body_recomposition'));
alter table public.workout_exercises add column prescription_details jsonb check(prescription_details is null or jsonb_typeof(prescription_details)='object');

-- One server validator is shared by publication, generation and approval.
-- Time/distance retain a legacy reps=1 sentinel solely for compatibility; the
-- protocol carries the actual target and all new displays honor its unit.
create function private.validate_quality_exercises(proposed jsonb,org uuid,intake uuid,generated boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare x jsonb; p jsonb; e public.exercise_library%rowtype; result jsonb:='[]'; sub jsonb;
 total_sets integer:=0; amount numeric; k text;
begin
 if jsonb_typeof(proposed) is distinct from 'array' or jsonb_array_length(proposed) not between 1 and 30 then raise exception 'Review exercise rows'; end if;
 if generated and jsonb_array_length(proposed) not between 3 and 12 then raise exception 'Generated draft requires 3–12 movement rows'; end if;
 for x in select value from jsonb_array_elements(proposed) loop
   select * into strict e from public.exercise_library where id=(x->>'libraryExerciseId')::uuid and is_active and (organization_id is null or organization_id=org);
   if intake is not null and not private.generation_exercise_compatible(e.id,intake) then raise exception 'Exercise conflicts with current intake or actual resources'; end if;
   p:=x->'protocol';
   if jsonb_typeof(p) is distinct from 'object'
     or not(p ?& array['block','format','group','measurement','workSeconds','distance','distanceUnit','intervalSeconds','blockDurationSeconds','percentageLoad','perSide','targetRpe','substitutionIds'])
     or exists(select 1 from jsonb_object_keys(p) fields(key_name) where fields.key_name not in ('block','format','group','measurement','workSeconds','distance','distanceUnit','intervalSeconds','blockDurationSeconds','percentageLoad','perSide','targetRpe','substitutionIds'))
     or coalesce(p->>'block','') not in ('warmup','preparation','strength','power','accessory','conditioning','finisher','cooldown')
     or coalesce(p->>'format','') not in ('straight','superset','circuit','stations','emom','amrap','rounds','interval')
     or coalesce(p->>'measurement','') not in ('reps','time','distance')
     or coalesce(p->>'distanceUnit','') not in ('meters','yards')
     or jsonb_typeof(p->'perSide') is distinct from 'boolean'
     or char_length(coalesce(p->>'group',''))>60
     or jsonb_typeof(p->'substitutionIds') is distinct from 'array' or jsonb_array_length(p->'substitutionIds')>5
     or (p->>'format' in ('superset','circuit','stations','emom','amrap','rounds') and trim(coalesce(p->>'group',''))='')
   then raise exception 'Incomplete or unsupported workout structure'; end if;
   foreach k in array array['sets','reps'] loop
     if coalesce(x->>k,'') !~ '^[0-9]+$' then raise exception 'Explicit sets and repetitions required'; end if;
   end loop;
   if (x->>'sets')::integer not between 1 and (case when generated then 4 else 100 end)
     or (x->>'reps')::integer not between 1 and (case when generated then 20 else 1000 end)
     or (p->>'measurement'<>'reps' and (x->>'reps')::integer<>1)
     or (p->>'measurement'='distance' and e.measurement<>'distance')
     or (p->>'measurement'='reps' and e.measurement<>'reps')
     or (e.laterality='unilateral' and (p->>'perSide')::boolean is distinct from true)
     or char_length(coalesce(x->>'notes',''))>1000 or char_length(coalesce(x->>'reason',''))>1000
     or char_length(coalesce(x->>'sourceText',''))>2000
   then raise exception 'Review targets and measurement units'; end if;
   foreach k in array array['workSeconds','distance','intervalSeconds','blockDurationSeconds','percentageLoad','targetRpe'] loop
     if p->>k is not null then
       amount:=(p->>k)::numeric;
       if amount::text in ('NaN','Infinity','-Infinity') or amount<(case k when 'targetRpe' then 1 when 'workSeconds' then 5 when 'intervalSeconds' then 10 when 'blockDurationSeconds' then 30 else 1 end)
         or amount>(case k when 'targetRpe' then case when generated then 8 else 10 end when 'percentageLoad' then 100 when 'distance' then 3000 when 'blockDurationSeconds' then 3600 else 1200 end)
         or (k in ('workSeconds','intervalSeconds','blockDurationSeconds') and trunc(amount)<>amount)
       then raise exception 'Invalid protocol value'; end if;
     end if;
   end loop;
   if (p->>'measurement'='time') is distinct from (p->>'workSeconds' is not null)
     or (p->>'measurement'='distance') is distinct from (p->>'distance' is not null)
     or (p->>'format'='emom' and (p->>'intervalSeconds' is null or (p->>'workSeconds')::numeric>=(p->>'intervalSeconds')::numeric))
     or (p->>'format'='amrap' and (p->>'blockDurationSeconds' is null or (x->>'sets')::integer<>1))
     or (x->>'restSeconds' is not null and ((x->>'restSeconds') !~ '^[0-9]+$' or (x->>'restSeconds')::integer not between 0 and 1800))
     or (x->>'load' is not null and ((x->>'load')::numeric not between 0 and 100000 or x->>'load' in ('NaN','Infinity','-Infinity')))
   then raise exception 'Missing or conflicting timed/distance/load prescription'; end if;
   if generated and ((p->>'targetRpe') is null or (p->>'targetRpe')::numeric<4 or p->>'percentageLoad' is not null or x->>'load' is not null
     or (select experience_level='beginner' from public.client_intakes where id=intake) and ((x->>'sets')::integer>3 or (p->>'targetRpe')::numeric>7)) then raise exception 'Generated intensity exceeds review limits'; end if;
   if intake is not null and 'turf'=any(e.equipment_requirements) and not exists(
     select 1 from public.organization_facilities f where f.organization_id=org and f.feature_type='turf' and f.is_available
       and f.usable_length * case f.length_unit when 'yards' then 0.9144 else 1 end >= case when p->>'measurement'='distance' then (p->>'distance')::numeric*case p->>'distanceUnit' when 'yards' then 0.9144 else 1 end else 1 end
   ) then raise exception 'Distance exceeds the available turf lane; use explicit shorter lengths/rounds'; end if;
   for sub in select value from jsonb_array_elements(p->'substitutionIds') loop
     if intake is not null and not private.generation_exercise_compatible((sub#>>'{}')::uuid,intake) then raise exception 'Unsafe substitution'; end if;
     if not exists(select 1 from public.exercise_library l where l.id=(sub#>>'{}')::uuid and l.is_active and (l.organization_id is null or l.organization_id=org)) then raise exception 'Unknown substitution'; end if;
   end loop;
   total_sets:=total_sets+(x->>'sets')::integer;
   result:=result||jsonb_build_array(x||jsonb_build_object('name',e.name,'cue',e.coach_cue,'equipment',e.equipment_requirements));
 end loop;
 if generated and total_sets>28 then raise exception 'Generated volume exceeds review limit'; end if;
 -- A named group has one unambiguous format, block length and number of rounds.
 if exists(select 1 from jsonb_array_elements(result) a cross join jsonb_array_elements(result) b
   where trim(coalesce(a->'protocol'->>'group',''))<>'' and a->'protocol'->>'group'=b->'protocol'->>'group'
   and (a->'protocol'->>'block',a->'protocol'->>'format',a->'protocol'->>'blockDurationSeconds',a->>'sets') is distinct from
       (b->'protocol'->>'block',b->'protocol'->>'format',b->'protocol'->>'blockDurationSeconds',b->>'sets')) then raise exception 'Group format and rounds must agree'; end if;
 return result;
exception when no_data_found then raise exception 'Select an active approved exercise from this gym or the global library';
end $$;
revoke all on function private.validate_quality_exercises(jsonb,uuid,uuid,boolean) from public,anon,authenticated;

create table public.gym_programming_profiles (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 version integer not null check(version>0), sources jsonb not null, statistics jsonb not null,
 summary text not null check(char_length(summary) between 2 and 2000),
 preferences jsonb not null default '{"formats":[],"emphasis":[]}',
 created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(),
 unique(organization_id,version)
);
create index gym_programming_profiles_creator_idx on public.gym_programming_profiles(created_by);
alter table public.gym_programming_profiles enable row level security;
revoke all on public.gym_programming_profiles from public,anon,authenticated;
grant select on public.gym_programming_profiles to authenticated;
create policy programming_profile_staff on public.gym_programming_profiles for select to authenticated using (
 (select private.has_active_role(organization_id,array['owner','coach']::public.organization_role[])));
create trigger preserve_programming_profile before update on public.gym_programming_profiles for each row execute function private.preserve_training_review();

create function private.refresh_programming_profile(org uuid, owner_summary text default null, owner_preferences jsonb default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare refs jsonb; stats jsonb; result uuid; current_version integer; previous public.gym_programming_profiles%rowtype;
begin
 if (select auth.uid()) is null or not private.has_active_role(org,array['owner']::public.organization_role[]) then raise exception 'Active Owner required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||':programming-profile',0));
 select * into previous from public.gym_programming_profiles where organization_id=org order by version desc limit 1;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'itemId',r.training_item_id,'revision',r.revision,'title',r.title) order by r.id),'[]') into refs
 from public.training_library_reviews r join public.training_library_items t on t.id=r.training_item_id
 where r.organization_id=org and r.status='published' and t.status='published' and not t.generation_excluded
 and r.revision=(select max(v.revision) from public.training_library_reviews v where v.training_item_id=t.id);
 with rows as (select x.value as e,x.ordinality as position,r.primary_goal,r.review_notes as source_notes from public.training_library_reviews r join public.training_library_items t on t.id=r.training_item_id
 cross join lateral jsonb_array_elements(r.exercises) with ordinality x where r.organization_id=org and r.status='published' and t.status='published' and not t.generation_excluded
 and r.revision=(select max(v.revision) from public.training_library_reviews v where v.training_item_id=t.id))
 select jsonb_build_object('publishedCount',jsonb_array_length(refs),
 'formats',(select coalesce(jsonb_object_agg(format,n),'{}') from (select coalesce(e->'protocol'->>'format','straight') as format,count(*) n from rows group by 1) f),
 'emphasis',(select coalesce(jsonb_object_agg(primary_goal,n),'{}') from (select primary_goal,count(*) n from rows group by 1) f),
 'frequentExercises',(select coalesce(jsonb_agg(q),'[]') from (select e->>'libraryExerciseId' as id,e->>'name' as name,count(*) uses from rows group by 1,2 order by count(*) desc limit 12) q),
 'sets',jsonb_build_array(min((e->>'sets')::integer),max((e->>'sets')::integer)),
 'reps',jsonb_build_array(min((e->>'reps')::integer),max((e->>'reps')::integer)),
 'restSeconds',jsonb_build_array(min((e->>'restSeconds')::integer),max((e->>'restSeconds')::integer)),
 'timedRows',count(*) filter(where e->'protocol'->>'measurement'='time'),
 'distanceRows',count(*) filter(where e->'protocol'->>'measurement'='distance'),
 'finishers',count(*) filter(where e->'protocol'->>'block'='finisher'),
 'orderPatterns',(select coalesce(jsonb_agg(q),'[]') from (select position,e->>'name' as name,count(*) uses from rows group by 1,2 order by position,count(*) desc limit 24) q),
 'terminology',(select coalesce(jsonb_agg(term),'[]') from unnest(array['tempo','controlled','each side','station','rest','hold','explosive','steady']) term
   where exists(select 1 from rows where concat_ws(' ',e->>'notes',source_notes) ilike '%'||term||'%')),
 'progressionPatterns',(select coalesce(jsonb_agg(term),'[]') from unnest(array['double progression','increase load','add weight','increase reps','deload','reduce volume']) term
   where exists(select 1 from rows where concat_ws(' ',e->>'notes',source_notes) ilike '%'||term||'%')),
 'resourceUse',(select coalesce(jsonb_object_agg(resource,n),'{}') from (select resource,count(*) n from rows
   join public.exercise_library l on l.id=(e->>'libraryExerciseId')::uuid cross join lateral unnest(l.equipment_requirements) resource
   where resource in ('turf','sled','rower','ski_erg') group by resource) q),
 'preferredFinishers',(select coalesce(jsonb_agg(q),'[]') from (select e->>'name' as name,count(*) uses from rows where e->'protocol'->>'block'='finisher' group by 1 order by count(*) desc) q),
 'ordering','Exact exercise order, source terminology, cues and progression notes remain in the referenced immutable reviews; no progression is inferred.') into stats from rows;
 current_version:=coalesce(previous.version,0)+1;
 insert into public.gym_programming_profiles(organization_id,version,sources,statistics,summary,preferences,created_by)
 values(org,current_version,refs,stats,coalesce(nullif(trim(owner_summary),''),previous.summary,
   format('%s reviewed published workouts. Only compatible examples influence drafts; no unreviewed imports are used.',jsonb_array_length(refs))),
   coalesce(owner_preferences,previous.preferences,'{"formats":[],"emphasis":[]}'),(select auth.uid())) returning id into result;
 return result;
end $$;
revoke all on function private.refresh_programming_profile(uuid,text,jsonb) from public,anon,authenticated;

create function public.save_programming_profile(profile_summary text,preferred_formats text[],preferred_emphasis text[]) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid;
begin
 select organization_id into strict org from public.organization_memberships where user_id=(select auth.uid()) and status='active' and role='owner';
 if (select auth.uid()) is null or char_length(trim(profile_summary)) not between 2 and 2000
   or preferred_formats is null or preferred_emphasis is null
   or not(preferred_formats <@ array['straight','superset','circuit','stations','emom','amrap','rounds','interval'])
   or not(preferred_emphasis <@ array['strength','hypertrophy','conditioning','mobility','athletic']) then raise exception 'Review profile preferences'; end if;
 return private.refresh_programming_profile(org,profile_summary,jsonb_build_object('formats',preferred_formats,'emphasis',preferred_emphasis));
end $$;

create function public.review_structured_training_item(target_item_id uuid,review_title text,review_status public.training_library_status,
 goal text,duration_minutes integer,review_exercises jsonb,review_notes text,source_confirmed boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare item public.training_library_items%rowtype; normalized jsonb; result uuid; rev integer;
begin
 select * into strict item from public.training_library_items where id=target_item_id for update;
 if (select auth.uid()) is null or not private.has_active_role(item.organization_id,array['owner']::public.organization_role[]) then raise exception 'Active Owner required'; end if;
 if review_status is null or review_status not in ('draft','review','published') or jsonb_typeof(review_exercises) is distinct from 'array'
   or jsonb_array_length(review_exercises)>30 then raise exception 'Invalid review'; end if;
 if review_status='published' then
   if source_confirmed is distinct from true then raise exception 'Resolve all missing information and confirm the original source'; end if;
   normalized:=private.validate_quality_exercises(review_exercises,item.organization_id,null,false);
   if exists(select 1 from jsonb_array_elements(normalized) e where char_length(trim(coalesce(e->>'sourceText',''))) not between 2 and 2000) then raise exception 'Source evidence required for each mapped exercise'; end if;
 else normalized:=review_exercises; end if;
 select coalesce(max(revision),0)+1 into rev from public.training_library_reviews where training_item_id=item.id;
 insert into public.training_library_reviews(training_item_id,organization_id,revision,title,status,primary_goal,duration_minutes,exercises,review_notes,reviewed_by,structure_version,source_confirmed)
 values(item.id,item.organization_id,rev,trim(review_title),review_status,goal,duration_minutes,normalized,trim(review_notes),(select auth.uid()),2,coalesce(source_confirmed,false)) returning id into result;
 update public.training_library_items set status=review_status where id=item.id;
 perform private.refresh_programming_profile(item.organization_id);
 return result;
end $$;

-- Bulk publication only re-publishes complete, individually confirmed version-2
-- reviews. Never interpret raw rows or auto-publish merely parsed drafts.
create function public.set_training_generation_status(item_ids uuid[],publish boolean,excluded boolean default false) returns integer
language plpgsql security definer set search_path='' as $$
declare org uuid; item public.training_library_items%rowtype; r public.training_library_reviews%rowtype; changed integer:=0;
begin
 select organization_id into strict org from public.organization_memberships where user_id=(select auth.uid()) and status='active' and role='owner';
 if (select auth.uid()) is null or not private.has_active_role(org,array['owner']::public.organization_role[]) or item_ids is null or cardinality(item_ids) not between 1 and 100 or publish is null or excluded is null or (publish and excluded) then raise exception 'Active Owner and selected records required'; end if;
 for item in select * from public.training_library_items where id=any(item_ids) order by id for update loop
   if item.organization_id<>org then raise exception 'Source does not belong to this gym'; end if;
   if publish then
     select * into strict r from public.training_library_reviews where training_item_id=item.id order by revision desc limit 1;
     if r.structure_version<>2 or not r.source_confirmed or r.primary_goal is null or r.duration_minutes is null or char_length(trim(r.review_notes))<2 then raise exception 'Individually review and confirm every selected record first'; end if;
     perform private.validate_quality_exercises(r.exercises,org,null,false);
     if exists(select 1 from jsonb_array_elements(r.exercises) e where char_length(trim(coalesce(e->>'sourceText',''))) not between 2 and 2000) then raise exception 'Source evidence is required for every reviewed row'; end if;
     insert into public.training_library_reviews(training_item_id,organization_id,revision,title,status,primary_goal,duration_minutes,exercises,review_notes,reviewed_by,structure_version,source_confirmed)
     values(item.id,org,r.revision+1,r.title,'published',r.primary_goal,r.duration_minutes,r.exercises,r.review_notes,(select auth.uid()),2,true);
   end if;
   update public.training_library_items set status=case when publish then 'published'::public.training_library_status else 'review'::public.training_library_status end,generation_excluded=excluded where id=item.id;
   changed:=changed+1;
 end loop;
 if changed<>cardinality(item_ids) then raise exception 'Some selected sources are unavailable'; end if;
 perform private.refresh_programming_profile(org);
 return changed;
end $$;

revoke all on function public.save_programming_profile(text,text[],text[]),public.review_structured_training_item(uuid,text,public.training_library_status,text,integer,jsonb,text,boolean),public.set_training_generation_status(uuid[],boolean,boolean) from public,anon,authenticated;
grant execute on function public.save_programming_profile(text,text[],text[]),public.review_structured_training_item(uuid,text,public.training_library_status,text,integer,jsonb,text,boolean),public.set_training_generation_status(uuid[],boolean,boolean) to authenticated;
