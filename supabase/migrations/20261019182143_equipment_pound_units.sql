-- Additive only: historical canonical measurements and unlabelled loads are not
-- rewritten. New UI writes explicitly carry pounds; old RPCs remain compatible.
create function private.valid_weight_sizes(sizes numeric[], minimum numeric, maximum numeric)
returns boolean language sql immutable set search_path='' as $$
 select sizes is null or (cardinality(sizes) between 1 and 64 and not exists(
   select 1 from unnest(sizes) n where n is null or n::text in ('NaN','Infinity','-Infinity')
     or n<=0 or n>100000 or n<>round(n,3) or n<minimum or n>maximum))
$$;
revoke all on function private.valid_weight_sizes(numeric[],numeric,numeric) from public,anon,authenticated;
-- A pure argument validator used by a CHECK constraint must be callable by
-- existing authenticated inventory writers. It reads no table and is not definer.
grant execute on function private.valid_weight_sizes(numeric[],numeric,numeric) to authenticated;
alter table public.organization_equipment
 add column min_weight_lb numeric(9,3),
 add column max_weight_lb numeric(9,3),
 add column weight_sizes_lb numeric[],
 add column paired_sizes_confirmed boolean not null default false,
 add constraint equipment_lb_range check (
   (min_weight_lb is null or min_weight_lb>0 and min_weight_lb<=100000)
   and (max_weight_lb is null or max_weight_lb>0 and max_weight_lb<=100000)
   and (min_weight_lb is null or max_weight_lb is null or min_weight_lb<=max_weight_lb)),
 add constraint equipment_lb_sizes check(private.valid_weight_sizes(weight_sizes_lb,min_weight_lb,max_weight_lb)),
 add constraint equipment_lb_pairs check(not paired_sizes_confirmed or
   (equipment_type='plates' and weight_sizes_lb is not null and cardinality(weight_sizes_lb)<=16 and (quantity is null or quantity>=2*cardinality(weight_sizes_lb))));
alter table public.workout_exercises add column load_unit text check(load_unit in ('kg','lb'));
alter table public.workout_sets add column prescribed_load_unit text check(prescribed_load_unit in ('kg','lb'));
create function private.inherit_prescribed_load_unit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.prescribed_load_unit is null then
   select load_unit into new.prescribed_load_unit from public.workout_exercises where id=new.workout_exercise_id;
 end if;
 return new;
end $$;
revoke all on function private.inherit_prescribed_load_unit() from public,anon,authenticated;
create trigger inherit_prescribed_load_unit before insert on public.workout_sets for each row execute function private.inherit_prescribed_load_unit();

-- Preserve explicit unit metadata in newly reviewed immutable source revisions.
-- Keep the existing safety/protocol validator intact and execute it first.
alter function private.validate_quality_exercises(jsonb,uuid,uuid,boolean) rename to validate_quality_exercises_before_pounds;
create function private.validate_quality_exercises(proposed jsonb,org uuid,intake uuid,generated boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare normalized jsonb;
begin
 normalized:=private.validate_quality_exercises_before_pounds(proposed,org,intake,generated);
 return (select coalesce(jsonb_agg(x || case when proposed->(n::integer-1)->>'loadUnit' in ('kg','lb')
   then jsonb_build_object('loadUnit',proposed->(n::integer-1)->>'loadUnit','referenceLoadLb',proposed->(n::integer-1)->'referenceLoadLb') else '{}'::jsonb end order by n),'[]')
   from jsonb_array_elements(normalized) with ordinality q(x,n));
end $$;
revoke all on function private.validate_quality_exercises(jsonb,uuid,uuid,boolean) from public,anon,authenticated;

create function public.save_gym_resource_lb(target_id uuid,resource_kind text,resource_type text,
 resource_name text,resource_quantity integer,resource_length numeric,resource_unit text,available boolean,
 resource_notes text,minimum_lb numeric,maximum_lb numeric,exact_sizes_lb numeric[],matched_pairs boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; sizes numeric[];
begin
 -- Existing function checks the active Owner, derives their gym server-side,
 -- scopes updates by organization and serializes duplicate creation.
 result:=public.save_gym_resource(target_id,resource_kind,resource_type,resource_name,resource_quantity,resource_length,resource_unit,available,resource_notes);
 if resource_kind='equipment' then
   if not private.valid_weight_sizes(exact_sizes_lb,minimum_lb,maximum_lb) then raise exception 'Invalid individual weights in lb'; end if;
   select array_agg(n order by n) into sizes from (select distinct unnest(exact_sizes_lb) n) q;
   update public.organization_equipment set min_weight_lb=minimum_lb,max_weight_lb=maximum_lb,
     weight_sizes_lb=sizes,paired_sizes_confirmed=coalesce(matched_pairs,false) where id=result;
 elsif minimum_lb is not null or maximum_lb is not null or exact_sizes_lb is not null or matched_pairs then
   raise exception 'Facility lengths are not weights';
 end if;
 return result;
end $$;

create function private.weight_capabilities(org uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('type',equipment_type,'minLb',min_weight_lb,'maxLb',max_weight_lb,
   'sizesLb',weight_sizes_lb,'pairsConfirmed',paired_sizes_confirmed) order by id),'[]')
 from public.organization_equipment where organization_id=org and is_available
$$;

create function private.assert_pound_load(org uuid,requirements text[],load_lb numeric)
returns void language plpgsql stable security definer set search_path='' as $$
declare matched boolean; plate_sizes numeric[]; bars numeric[];
begin
 if load_lb is null then return; end if;
 if load_lb::text in ('NaN','Infinity','-Infinity') or load_lb<0 or load_lb>100000 then raise exception 'Invalid load in lb'; end if;
 if 'barbell'=any(requirements) then
   if exists(select 1 from public.organization_equipment where organization_id=org and equipment_type='barbell' and is_available)
     and not exists(select 1 from public.organization_equipment where organization_id=org and equipment_type='barbell' and is_available and (min_weight_lb is null or load_lb>=min_weight_lb))
     then raise exception 'Load below unloaded bar weight'; end if;
   select array_agg(distinct n) into bars from public.organization_equipment e cross join lateral unnest(e.weight_sizes_lb) n
     where e.organization_id=org and e.equipment_type='barbell' and e.is_available;
   select array_agg(distinct n order by n) into plate_sizes from public.organization_equipment e cross join lateral unnest(e.weight_sizes_lb) n
     where e.organization_id=org and e.equipment_type='plates' and e.is_available and e.paired_sizes_confirmed;
   if cardinality(plate_sizes)>16 then raise exception 'Too many distinct paired plate sizes; review inventory'; end if;
   if bars is not null and plate_sizes is not null then
     with recursive sums(position,total) as (
       select 0,0::numeric union all select position+1,total+added from sums
       cross join lateral (values(0::numeric),(2*plate_sizes[position+1])) q(added) where position<cardinality(plate_sizes)
     ) select exists(select 1 from sums cross join unnest(bars) bar where position=cardinality(plate_sizes) and abs(total+bar-load_lb)<0.00001) into matched;
     if not matched then raise exception 'Load cannot be assembled from confirmed bars and matched plate pairs'; end if;
   end if;
 elsif exists(select 1 from public.organization_equipment where organization_id=org and equipment_type=any(requirements) and is_available
   and (min_weight_lb is not null or max_weight_lb is not null or weight_sizes_lb is not null)) then
   if not exists(select 1 from public.organization_equipment where organization_id=org and equipment_type=any(requirements) and is_available
     and (min_weight_lb is not null or max_weight_lb is not null or weight_sizes_lb is not null)
     and (min_weight_lb is null or load_lb>=min_weight_lb) and (max_weight_lb is null or load_lb<=max_weight_lb)
     and (weight_sizes_lb is null or load_lb=any(weight_sizes_lb))) then raise exception 'Load outside confirmed available weights'; end if;
 end if;
 -- Unknown quantities/capacities are not evidence of client capacity. Coach
 -- review is still mandatory; no guessed numeric loads are generated.
end $$;

create function private.rounded_pound_load(org uuid,requirements text[],reference_lb numeric,percentage numeric)
returns numeric language plpgsql stable security definer set search_path='' as $$
declare bars numeric[]; plates numeric[]; rounded numeric; target numeric;
begin
 if reference_lb is null or reference_lb::text in ('NaN','Infinity','-Infinity') or reference_lb<=0 or reference_lb>100000
   or percentage is null or percentage::text in ('NaN','Infinity','-Infinity') or percentage<=0 or percentage>100 then raise exception 'Coach-confirmed reference pounds required'; end if;
 target:=reference_lb*percentage/100;
 if 'barbell'=any(requirements) then
   select array_agg(distinct n) into bars from public.organization_equipment e cross join lateral unnest(e.weight_sizes_lb) n
     where e.organization_id=org and e.equipment_type='barbell' and e.is_available;
   select array_agg(distinct n order by n) into plates from public.organization_equipment e cross join lateral unnest(e.weight_sizes_lb) n
     where e.organization_id=org and e.equipment_type='plates' and e.is_available and e.paired_sizes_confirmed;
   if bars is null or plates is null or cardinality(plates)>16 then raise exception 'Confirmed bars and matched pairs required'; end if;
   with recursive sums(position,total) as (
     select 0,0::numeric union all select position+1,total+added from sums
     cross join lateral (values(0::numeric),(2*plates[position+1])) q(added) where position<cardinality(plates)
   ) select max(total+bar) into rounded from sums cross join unnest(bars) bar where position=cardinality(plates) and total+bar<=target;
 else
   select max(n) into rounded from public.organization_equipment e cross join lateral unnest(e.weight_sizes_lb) n
     where e.organization_id=org and e.equipment_type=any(requirements) and e.is_available and n<=target;
 end if;
 if rounded is null then raise exception 'No achievable percentage load confirmed'; end if;
 return rounded;
end $$;
revoke all on function private.rounded_pound_load(uuid,text[],numeric,numeric) from public,anon,authenticated;

create function public.get_pound_generation_input(target_prescription_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare input jsonb; org uuid;
begin
 input:=public.get_quality_generation_input(target_prescription_id);
 select organization_id into strict org from public.generated_prescriptions where id=target_prescription_id;
 input:=(input-'snapshot')||jsonb_build_object('weightCapabilities',private.weight_capabilities(org));
 return input||jsonb_build_object('snapshot',md5(input::text));
end $$;

create function public.complete_pound_prescription(target_prescription_id uuid,expected_snapshot text,proposed_workout jsonb,generation_details jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare input jsonb; legacy jsonb; rows jsonb; org uuid;
begin
 select organization_id into strict org from public.generated_prescriptions where id=target_prescription_id for update;
 -- Freeze equipment changes through completion/validation in this transaction.
 perform 1 from public.organization_equipment where organization_id=org for share;
 input:=public.get_pound_generation_input(target_prescription_id);
 if expected_snapshot is null or expected_snapshot<>input->>'snapshot' then raise exception 'Training or weight capabilities changed'; end if;
 legacy:=public.get_quality_generation_input(target_prescription_id);
 perform public.complete_quality_prescription(target_prescription_id,legacy->>'snapshot',proposed_workout,generation_details);
 -- Old publications can contain unitless loads. Do not guess/relabel them.
 -- Keep the published/raw source untouched and require a fresh Coach load.
 select coalesce(jsonb_agg(x||jsonb_build_object('load',null,'loadUnit','lb') order by n),'[]') into rows
 from public.generated_prescriptions p cross join lateral jsonb_array_elements(p.original_recommendation) with ordinality q(x,n) where p.id=target_prescription_id;
 update public.generated_prescriptions set original_recommendation=rows,final_prescription=rows,
   generation_context=generation_context||jsonb_build_object('weightUnit','lb','trainingSnapshot',input)
   where id=target_prescription_id;
end $$;

create function private.mark_workout_pounds(workout uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.workout_exercises set load_unit='lb' where workout_assignment_id=workout;
 update public.workout_sets s set prescribed_load_unit='lb' from public.workout_exercises e where s.workout_exercise_id=e.id and e.workout_assignment_id=workout;
end $$;

create function public.approve_pound_prescription(target_prescription_id uuid,workout_title text,workout_instructions text,
 workout_scheduled_date date,workout_duration_minutes smallint,exercises jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.generated_prescriptions%rowtype; result uuid; x jsonb; requirements text[];
begin
 select * into strict p from public.generated_prescriptions where id=target_prescription_id for update;
 -- Underlying approval performs all current assignment, role, latest intake,
 -- safety, equipment and protocol checks. Any later validation failure rolls
 -- the entire assignment back; it cannot become visible partially.
 if p.engine_version like 'prescription-v0.4-%' then
   result:=public.approve_quality_prescription(p.id,workout_title,workout_instructions,workout_scheduled_date,workout_duration_minutes,exercises);
 else
   result:=public.approve_reviewed_prescription(p.id,workout_title,workout_instructions,workout_scheduled_date,workout_duration_minutes,exercises);
 end if;
 perform 1 from public.organization_equipment where organization_id=p.organization_id for share;
 for x in select value from jsonb_array_elements(exercises) loop
   if x->>'loadUnit' is distinct from 'lb' then raise exception 'New loads must be explicit pounds'; end if;
   select equipment_requirements into strict requirements from public.exercise_library where id=(x->>'libraryExerciseId')::uuid;
   perform private.assert_pound_load(p.organization_id,requirements,(x->>'load')::numeric);
   if x->'protocol'->>'percentageLoad' is not null and ((x->>'load')::numeric is distinct from
     private.rounded_pound_load(p.organization_id,requirements,(x->>'referenceLoadLb')::numeric,(x->'protocol'->>'percentageLoad')::numeric))
     then raise exception 'Percentage must round down to confirmed achievable pounds'; end if;
 end loop;
 perform private.mark_workout_pounds(result);
 update public.generated_prescriptions set final_prescription=(select jsonb_agg(q.x||jsonb_build_object('loadUnit','lb') order by q.n)
   from jsonb_array_elements(final_prescription) with ordinality q(x,n)) where id=p.id;
 return result;
end $$;

create function public.create_workout_assignment_lb(client_user_id uuid,workout_title text,workout_instructions text,workout_scheduled_date date,exercises jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 result:=public.create_workout_assignment(client_user_id,workout_title,workout_instructions,workout_scheduled_date,exercises);
 perform private.mark_workout_pounds(result);
 return result;
end $$;

-- Preserve the old guarded set-recording transaction, then correct comparison
-- using explicit units. Unknown historical targets never imply a weight record.
create function public.record_coach_workout_set_lb(target_set_id uuid,result text,performed_reps integer,performed_load numeric,reason public.set_failure_reason,notes text)
returns text language plpgsql security definer set search_path='' as $$
declare recorded text; target public.workout_sets%rowtype; target_lb numeric;
begin
 recorded:=public.record_coach_workout_set(target_set_id,result,performed_reps,performed_load,reason,notes);
 select * into strict target from public.workout_sets where id=target_set_id;
 target_lb:=case target.prescribed_load_unit when 'kg' then target.prescribed_load*2.20462262185 when 'lb' then target.prescribed_load else null end;
 recorded:=case when result='complete' and (performed_reps>target.prescribed_reps or performed_load>target_lb) then 'exceeded' else result end;
 update public.workout_sets set actual_load_unit='lb',execution_result=recorded where id=target_set_id;
 return recorded;
end $$;

revoke all on function private.weight_capabilities(uuid),private.assert_pound_load(uuid,text[],numeric),private.mark_workout_pounds(uuid) from public,anon,authenticated;
revoke all on function public.save_gym_resource_lb(uuid,text,text,text,integer,numeric,text,boolean,text,numeric,numeric,numeric[],boolean),
 public.get_pound_generation_input(uuid),public.complete_pound_prescription(uuid,text,jsonb,jsonb),
 public.approve_pound_prescription(uuid,text,text,date,smallint,jsonb),public.create_workout_assignment_lb(uuid,text,text,date,jsonb),
 public.record_coach_workout_set_lb(uuid,text,integer,numeric,public.set_failure_reason,text) from public,anon,authenticated;
grant execute on function public.save_gym_resource_lb(uuid,text,text,text,integer,numeric,text,boolean,text,numeric,numeric,numeric[],boolean),
 public.get_pound_generation_input(uuid),public.complete_pound_prescription(uuid,text,jsonb,jsonb),
 public.approve_pound_prescription(uuid,text,text,date,smallint,jsonb),public.create_workout_assignment_lb(uuid,text,text,date,jsonb),
 public.record_coach_workout_set_lb(uuid,text,integer,numeric,public.set_failure_reason,text) to authenticated;
