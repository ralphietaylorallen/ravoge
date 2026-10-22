-- Correct only private history interpretation. Never invent repetitions for
-- distance/time sets or rewrite the immutable raw workout_sets records.
-- The preceding migration is already applied and deliberately left untouched.
do $migration$
declare definition text; old_fragment text; new_fragment text;
begin
  definition:=pg_get_functiondef('private.calculate_starting_load(jsonb,numeric,numeric[],jsonb,integer,numeric)'::regprocedure);
  if position('(v->>''reps'')::integer' in definition)=0 or position('(v->>''prescribedReps'')::integer' in definition)=0 then
    raise exception 'Unexpected load kernel definition; measured-history correction aborted';
  end if;
  definition:=replace(definition,'(v->>''reps'')::integer','coalesce((v->>''actualTarget'')::numeric,(v->>''reps'')::numeric)');
  definition:=replace(definition,'(v->>''prescribedReps'')::integer','coalesce((v->>''prescribedTarget'')::numeric,(v->>''prescribedReps'')::numeric)');
  execute definition;

  definition:=pg_get_functiondef('private.resolve_starting_load(uuid,jsonb)'::regprocedure);
  old_fragment:=$old$'reps',s.actual_reps,'prescribedReps',s.prescribed_reps,$old$;
  new_fragment:=$new$'reps',s.actual_reps,'prescribedReps',s.prescribed_reps,
       'actualTarget',case ex.prescription_details->>'measurement'
         when 'time' then s.actual_work_seconds::numeric
         when 'distance' then s.actual_distance
         else s.actual_reps::numeric end,
       'prescribedTarget',case ex.prescription_details->>'measurement'
         when 'time' then (ex.prescription_details->>'workSeconds')::numeric
         when 'distance' then (ex.prescription_details->>'distance')::numeric
         else s.prescribed_reps::numeric end,$new$;
  if position(old_fragment in definition)=0 then raise exception 'Unexpected load history projection; correction aborted'; end if;
  definition:=replace(definition,old_fragment,new_fragment);
  -- A shorter carry or different unit is not comparable successful work.
  old_fragment:=$old$and abs(ex.reps-(row_data->>'reps')::integer)<=2$old$;
  new_fragment:=$new$and coalesce(ex.prescription_details->>'measurement','reps')=coalesce(row_data->'protocol'->>'measurement','reps')
     and case coalesce(row_data->'protocol'->>'measurement','reps')
       when 'time' then (ex.prescription_details->>'workSeconds')::numeric=(row_data->'protocol'->>'workSeconds')::numeric
       when 'distance' then (ex.prescription_details->>'distance')::numeric=(row_data->'protocol'->>'distance')::numeric
         and ex.prescription_details->>'distanceUnit'=row_data->'protocol'->>'distanceUnit'
       else abs(ex.reps-(row_data->>'reps')::integer)<=2 end$new$;
  if position(old_fragment in definition)=0 then raise exception 'Unexpected comparable-history predicate; correction aborted'; end if;
  definition:=replace(definition,old_fragment,new_fragment);
  execute definition;
end $migration$;

revoke all on function private.calculate_starting_load(jsonb,numeric,numeric[],jsonb,integer,numeric) from public,anon,authenticated;
revoke all on function private.resolve_starting_load(uuid,jsonb) from public,anon,authenticated;
