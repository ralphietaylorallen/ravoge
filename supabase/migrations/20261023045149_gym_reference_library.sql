-- Raw gym references are NOT verified templates. Keep every raw row/revision.
alter table public.training_library_items
 add column reference_enabled boolean not null default false,
 add column reference_enabled_at timestamptz,
 add column reference_enabled_by uuid references auth.users(id) on delete restrict,
 add column reference_version integer not null default 1,
 add column reference_deleted_at timestamptz,
 add column reference_signature jsonb not null default '{}'::jsonb;
create index training_reference_actor_idx on public.training_library_items(reference_enabled_by);
create index training_reference_scope_idx on public.training_library_items(organization_id,reference_enabled,id) where reference_deleted_at is null;

-- A cached, allowlisted lexical excerpt, not an invented normalized workout.
-- Arbitrary prose, names, emails, filenames, notes and numeric loads NEVER leave
-- this function. Unknown names may imply format but are not exercise identities.
create function private.reference_words(value text) returns text language sql immutable set search_path='' as $$
 select ' '||trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(lower(coalesce(value,'')),
   '\mdb\M','dumbbell','g'),'\mbb\M','barbell','g'),'\mrdl\M','romanian deadlift','g'),'[^a-z0-9]+',' ','g'))||' '
$$;
create function private.gym_reference_signature(content jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare prose text; words text; ids jsonb; formats jsonb; terms jsonb; goal text; duration text;
begin
 select string_agg(coalesce(c->>'display',c->>'raw',''),E'\n') into prose from jsonb_array_elements(coalesce(content->'cells','[]')) c;
 words:=private.reference_words(prose);
 select coalesce(jsonb_agg(e.id order by e.id),'[]') into ids from public.exercise_library e
 where e.is_active and e.organization_id is null and position(private.reference_words(e.name) in words)>0;
 select coalesce(jsonb_agg(term),'[]') into formats from unnest(array['emom','amrap','circuit','stations','superset','interval','rounds']) term
 where words like '% '||term||' %' or words like '% '||term||'s %';
 select coalesce(jsonb_agg(term),'[]') into terms from unnest(array['per side','each side','tempo','ladder','finisher','warmup','strength','conditioning','power','mobility','percentage']) term
 where words like '% '||term||' %' or (term='percentage' and position('%' in prose)>0);
 select lower(c->>'display') into goal from jsonb_array_elements(coalesce(content->'cells','[]')) c where lower(c->>'header') in ('goal','primary goal') limit 1;
 select c->>'display' into duration from jsonb_array_elements(coalesce(content->'cells','[]')) c where lower(c->>'header') in ('duration','duration minutes') limit 1;
 return jsonb_build_object('version',1,'exerciseIds',ids,'formats',formats,'terms',terms,
   'goal',case when goal in ('strength','muscle_gain','fat_loss','general_fitness','conditioning','athletic_performance','body_recomposition') then goal else null end,
   'duration',case when duration~'^[0-9]{1,3}$' and duration::integer between 5 and 180 then duration::integer else null end,
   'rawProtocolsUnverified',true);
end $$;
revoke all on function private.reference_words(text),private.gym_reference_signature(jsonb) from public,anon,authenticated;

create function private.enable_owner_import_reference() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if ((tg_op='INSERT' and (select auth.uid())=new.created_by) or (tg_op='UPDATE' and new.status='published' and old.status is distinct from new.status and new.reference_deleted_at is null))
   and private.has_active_role(new.organization_id,array['owner']::public.organization_role[]) then
   new.reference_enabled:=true; new.reference_enabled_at:=now(); new.reference_enabled_by:=(select auth.uid());
   new.reference_signature:=private.gym_reference_signature(new.normalized_content);
 end if;
 return new;
end $$;
revoke all on function private.enable_owner_import_reference() from public,anon,authenticated;
create trigger enable_owner_import_reference before insert on public.training_library_items for each row execute function private.enable_owner_import_reference();
create trigger enable_owner_template_reference before update of status on public.training_library_items for each row execute function private.enable_owner_import_reference();

-- Preserve previously authorized structured publications. Existing raw imports
-- are enabled only by the explicit Owner bulk operation, never by pretending
-- they have individually verified reviews.
update public.training_library_items set reference_enabled=true,reference_enabled_at=now(),reference_enabled_by=created_by,
 reference_signature=private.gym_reference_signature(normalized_content) where status='published' and not generation_excluded;

create function public.set_gym_references(item_ids uuid[],all_matching boolean,search_text text,operation text,confirmed boolean) returns integer
language plpgsql security definer set search_path='' as $$
declare org uuid; changed integer;
begin
 select organization_id into strict org from public.organization_memberships where user_id=(select auth.uid()) and role='owner' and status='active' limit 1;
 if operation not in ('enable','exclude','delete','restore','refresh') or operation is null or coalesce(char_length(search_text),0)>160
   or all_matching is null or (not all_matching and coalesce(cardinality(item_ids),0) not between 1 and 10000)
   or operation in ('enable','delete') and confirmed is distinct from true then raise exception 'Owner selection and confirmation required'; end if;
 if not all_matching and exists(select 1 from unnest(item_ids) id where not exists(select 1 from public.training_library_items t where t.id=id and t.organization_id=org)) then raise exception 'Source outside this gym'; end if;
 with selected as (
   select t.id from public.training_library_items t where t.organization_id=org
   and (case when operation='restore' then t.reference_deleted_at is not null else t.reference_deleted_at is null end)
   and (case when all_matching then position(lower(coalesce(search_text,'')) in lower(t.title))>0 else t.id=any(item_ids) end)
   order by t.id for update
 )
 update public.training_library_items t set
   reference_enabled=case when operation='enable' then true when operation in ('exclude','delete') then false else t.reference_enabled end,
   reference_enabled_at=case when operation='enable' then now() else t.reference_enabled_at end,
   reference_enabled_by=(select auth.uid()),reference_version=t.reference_version+1,
   reference_deleted_at=case when operation='delete' then now() when operation='restore' then null else t.reference_deleted_at end,
   generation_excluded=case when operation='enable' then false when operation in ('exclude','delete') then true else t.generation_excluded end,
   reference_signature=case when operation in ('enable','refresh') then private.gym_reference_signature(t.normalized_content) else t.reference_signature end
 from selected s where t.id=s.id;
 get diagnostics changed=row_count;
 return changed;
end $$;
revoke all on function public.set_gym_references(uuid[],boolean,text,text,boolean) from public,anon,authenticated;
grant execute on function public.set_gym_references(uuid[],boolean,text,text,boolean) to authenticated;

alter function private.workout_knowledge_catalog(uuid,uuid) rename to workout_knowledge_catalog_before_raw;
create function private.workout_knowledge_catalog(org uuid,intake uuid) returns jsonb language sql stable security definer set search_path='' as $$
 with structured as (
   select r from jsonb_array_elements(private.workout_knowledge_catalog_before_raw(org,intake)) r
   join public.training_library_items t on t.id=(r->>'itemId')::uuid and t.organization_id=org
   where t.reference_enabled and t.reference_deleted_at is null
 ), raw as (
   select jsonb_build_object('id',t.id,'itemId',t.id,'title',t.title,'revision',t.reference_version,'goal',coalesce(t.reference_signature->>'goal',''),
     'duration',coalesce((t.reference_signature->>'duration')::integer,0),'exercises','[]'::jsonb,'sourceKind','raw_reference','rawStyle',
     t.reference_signature||jsonb_build_object('exerciseIds',coalesce((select jsonb_agg(matched.value) from jsonb_array_elements_text(t.reference_signature->'exerciseIds') as matched(value)
       where private.generation_exercise_compatible(matched.value::uuid,intake)),'[]'::jsonb))) r
   from public.training_library_items t where t.organization_id=org and t.reference_enabled and not t.generation_excluded and t.reference_deleted_at is null
    and not exists(select 1 from structured s where s.r->>'itemId'=t.id::text)
 )
 select coalesce(jsonb_agg(r order by r->>'id'),'[]') from (select r from structured union all select r from raw) q
$$;
revoke all on function private.workout_knowledge_catalog(uuid,uuid) from public,anon,authenticated;

-- Extend existing guarded inputs/credits, rather than replace validators.
do $patch$ declare definition text; begin
 definition:=pg_get_functiondef('public.get_quality_generation_input(uuid)'::regprocedure);
 definition:=replace(definition,'''eligible'',jsonb_array_length(catalog)',
   '''eligible'',jsonb_array_length(catalog),''referenceEnabled'',(select count(*) from public.training_library_items where organization_id=org and reference_enabled and reference_deleted_at is null)');
 execute definition;
 definition:=pg_get_functiondef('public.complete_pound_prescription_before_load_engine(uuid,text,jsonb,jsonb)'::regprocedure);
 if position('jsonb_array_length(used)>3' in definition)=0 then raise exception 'Unexpected guarded source-credit function'; end if;
 definition:=replace(definition,'jsonb_array_length(used)>3','jsonb_array_length(used)>5');
 definition:=replace(definition,'''reviewed_organization_references''',
   'case when exists(select 1 from jsonb_array_elements(refs) v where v->>''sourceKind''=''raw_reference'') then ''gym_reference_examples'' else ''reviewed_organization_references'' end');
 execute definition;
end $patch$;

-- Tag deterministic reference-inspired fallback honestly and derive additions
-- from canonical source matches, not model-provided claims. All existing load,
-- source snapshot, active-membership, safety and approval guards still execute.
alter function public.complete_pound_prescription(uuid,text,jsonb,jsonb) rename to complete_pound_prescription_before_raw_references;
revoke all on function public.complete_pound_prescription_before_raw_references(uuid,text,jsonb,jsonb) from public,anon,authenticated;
create function public.complete_pound_prescription(target_prescription_id uuid,expected_snapshot text,proposed_workout jsonb,generation_details jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare org uuid;
begin
 perform public.get_pound_generation_input(target_prescription_id);
 select organization_id into strict org from public.generated_prescriptions where id=target_prescription_id;
 perform 1 from public.training_library_items where organization_id=org order by id for share;
 perform public.complete_pound_prescription_before_raw_references(target_prescription_id,expected_snapshot,proposed_workout,generation_details);
 update public.generated_prescriptions p set generation_context=p.generation_context||jsonb_build_object(
   'evidenceVersion','curated-2026-10-22','liveWebResearch',false,
   'generationMethod',case when generation_details->>'method'='deterministic_reference_fallback' then 'deterministic_reference_fallback' else p.generation_context->>'generationMethod' end,
   'fallbackReason',case when generation_details->>'method'='deterministic_reference_fallback' then coalesce(generation_details->>'providerIssue','unavailable') else p.generation_context->>'fallbackReason' end,
   'addedExerciseIds',coalesce((
     select jsonb_agg(x->>'libraryExerciseId') from jsonb_array_elements(p.original_recommendation) x
     where not exists(select 1 from jsonb_array_elements(coalesce(p.generation_context->'referenceVersions','[]')) r
       where coalesce(r->'rawStyle'->'exerciseIds','[]') ? (x->>'libraryExerciseId') or exists(select 1 from jsonb_array_elements(r->'exercises') e where e->>'libraryExerciseId'=x->>'libraryExerciseId'))),'[]'::jsonb)),
   engine_version=case when generation_details->>'method'='deterministic_reference_fallback' then 'prescription-v0.4-fallback' else p.engine_version end
 where p.id=target_prescription_id;
end $$;
revoke all on function public.complete_pound_prescription(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.complete_pound_prescription(uuid,text,jsonb,jsonb) to authenticated;

alter function public.get_training_catalog_counts() rename to get_training_catalog_counts_before_references;
revoke all on function public.get_training_catalog_counts_before_references() from public,anon,authenticated;
create function public.get_training_catalog_counts() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare counts jsonb; org uuid; begin
 counts:=public.get_training_catalog_counts_before_references();
 select organization_id into strict org from public.organization_memberships where user_id=(select auth.uid()) and role='owner' and status='active' limit 1;
 return counts||jsonb_build_object('referenceEnabled',(select count(*) from public.training_library_items where organization_id=org and reference_enabled and reference_deleted_at is null),
   'archived',(select count(*) from public.training_library_items where organization_id=org and reference_deleted_at is not null));
end $$;
revoke all on function public.get_training_catalog_counts() from public,anon,authenticated;
grant execute on function public.get_training_catalog_counts() to authenticated;
