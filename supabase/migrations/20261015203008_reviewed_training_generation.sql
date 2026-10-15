-- Preserve raw imports; owner review creates a separate immutable revision.
alter table public.training_library_items add constraint training_library_items_id_org_key unique(id,organization_id);
create table public.training_library_reviews (
  id uuid primary key default gen_random_uuid(),
  training_item_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  revision integer not null check(revision>0),
  title text not null check(char_length(trim(title)) between 2 and 120),
  status public.training_library_status not null check(status in ('draft','review','published')),
  primary_goal text check(primary_goal in ('strength','muscle_gain','general_fitness','conditioning','fat_loss','athletic_performance')),
  duration_minutes integer check(duration_minutes between 20 and 180),
  exercises jsonb not null check(jsonb_typeof(exercises)='array'),
  review_notes text not null check(char_length(trim(review_notes)) between 2 and 2000),
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  unique(training_item_id,revision),
  check(status<>'published' or (primary_goal is not null and duration_minutes is not null)),
  foreign key(training_item_id,organization_id) references public.training_library_items(id,organization_id) on delete cascade
);
create index training_library_reviews_org_status_idx on public.training_library_reviews(organization_id,status);
create index training_library_reviews_reviewer_idx on public.training_library_reviews(reviewed_by);
alter table public.training_library_reviews enable row level security;
revoke all on public.training_library_reviews from public,anon,authenticated;
grant select on public.training_library_reviews to authenticated;
create policy reviewed_training_read on public.training_library_reviews for select to authenticated using (
  (select private.has_active_role(organization_id,array['owner']::public.organization_role[]))
  or (status='published' and (select private.has_active_role(organization_id,array['coach']::public.organization_role[])))
);

create table public.intake_generation_safety_reviews (
  intake_id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_user_id uuid not null references auth.users(id) on delete cascade,
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  foreign key(intake_id,organization_id,client_user_id) references public.client_intakes(id,organization_id,client_user_id) on delete cascade
);
create index intake_generation_safety_scope_idx on public.intake_generation_safety_reviews(organization_id,client_user_id);
create index intake_generation_safety_client_idx on public.intake_generation_safety_reviews(client_user_id);
create index intake_generation_safety_reviewer_idx on public.intake_generation_safety_reviews(reviewed_by);
alter table public.intake_generation_safety_reviews enable row level security;
revoke all on public.intake_generation_safety_reviews from public,anon,authenticated;
grant select on public.intake_generation_safety_reviews to authenticated;
create policy intake_generation_safety_read on public.intake_generation_safety_reviews for select to authenticated
using ((select private.can_read_client_domain(organization_id,client_user_id)));

alter table public.generated_prescriptions
  add column source_training_review_id uuid references public.training_library_reviews(id) on delete restrict,
  add column generation_context jsonb;
create index generated_prescriptions_training_review_idx on public.generated_prescriptions(source_training_review_id);

create function public.add_equipment_checklist(selected_types text[]) returns void
language plpgsql security definer set search_path='' as $$
declare org uuid; equipment text;
begin
  select m.organization_id into strict org from public.organization_memberships m
    where m.user_id=(select auth.uid()) and m.role='owner' and m.status='active';
  if not private.has_active_role(org,array['owner']::public.organization_role[]) or selected_types is null
    or not(selected_types <@ array['barbell','plates','squat_rack','bench','dumbbells','kettlebells','cable_machine','selectorized_machine','cardio_equipment','sled','bands','medicine_balls','specialty_equipment','other']::text[])
    or array_position(selected_types,null) is not null then raise exception 'Active Owner and valid equipment types required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(org::text||':equipment-checklist',0));
  foreach equipment in array selected_types loop
    if not exists(select 1 from public.organization_equipment q where q.organization_id=org and q.equipment_type=equipment) then
      insert into public.organization_equipment(organization_id,equipment_type,name,created_by)
      values(org,equipment,initcap(replace(equipment,'_',' ')),(select auth.uid()))
      on conflict do nothing;
    end if;
  end loop;
end $$;

create function private.preserve_training_source() returns trigger language plpgsql set search_path='' as $$
begin
  if (new.organization_id,new.normalized_content,new.source_type,new.source_filename,new.created_by) is distinct from
     (old.organization_id,old.normalized_content,old.source_type,old.source_filename,old.created_by) then
    raise exception 'Original imported source values are immutable';
  end if;
  return new;
end $$;
create trigger preserve_training_source before update on public.training_library_items for each row execute function private.preserve_training_source();
create function private.preserve_training_review() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Create a new review revision instead of rewriting history'; end $$;
create trigger preserve_training_review before update on public.training_library_reviews for each row execute function private.preserve_training_review();

-- Match only explicit fixed-set source values. Complex/incomplete source rows
-- cannot be promoted by bypassing the browser or fabricating a reviewed target.
create function private.training_source_is_fixed(content jsonb,proposed jsonb) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare fields jsonb; description text; line text; parts text[]; matched integer:=0; ex jsonb; lib_name text;
begin
  if jsonb_typeof(content->'cells') is distinct from 'array' or jsonb_typeof(proposed) is distinct from 'array' then return false; end if;
  select jsonb_object_agg(lower(trim(c->>'header')),trim(coalesce(c->>'raw',c->>'display',''))) into fields from jsonb_array_elements(content->'cells') c;
  description:=coalesce(fields->>'description','');
  if concat_ws(' ',description,fields->>'score type',fields->>'instructions') ~* '\m(emom|amrap|seconds?|minutes?|stations?|each|per[- ]side)\M|%|[0-9]\s*[-–]\s*[0-9]'
    or coalesce(fields->>'load','')<>'' or coalesce(fields->>'weight','')<>'' or coalesce(fields->>'instructions','')<>'' then return false; end if;
  if coalesce(fields->>'exercise',fields->>'exercise name','')<>'' then
    if jsonb_array_length(proposed)<>1 then return false; end if;
    ex:=proposed->0;
    select name into lib_name from public.exercise_library where id=(ex->>'libraryExerciseId')::uuid;
    return lower(lib_name)=lower(coalesce(fields->>'exercise',fields->>'exercise name'))
      and coalesce(fields->>'sets','') ~ '^[0-9]+$' and coalesce(fields->>'reps','') ~ '^[0-9]+$'
      and (fields->>'sets')::integer=(ex->>'sets')::integer and (fields->>'reps')::integer=(ex->>'reps')::integer
      and (ex->>'load') is null and (ex->>'restSeconds') is null and coalesce(ex->>'notes','')='';
  end if;
  for line in select trim(v) from regexp_split_to_table(replace(description,E'\\n',E'\n'),E'\n') v where trim(v)<>'' loop
    parts:=regexp_match(line,'^(?:[-•]\s*)?(.+?)\s+([0-9]+)\s*[x×]\s*([0-9]+)\s*$','i');
    if parts is null then return false; end if;
    ex:=proposed->matched;
    if ex is null then return false; end if;
    select name into lib_name from public.exercise_library where id=(ex->>'libraryExerciseId')::uuid;
    if lower(lib_name) is distinct from lower(trim(parts[1])) or (ex->>'sets')::integer<>parts[2]::integer
      or (ex->>'reps')::integer<>parts[3]::integer or (ex->>'load') is not null or (ex->>'restSeconds') is not null
      or coalesce(ex->>'notes','')<>'' then return false; end if;
    matched:=matched+1;
  end loop;
  return matched>0 and matched=jsonb_array_length(proposed);
end $$;

create function public.review_training_library_item(
  target_item_id uuid,review_title text,review_status public.training_library_status,
  goal text,duration_minutes integer,review_exercises jsonb,review_notes text
) returns uuid language plpgsql security definer set search_path='' as $$
declare item public.training_library_items%rowtype; ex jsonb; lib public.exercise_library%rowtype;
  normalized jsonb:='[]'; new_id uuid; next_revision integer;
begin
  select * into strict item from public.training_library_items where id=target_item_id for update;
  if (select auth.uid()) is null or not private.has_active_role(item.organization_id,array['owner']::public.organization_role[]) then raise exception 'Active Owner required'; end if;
  if review_status is null or review_status not in ('draft','review','published') or jsonb_typeof(review_exercises) is distinct from 'array'
    or jsonb_array_length(review_exercises)>30 then raise exception 'Invalid review'; end if;
  if review_status='published' and not coalesce(private.training_source_is_fixed(item.normalized_content,review_exercises),false) then
    raise exception 'Complex, incomplete or altered source prescriptions must remain in review';
  end if;
  if review_status<>'published' then normalized:=review_exercises;
  else
  for ex in select * from jsonb_array_elements(review_exercises) loop
    if jsonb_typeof(ex) is distinct from 'object' then raise exception 'Invalid exercise'; end if;
    select * into strict lib from public.exercise_library where id=(ex->>'libraryExerciseId')::uuid and is_active and (organization_id is null or organization_id=item.organization_id);
    if (ex->>'sets') is null or (ex->>'reps') is null or (ex->>'sets') !~ '^[0-9]+$' or (ex->>'reps') !~ '^[0-9]+$'
      or (ex->>'sets')::integer not between 1 and 100 or (ex->>'reps')::integer not between 1 and 1000
      or char_length(trim(coalesce(ex->>'sourceText',''))) not between 2 and 2000
      or (ex->>'load')::numeric<0 or (ex->>'load')::numeric>100000
      or (ex->>'load') in ('NaN','Infinity','-Infinity')
      or ((ex->>'restSeconds') is not null and (ex->>'restSeconds')::integer not between 10 and 1800)
      or char_length(coalesce(ex->>'notes',''))>1000 then raise exception 'Review sets, reps and source evidence'; end if;
    normalized:=normalized||jsonb_build_array(jsonb_build_object('libraryExerciseId',lib.id,'name',lib.name,'sourceText',ex->>'sourceText',
      'sets',(ex->>'sets')::integer,'reps',(ex->>'reps')::integer,'load',(ex->>'load')::numeric,
      'restSeconds',(ex->>'restSeconds')::integer,'notes',ex->>'notes','reason','Owner-reviewed gym programming'));
  end loop;
  end if;
  if review_status='published' and jsonb_array_length(normalized)=0 then raise exception 'A published workout requires reviewed exercises'; end if;
  select coalesce(max(r.revision),0)+1 into next_revision from public.training_library_reviews r where r.training_item_id=item.id;
  insert into public.training_library_reviews(training_item_id,organization_id,revision,title,status,primary_goal,duration_minutes,exercises,review_notes,reviewed_by)
  values(item.id,item.organization_id,next_revision,trim(review_title),review_status,goal,duration_minutes,normalized,trim(review_notes),(select auth.uid())) returning id into new_id;
  update public.training_library_items set status=review_status where id=item.id;
  return new_id;
end $$;

create function public.confirm_intake_generation_safety(target_intake_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare i public.client_intakes%rowtype;
begin
  select * into strict i from public.client_intakes where id=target_intake_id;
  if (select auth.uid()) is null or not private.can_manage_client_domain(i.organization_id,i.client_user_id) then raise exception 'Assigned Coach required'; end if;
  insert into public.intake_generation_safety_reviews(intake_id,organization_id,client_user_id,reviewed_by)
  values(i.id,i.organization_id,i.client_user_id,(select auth.uid())) on conflict(intake_id) do nothing;
end $$;

create function private.generation_goal_patterns(goal text) returns text[] language sql immutable set search_path='' as $$
 select case goal when 'strength' then array['squat','hinge','horizontal_push','horizontal_pull','carry']
 when 'muscle_gain' then array['squat','hinge','horizontal_push','vertical_pull','knee_flexion']
 when 'conditioning' then array['conditioning','squat','horizontal_pull','carry']
 when 'fat_loss' then array['conditioning','squat','hinge','carry']
 when 'athletic_performance' then array['squat','hinge','unilateral','carry','conditioning']
 else array['squat','hinge','horizontal_push','horizontal_pull','conditioning'] end;
$$;

create function private.generation_exercise_compatible(exercise_id uuid,target_intake_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.exercise_library e cross join public.client_intakes i
 where e.id=exercise_id and i.id=target_intake_id and e.is_active
 and (e.organization_id is null or e.organization_id=i.organization_id)
 and e.equipment_requirements <@ coalesce((select array_agg(distinct q.equipment_type) from public.organization_equipment q where q.organization_id=i.organization_id and q.is_available),'{}'::text[])
 and not(e.contraindication_tags && i.constraint_tags)
 and case e.difficulty when 'beginner' then 1 when 'intermediate' then 2 else 3 end <= case i.experience_level when 'beginner' then 1 when 'intermediate' then 2 else 3 end
 and not exists(select 1 from unnest(i.avoided_exercises||i.movements_to_avoid) a where trim(a)<>'' and (lower(e.name) like '%'||lower(trim(a))||'%' or lower(replace(e.movement_pattern,'_',' '))=lower(trim(a)))))
$$;

-- Both diagnostics and generation use this same source selection, avoiding
-- equipment-count heuristics or mismatched eligibility between UI and save.
create function private.workout_generation_context(org uuid,client_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare i public.client_intakes%rowtype; state public.client_states%rowtype; template public.training_library_reviews%rowtype;
  exercises jsonb:='[]'; missing text[]; patterns text[]; p text; n integer; e record; sets integer; reps integer; rest integer; reasons jsonb:='[]'; needs_review boolean;
begin
  select * into i from public.client_intakes where organization_id=org and client_user_id=client_id order by version desc limit 1;
  if not found then return jsonb_build_object('ready',false,'reasons',jsonb_build_array('Complete and save the Client intake and goals first.'),'compatibleExercises',0); end if;
  select * into state from public.client_states where intake_id=i.id;
  if not found then return jsonb_build_object('ready',false,'reasons',jsonb_build_array('The latest intake has no calculated state. Save the intake again.'),'compatibleExercises',0); end if;
  needs_review := not exists(select 1 from public.intake_generation_safety_reviews s where s.intake_id=i.id);
  if needs_review then reasons:=reasons||jsonb_build_array('Review the latest intake, injuries, pain, limitations and exercise exclusions, then confirm the safety review.'); end if;
  patterns:=private.generation_goal_patterns(i.primary_goal);
  select r.* into template from public.training_library_reviews r join public.training_library_items t on t.id=r.training_item_id
  where r.organization_id=org and r.status='published' and t.status='published'
    and r.revision=(select max(v.revision) from public.training_library_reviews v where v.training_item_id=t.id)
    and r.primary_goal=i.primary_goal and r.duration_minutes<=i.session_duration_minutes
    and jsonb_array_length(r.exercises)>=3
    and not exists(select 1 from jsonb_array_elements(r.exercises) x where not private.generation_exercise_compatible((x->>'libraryExerciseId')::uuid,i.id))
  order by (r.duration_minutes=i.session_duration_minutes) desc,r.reviewed_at desc limit 1;
  if found then exercises:=template.exercises;
  else
    for p,n in select value,ordinality::integer from unnest(patterns) with ordinality requested(value,ordinality) loop
      select l.*,r.id as review_id,x.value as approved into e from public.exercise_library l
      left join lateral (select rv.id,rv.exercises from public.training_library_reviews rv join public.training_library_items ti on ti.id=rv.training_item_id
        where rv.organization_id=org and rv.status='published' and ti.status='published' and rv.primary_goal=i.primary_goal
        and rv.duration_minutes<=i.session_duration_minutes
        and rv.revision=(select max(v.revision) from public.training_library_reviews v where v.training_item_id=rv.training_item_id)
        and exists(select 1 from jsonb_array_elements(rv.exercises) z where z->>'libraryExerciseId'=l.id::text)
        order by rv.reviewed_at desc limit 1) r on true
      left join lateral (select z.value from jsonb_array_elements(r.exercises) z(value) where z.value->>'libraryExerciseId'=l.id::text limit 1) x on true
      where l.movement_pattern=p and private.generation_exercise_compatible(l.id,i.id)
      order by (r.id is not null) desc,(l.primary_quality=i.primary_goal) desc,(l.organization_id is not null) desc,l.name limit 1;
      if found then
        sets:=case when i.primary_goal='strength' then case when n=1 then 4 else 3 end when i.primary_goal='muscle_gain' then 3 when p='conditioning' then 6 else 3 end;
        reps:=case when i.primary_goal='strength' then case when n=1 then 6 else 8 end when i.primary_goal='muscle_gain' then 10 when p='conditioning' then 1 else 8 end;
        rest:=case when i.primary_goal='strength' then case when n=1 then 150 else 90 end when i.primary_goal='muscle_gain' then 75 when p='conditioning' then 60 else 75 end;
        if state.recovery_capacity<0.45 or state.current_readiness<0.45 then sets:=greatest(2,sets-1); end if;
        exercises:=exercises||jsonb_build_array(case when e.approved is not null then e.approved||jsonb_build_object('sourceReviewId',e.review_id)
          else jsonb_build_object('libraryExerciseId',e.id,'name',e.name,'sets',sets,'reps',reps,'load',null,'restSeconds',rest,
          'notes',case when p='conditioning' then 'Use controlled, repeatable intervals.' else 'Begin conservatively and preserve clean technique.' end,
          'reason',format('Global safe library: %s pattern, filtered for current intake and available equipment.',replace(p,'_',' '))) end);
      end if;
    end loop;
  end if;
  select coalesce(array_agg(distinct req),'{}') into missing from public.exercise_library l cross join lateral unnest(l.equipment_requirements) req
  where l.is_active and (l.organization_id is null or l.organization_id=org) and l.movement_pattern=any(patterns)
    and not exists(select 1 from public.organization_equipment q where q.organization_id=org and q.is_available and q.equipment_type=req);
  if jsonb_array_length(exercises)<3 then reasons:=reasons||jsonb_build_array(format('Only %s safe compatible movement blocks match the latest intake, goal, experience, restrictions and equipment; at least 3 are required. Review equipment and intake restrictions.',jsonb_array_length(exercises))); end if;
  return jsonb_build_object('ready',jsonb_array_length(exercises)>=3 and not needs_review,'intakeId',i.id,'stateId',state.id,
    'primaryGoal',i.primary_goal,'desiredDuration',i.session_duration_minutes,'needsSafetyReview',needs_review,
    'compatibleExercises',jsonb_array_length(exercises),'missingEquipment',missing,'reasons',reasons,'exercises',exercises,
    'sourceType',case when template.id is not null then 'organization_workout' when exists(select 1 from jsonb_array_elements(exercises) x where x->>'sourceReviewId' is not null) then 'organization_exercises_with_fallback' else 'global_library' end,
    'sourceReviewId',template.id,'sourceTitle',template.title,'sourceRevision',template.revision);
end $$;

create function public.get_workout_generation_readiness(target_client_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare org uuid;
begin
  select m.organization_id into strict org from public.organization_memberships m
    where m.user_id=(select auth.uid()) and m.status='active' and m.role in ('owner','coach');
  if not private.has_active_role(org,array['owner']::public.organization_role[]) and not private.can_manage_client_domain(org,target_client_user_id) then raise exception 'Client access denied'; end if;
  if not exists(select 1 from public.organization_memberships m where m.organization_id=org and m.user_id=target_client_user_id and m.role='client' and m.status='active') then raise exception 'Active Client required'; end if;
  return private.workout_generation_context(org,target_client_user_id);
end $$;

create or replace function public.generate_initial_prescription_v0(target_client_user_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid; ctx jsonb; i public.client_intakes%rowtype; state public.client_states%rowtype; id uuid;
begin
  select m.organization_id into strict org from public.organization_memberships m where m.user_id=(select auth.uid()) and m.role='coach' and m.status='active';
  if not private.can_manage_client_domain(org,target_client_user_id) then raise exception 'Client is not assigned to this Coach'; end if;
  ctx:=private.workout_generation_context(org,target_client_user_id);
  if not coalesce((ctx->>'ready')::boolean,false) then raise exception '%',ctx->'reasons'; end if;
  select * into strict i from public.client_intakes where public.client_intakes.id=(ctx->>'intakeId')::uuid;
  select * into strict state from public.client_states where public.client_states.id=(ctx->>'stateId')::uuid;
  insert into public.generated_prescriptions(organization_id,coach_user_id,client_user_id,intake_id,state_id,engine_version,title,objective,estimated_duration_minutes,volume_intent,rationale,original_recommendation,final_prescription,source_training_review_id,generation_context)
  values(org,(select auth.uid()),target_client_user_id,i.id,state.id,'prescription-v0.2',coalesce(ctx->>'sourceTitle','Foundation '||initcap(replace(i.primary_goal,'_',' '))),
    format('Coach-reviewed %s programming using the latest intake and actual equipment.',replace(i.primary_goal,'_',' ')),
    coalesce((select r.duration_minutes from public.training_library_reviews r where r.id=(ctx->>'sourceReviewId')::uuid),i.session_duration_minutes),
    case when state.volume_tolerance<0.45 or state.recovery_capacity<0.45 then 'conservative' when state.volume_tolerance>=0.72 and state.recovery_capacity>=0.62 then 'progressive' else 'moderate' end,
    format('Source: %s. Intake version %s; %s goal; %s experience; %s-minute target. Equipment and restrictions filtered. Coach approval required.',ctx->>'sourceType',i.version,replace(i.primary_goal,'_',' '),i.experience_level,i.session_duration_minutes),
    ctx->'exercises',ctx->'exercises',(ctx->>'sourceReviewId')::uuid,ctx||jsonb_build_object('safetyReviewed',true,'generatedBy',(select auth.uid()),'generatedAt',now())) returning public.generated_prescriptions.id into id;
  return id;
end $$;

-- Approval rechecks current intake restrictions and equipment even if a draft was
-- generated earlier. Direct completion does not bypass these checks.
create function private.validate_generated_exercise_safety() returns trigger
language plpgsql security definer set search_path='' as $$
declare w public.workout_assignments%rowtype; latest uuid;
begin
  if tg_op='UPDATE' and (new.library_exercise_id,new.sets,new.reps,new.load,new.rest_seconds) is not distinct from
    (old.library_exercise_id,old.sets,old.reps,old.load,old.rest_seconds) then return new; end if;
  select * into strict w from public.workout_assignments where id=new.workout_assignment_id;
  if w.source_prescription_id is not null then
    select id into strict latest from public.client_intakes where organization_id=w.organization_id and client_user_id=w.client_user_id order by version desc limit 1;
    if new.library_exercise_id is null or not private.generation_exercise_compatible(new.library_exercise_id,latest)
      or not exists(select 1 from public.intake_generation_safety_reviews r where r.intake_id=latest) then
      raise exception 'Review latest intake safety, equipment and exercise compatibility before assignment';
    end if;
  end if;
  return new;
end $$;
create trigger validate_generated_exercise_safety before insert or update on public.workout_exercises
for each row execute function private.validate_generated_exercise_safety();

revoke all on function public.review_training_library_item(uuid,text,public.training_library_status,text,integer,jsonb,text),public.confirm_intake_generation_safety(uuid),public.get_workout_generation_readiness(uuid),public.add_equipment_checklist(text[]) from public,anon,authenticated;
grant execute on function public.review_training_library_item(uuid,text,public.training_library_status,text,integer,jsonb,text),public.confirm_intake_generation_safety(uuid),public.get_workout_generation_readiness(uuid),public.add_equipment_checklist(text[]) to authenticated;
revoke all on function private.preserve_training_source(),private.preserve_training_review(),private.training_source_is_fixed(jsonb,jsonb),private.generation_goal_patterns(text),private.generation_exercise_compatible(uuid,uuid),private.workout_generation_context(uuid,uuid),private.validate_generated_exercise_safety() from public,anon,authenticated;
