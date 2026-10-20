-- Reuse immutable, Owner-reviewed classifications/protocols. No table, raw-row
-- mutation, automatic publication, historical rewrite or new authorization path.
create function private.workout_knowledge_catalog(org uuid,intake uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 with latest as (
   select r.* from public.training_library_reviews r join public.training_library_items t on t.id=r.training_item_id
   where r.organization_id=org and t.organization_id=org and r.status='published' and t.status='published'
     and not t.generation_excluded and r.structure_version=2 and r.source_confirmed
     and r.revision=(select max(v.revision) from public.training_library_reviews v where v.training_item_id=t.id)
 ), expanded as (
   select r.id,x.value,x.ordinality,
     case when coalesce(x.value->'protocol'->>'group','')<>'' then concat_ws(':',x.value->'protocol'->>'block',x.value->'protocol'->>'format',x.value->'protocol'->>'group') else 'row:'||x.ordinality end as block_key,
     private.generation_exercise_compatible((x.value->>'libraryExerciseId')::uuid,intake) as compatible
   from latest r cross join lateral jsonb_array_elements(r.exercises) with ordinality x
 ), coherent as (
   select *,bool_and(compatible) over(partition by id,block_key) as compatible_block from expanded
 ), eligible as (
   select id,jsonb_agg(value order by ordinality) as exercises from coherent where compatible_block group by id
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'itemId',r.training_item_id,'title',r.title,'revision',r.revision,
   'goal',r.primary_goal,'duration',r.duration_minutes,'structureVersion',2,'exercises',e.exercises) order by r.id),'[]')
 from latest r join eligible e on e.id=r.id
$$;
revoke all on function private.workout_knowledge_catalog(uuid,uuid) from public,anon,authenticated;

alter function public.get_quality_generation_input(uuid) rename to get_quality_generation_input_before_intelligence;
revoke all on function public.get_quality_generation_input_before_intelligence(uuid) from public,anon,authenticated;
create function public.get_quality_generation_input(target_prescription_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare payload jsonb; org uuid; intake uuid; focus text; catalog jsonb; total integer; approved integer;
begin
 -- All existing current-membership, assignment, draft, latest-intake, equipment,
 -- readiness and safety guards run before the private catalog is consulted.
 payload:=public.get_quality_generation_input_before_intelligence(target_prescription_id);
 intake:=(payload->>'intakeId')::uuid;
 select organization_id,custom_fields->>'trainingFocus' into strict org,focus from public.client_intakes where id=intake;
 if focus is null or focus not in ('running_5k','muscle_growth','general_fitness','fat_loss_support') then focus:=null; end if;
 catalog:=private.workout_knowledge_catalog(org,intake);
 select count(*),count(*) filter(where t.status='published' and not t.generation_excluded and exists(
   select 1 from public.training_library_reviews r where r.training_item_id=t.id and r.organization_id=org and r.status='published'
    and r.source_confirmed and r.structure_version=2 and r.revision=(select max(v.revision) from public.training_library_reviews v where v.training_item_id=t.id)))
 into total,approved from public.training_library_items t where t.organization_id=org;
 payload:=(payload-'snapshot')||jsonb_build_object('trainingFocus',focus,'knowledgeCatalog',catalog,
   'knowledgeCounts',jsonb_build_object('total',total,'approved',approved,'eligible',jsonb_array_length(catalog)));
 return payload||jsonb_build_object('snapshot',md5(payload::text));
end $$;
revoke all on function public.get_quality_generation_input(uuid) from public,anon,authenticated;
grant execute on function public.get_quality_generation_input(uuid) to authenticated;

alter function public.complete_pound_prescription(uuid,text,jsonb,jsonb) rename to complete_pound_prescription_before_intelligence;
revoke all on function public.complete_pound_prescription_before_intelligence(uuid,text,jsonb,jsonb) from public,anon,authenticated;
create function public.complete_pound_prescription(target_prescription_id uuid,expected_snapshot text,proposed_workout jsonb,generation_details jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare input jsonb; intent jsonb; analysis jsonb; used jsonb; refs jsonb; snapshot jsonb; ids text[]; k text;
begin
 input:=public.get_pound_generation_input(target_prescription_id);
 intent:=generation_details->'intelligence';
 if intent is not null and intent<>'null'::jsonb then
   if jsonb_typeof(intent)<>'object' or coalesce(intent->>'method','') not in ('openai','rules_fallback')
     or (select count(*) from jsonb_object_keys(intent))<>3
     or jsonb_typeof(intent->'cacheHit') is distinct from 'boolean' or jsonb_typeof(intent->'analysis') is distinct from 'object'
     or exists(select 1 from jsonb_object_keys(intent) key where key not in ('method','cacheHit','analysis')) then raise exception 'Invalid training analysis'; end if;
   analysis:=intent->'analysis';
   if (select count(*) from jsonb_object_keys(analysis))<>6
     or exists(select 1 from jsonb_object_keys(analysis) key where key not in ('objectives','priorityPatterns','methods','preferredFormats','progression','intensityCeiling'))
     or coalesce(analysis->>'progression','') not in ('technique_then_reps','gradual_volume','recovery_first','maintain_consistency')
     or jsonb_typeof(analysis->'intensityCeiling') is distinct from 'number' then raise exception 'Invalid training analysis'; end if;
   if (analysis->>'intensityCeiling')::numeric not between 4 and (case when input->>'experience'='beginner' then 7 else 8 end) then raise exception 'Invalid training intensity'; end if;
   foreach k in array array['objectives','priorityPatterns','methods','preferredFormats'] loop
     if jsonb_typeof(analysis->k) is distinct from 'array' then raise exception 'Invalid training analysis lists'; end if;
     if jsonb_array_length(analysis->k) not between 1 and (case k when 'objectives' then 4 when 'methods' then 6 when 'preferredFormats' then 4 else 8 end)
       or (select count(*) from jsonb_array_elements_text(analysis->k))<>(select count(distinct v) from jsonb_array_elements_text(analysis->k) v) then raise exception 'Invalid training analysis lists'; end if;
   end loop;
   if exists(select 1 from jsonb_array_elements_text(analysis->'objectives') v where v not in ('strength','hypertrophy','aerobic_endurance','running_economy','general_fitness','fat_loss_support'))
     or exists(select 1 from jsonb_array_elements_text(analysis->'methods') v where v not in ('warmup','preparation','strength','power','accessory','conditioning','finisher','cooldown'))
     or exists(select 1 from jsonb_array_elements_text(analysis->'preferredFormats') v where v not in ('straight','superset','circuit','stations','emom','amrap','rounds','interval'))
     or exists(select 1 from jsonb_array_elements_text(analysis->'priorityPatterns') v where not exists(select 1 from jsonb_array_elements(input->'candidates') c where c->>'pattern'=v)) then raise exception 'Unapproved training analysis value'; end if;
   used:=coalesce(generation_details->'sourceReviewIds','[]');
   if jsonb_typeof(used)<>'array' or jsonb_array_length(used)>3 then raise exception 'Invalid source credits'; end if;
   select coalesce(array_agg(v),'{}') into ids from jsonb_array_elements_text(used) v;
   if cardinality(ids)<>(select count(distinct v) from unnest(ids) v) or exists(select 1 from unnest(ids) id where not exists(
     select 1 from jsonb_array_elements(input->'knowledgeCatalog') r where r->>'id'=id)) then raise exception 'Source is not currently approved and compatible in this gym'; end if;
   select coalesce(jsonb_agg(r order by array_position(ids,r->>'id')),'[]') into refs from jsonb_array_elements(input->'knowledgeCatalog') r where r->>'id'=any(ids);
   if proposed_workout is not null and exists(select 1 from jsonb_array_elements(proposed_workout->'exercises') x where (x->'protocol'->>'targetRpe')::numeric>(analysis->>'intensityCeiling')::numeric) then raise exception 'Draft exceeds planned intensity ceiling'; end if;
 end if;
 -- Same optimistic source/intake/history/equipment snapshot and all original
 -- pound, protocol, role, stale-input and completion validators remain active.
 perform public.complete_pound_prescription_before_intelligence(target_prescription_id,expected_snapshot,proposed_workout,generation_details);
 select generation_context->'trainingSnapshot' into snapshot from public.generated_prescriptions where id=target_prescription_id;
 -- Retain only actual source credits + a catalog digest, not 124 full source
 -- copies in each Client history record. Raw rows/reviews stay immutable.
 snapshot:=(snapshot-'knowledgeCatalog')||jsonb_build_object('knowledgeCatalogDigest',md5((input->'knowledgeCatalog')::text));
 if intent is not null and intent<>'null'::jsonb then
   snapshot:=snapshot||jsonb_build_object('intelligence',intent);
   if proposed_workout is not null then snapshot:=snapshot||jsonb_build_object('references',refs); end if;
 end if;
 update public.generated_prescriptions set generation_context=generation_context||jsonb_build_object('trainingSnapshot',snapshot)
   ||case when intent is not null and intent<>'null'::jsonb and proposed_workout is not null then jsonb_build_object(
     'referenceVersions',refs,'sourceType',case when jsonb_array_length(refs)>0 then 'reviewed_organization_references' else 'global_library' end,
     'sourceReviewId',null,'sourceItemId',null,'sourceTitle',null,'intelligenceVersion','intent-retrieval-v1') else '{}'::jsonb end
 where id=target_prescription_id;
end $$;
revoke all on function public.complete_pound_prescription(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.complete_pound_prescription(uuid,text,jsonb,jsonb) to authenticated;
