-- Additive, derived learning. No raw results, intakes or assigned plans rewritten.
create function private.bayesian_training_context(org uuid,client uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 with blocks as (
 select e.library_exercise_id exercise_id,l.name,
 coalesce(e.prescription_details->>'format','straight') format,e.reps,
 coalesce(e.prescription_details->>'measurement','reps') measurement,e.prescription_details->>'workSeconds' work_seconds,e.prescription_details->>'distance' distance,e.prescription_details->>'distanceUnit' distance_unit,e.load_prescription->>'semantics' semantics,
 case e.load_unit when 'lb' then e.load when 'kg' then e.load*2.20462262185 end load_lb,
 avg(case when s.pain_reported or s.failure_reason='pain_discomfort' then 0 when s.client_result='complete' or (s.client_result is null and s.execution_result in ('complete','exceeded')) then 1.0
 when s.client_result='modified' then 0.5 else 0 end) execution,
 bool_or(coalesce(s.pain_reported,false) or coalesce(s.failure_reason='pain_discomfort',false)) pain,max(s.completed_at) at
 from public.workout_assignments w join public.workout_exercises e on e.workout_assignment_id=w.id
 join public.exercise_library l on l.id=e.library_exercise_id join public.workout_sets s on s.workout_exercise_id=e.id
 where w.organization_id=org and w.client_user_id=client and w.status in ('in_progress','completed')
 and w.created_at>now()-interval '90 days' and e.library_exercise_id is not null
 and (s.performed_library_exercise_id is null or s.performed_library_exercise_id=e.library_exercise_id)
 group by e.id,e.library_exercise_id,l.name,e.prescription_details,e.load_prescription,e.reps,e.load_unit,e.load
 having count(*)=e.sets and count(s.completed_at)=e.sets
 ), posterior as (
 select exercise_id,name,format,reps,measurement,work_seconds,distance,distance_unit,semantics,load_lb,count(*) n,1+sum(execution) a,1+sum(1-execution) b,bool_or(pain) pain,max(at) last_at
 from blocks group by exercise_id,name,format,reps,measurement,work_seconds,distance,distance_unit,semantics,load_lb
 ) select jsonb_build_object('version','beta-block-v1','prior',jsonb_build_object('alpha',1,'beta',1),'exercises',coalesce(jsonb_agg(jsonb_build_object(
 'exerciseId',exercise_id,'name',name,'format',format,'reps',reps,'measurement',measurement,'workSeconds',work_seconds,'distance',distance,'distanceUnit',distance_unit,'semantics',semantics,'loadLb',load_lb,'lastAt',last_at,'blocks',n,'alpha',a,'beta',b,'mean',a/(a+b),'variance',a*b/((a+b)^2*(a+b+1)),'pain',pain)
 order by exercise_id,format,reps,load_lb,measurement,work_seconds,distance,distance_unit,semantics),'[]')) from posterior;
$$;
revoke all on function private.bayesian_training_context(uuid,uuid) from public,anon,authenticated;

create function public.get_bayesian_training_context(target_client_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare org uuid;
begin
 select organization_id into org from private.request_memberships where user_id=(select auth.uid()) and status='active' limit 1;
 if org is null or not private.can_read_client_domain(org,target_client_user_id) then raise exception 'Training learning access denied' using errcode='42501'; end if;
 return private.bayesian_training_context(org,target_client_user_id);
end $$;
revoke all on function public.get_bayesian_training_context(uuid) from public,anon,authenticated;
grant execute on function public.get_bayesian_training_context(uuid) to authenticated;

create function public.configure_workout_generation(target_prescription_id uuid,request jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare p public.generated_prescriptions%rowtype; v text;
begin
 select * into strict p from public.generated_prescriptions where id=target_prescription_id for update;
 if p.coach_user_id is distinct from (select auth.uid()) or p.status<>'draft' or not private.can_manage_client_domain(p.organization_id,p.client_user_id) then raise exception 'Trainer draft access required' using errcode='42501'; end if;
 if jsonb_typeof(request->'sections') is distinct from 'array' or jsonb_array_length(request->'sections') not between 1 and 12
 or jsonb_typeof(request->'duration') is distinct from 'number' or (request->>'duration')::numeric<>trunc((request->>'duration')::numeric) or (request->>'duration')::integer not between 20 and 180 then raise exception 'Choose focus and 20-180 minutes'; end if;
 for v in select jsonb_array_elements_text(request->'sections') loop
 if v not in ('strength','legs','arms','back','shoulders','lower_body','upper_body','full_body','abs','cardio','finisher','stretching') then raise exception 'Unknown workout focus'; end if;
 end loop;
 if request->>'scheduledDate' is not null then perform (request->>'scheduledDate')::date; end if;
 update public.generated_prescriptions set generation_context=generation_context||jsonb_build_object('sessionRequest',jsonb_build_object(
 'sections',request->'sections','duration',(request->>'duration')::integer,'scheduledDate',request->>'scheduledDate')) where id=p.id;
end $$;
revoke all on function public.configure_workout_generation(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.configure_workout_generation(uuid,jsonb) to authenticated;

-- Modify the earliest projection, so every existing optimistic snapshot and
-- downstream quality validator incorporates the request and learning state.
alter function public.get_prescription_generation_input(uuid) rename to get_generation_input_before_learning;
revoke all on function public.get_generation_input_before_learning(uuid) from public,anon,authenticated;
create function public.get_prescription_generation_input(target_prescription_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare input jsonb;p public.generated_prescriptions%rowtype;request jsonb;
begin
 input:=public.get_generation_input_before_learning(target_prescription_id);
 select * into strict p from public.generated_prescriptions where id=target_prescription_id;
 request:=p.generation_context->'sessionRequest';
 input:=(input-'snapshot')||jsonb_build_object('bayesianTraining',private.bayesian_training_context(p.organization_id,p.client_user_id),'sessionRequest',request);
 if jsonb_typeof(request)='object' then input:=input||jsonb_build_object('duration',(request->>'duration')::integer); end if;
 return input||jsonb_build_object('snapshot',md5(input::text));
end $$;
revoke all on function public.get_prescription_generation_input(uuid) from public,anon,authenticated;
grant execute on function public.get_prescription_generation_input(uuid) to authenticated;

-- Bayesian uncertainty can hold a proposed increase; it never authorizes a
-- larger load, clears pain, or bypasses the established equipment/load engine.
alter function private.resolve_starting_load(uuid,jsonb) rename to resolve_load_before_learning;
create function private.resolve_starting_load(prescription uuid,row_data jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;p public.generated_prescriptions%rowtype;row jsonb;selected jsonb;prior_load numeric;
begin
 result:=private.resolve_load_before_learning(prescription,row_data);
 select * into strict p from public.generated_prescriptions where id=prescription;
 for row in select value from jsonb_array_elements(private.bayesian_training_context(p.organization_id,p.client_user_id)->'exercises') loop
 if row->>'exerciseId'=row_data->>'libraryExerciseId' and row->>'format'=coalesce(row_data->'protocol'->>'format','straight')
 and row->>'measurement'=coalesce(row_data->'protocol'->>'measurement','reps')
 and (case row->>'measurement' when 'time' then row->>'workSeconds' is not distinct from row_data->'protocol'->>'workSeconds' when 'distance' then row->>'distance' is not distinct from row_data->'protocol'->>'distance' and row->>'distanceUnit' is not distinct from row_data->'protocol'->>'distanceUnit' else abs((row->>'reps')::integer-(row_data->>'reps')::integer)<=2 end)
 and (row->>'semantics' is null or row->>'semantics'=result->'loadPrescription'->>'semantics') and row->>'loadLb' is not null
 and (selected is null or (row->>'lastAt')::timestamptz>(selected->>'lastAt')::timestamptz) then selected:=row; end if;
 end loop;
 if selected is not null then
 prior_load:=(selected->>'loadLb')::numeric;
 if (result->'load')<>'null'::jsonb and (result->>'load')::numeric>prior_load
 and ((selected->>'blocks')::integer<3 or (selected->>'mean')::numeric<0.8 or (selected->>'pain')::boolean) then
 select max(v) into prior_load from public.exercise_library e cross join lateral unnest(private.confirmed_loads(p.organization_id,e.equipment_requirements,result->'loadPrescription'->>'semantics')) v where e.id=(row_data->>'libraryExerciseId')::uuid and v<=prior_load;
 result:=jsonb_set(result,'{load}',coalesce(to_jsonb(prior_load),'null'::jsonb));
 result:=jsonb_set(result,'{loadPrescription,calibrationRequired}',to_jsonb(prior_load is null));
 result:=jsonb_set(result,'{loadPrescription,load}',coalesce(to_jsonb(prior_load),'null'::jsonb));
 result:=jsonb_set(result,'{loadPrescription,explanation}',to_jsonb('Hold the previous prescribed dose while comparable completion evidence builds. Coach review and current readiness checks still apply.'::text));
 end if;
 result:=jsonb_set(result,'{loadPrescription,bayesian}',selected);
 end if;
 return result;
end $$;
revoke all on function private.resolve_load_before_learning(uuid,jsonb),private.resolve_starting_load(uuid,jsonb) from public,anon,authenticated;

-- Preserve current generation/approval guards; record evidence on legacy intakes
-- too. This does not grant new browser writes or publish a draft to the Client.
alter function public.complete_pound_prescription(uuid,text,jsonb,jsonb) rename to complete_pound_before_learning;
revoke all on function public.complete_pound_before_learning(uuid,text,jsonb,jsonb) from public,anon,authenticated;
create function public.complete_pound_prescription(target_prescription_id uuid,expected_snapshot text,proposed_workout jsonb,generation_details jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare input jsonb;
begin
 input:=public.get_pound_generation_input(target_prescription_id);
 perform public.complete_pound_before_learning(target_prescription_id,expected_snapshot,proposed_workout,generation_details);
 update public.generated_prescriptions set generation_context=generation_context||jsonb_build_object(
 'bayesianTraining',input->'bayesianTraining','sessionRequest',input->'sessionRequest','evidence',coalesce(generation_details->'evidence',generation_context->'evidence'),
 'liveWebResearch',case when generation_details->'evidence' is not null then not coalesce((generation_details->'evidence'->>'cacheHit')::boolean,false) else false end)
 where id=target_prescription_id;
end $$;
revoke all on function public.complete_pound_prescription(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.complete_pound_prescription(uuid,text,jsonb,jsonb) to authenticated;

notify pgrst, 'reload schema';
