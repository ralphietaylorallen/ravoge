-- Additive inventory/facility and approved-library metadata. No gym inventory
-- is guessed, no source import is changed and no draft is published.
alter table public.organization_equipment drop constraint organization_equipment_equipment_type_check;
alter table public.organization_equipment add constraint organization_equipment_equipment_type_check check(equipment_type in (
 'barbell','plates','squat_rack','bench','dumbbells','kettlebells','cable_machine','selectorized_machine',
 'cardio_equipment','sled','bands','medicine_balls','specialty_equipment','other','ski_erg','rower','bike'));

create table public.organization_facilities (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 feature_type text not null check(feature_type in ('turf','open_training_area')),
 name text not null check(char_length(trim(name)) between 2 and 120),
 usable_length numeric check(usable_length > 0 and usable_length <= 1000),
 length_unit text not null default 'yards' check(length_unit in ('yards','meters')),
 is_available boolean not null default true,
 notes text check(char_length(notes)<=1000),
 created_by uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(),
 unique(organization_id,name)
);
create index organization_facilities_creator_idx on public.organization_facilities(created_by);
alter table public.organization_facilities enable row level security;
revoke all on public.organization_facilities from public,anon,authenticated;
grant select on public.organization_facilities to authenticated;
create policy facilities_staff_read on public.organization_facilities for select to authenticated using (
 (select private.has_active_role(organization_id,array['owner','coach']::public.organization_role[])));

create function public.save_gym_resource(target_id uuid, resource_kind text, resource_type text,
 resource_name text, resource_quantity integer, resource_length numeric, resource_unit text,
 available boolean, resource_notes text) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid; result uuid;
begin
 select organization_id into strict org from public.organization_memberships
 where user_id=(select auth.uid()) and status='active' and role='owner';
 if (select auth.uid()) is null or not private.has_active_role(org,array['owner']::public.organization_role[])
   or available is null or char_length(trim(resource_name)) not between 2 and 120
   or char_length(coalesce(resource_notes,''))>1000 then raise exception 'Active Owner and valid resource required'; end if;
 -- Serialize equivalent names; never merge/delete a historical row automatically.
 perform pg_advisory_xact_lock(hashtextextended(org::text||':resource:'||lower(regexp_replace(trim(resource_name),'\s+',' ','g')),0));
 if resource_kind='equipment' then
   if target_id is null then
     if exists(select 1 from public.organization_equipment q where q.organization_id=org and q.equipment_type=resource_type
       and regexp_replace(lower(q.name),'[^a-z0-9]+','','g')=regexp_replace(lower(resource_name),'[^a-z0-9]+','','g')) then raise exception 'Potential duplicate: edit the existing inventory record instead'; end if;
     insert into public.organization_equipment(organization_id,equipment_type,name,quantity,is_available,notes,created_by)
     values(org,resource_type,trim(resource_name),resource_quantity,available,resource_notes,(select auth.uid())) returning id into result;
   else
     update public.organization_equipment set equipment_type=resource_type,name=trim(resource_name),quantity=resource_quantity,
       is_available=available,notes=resource_notes where id=target_id and organization_id=org returning id into result;
   end if;
 elsif resource_kind='facility' then
   if target_id is null then
     if exists(select 1 from public.organization_facilities f where f.organization_id=org and f.feature_type=resource_type
       and regexp_replace(lower(f.name),'[^a-z0-9]+','','g')=regexp_replace(lower(resource_name),'[^a-z0-9]+','','g')) then raise exception 'Potential duplicate: edit the existing facility instead'; end if;
     insert into public.organization_facilities(organization_id,feature_type,name,usable_length,length_unit,is_available,notes,created_by)
     values(org,resource_type,trim(resource_name),resource_length,resource_unit,available,resource_notes,(select auth.uid())) returning id into result;
   else
     update public.organization_facilities set feature_type=resource_type,name=trim(resource_name),usable_length=resource_length,
       length_unit=resource_unit,is_available=available,notes=resource_notes where id=target_id and organization_id=org returning id into result;
   end if;
 else raise exception 'Unknown resource kind'; end if;
 if result is null then raise exception 'Resource unavailable in this gym'; end if;
 return result;
end $$;
revoke all on function public.save_gym_resource(uuid,text,text,text,integer,numeric,text,boolean,text) from public,anon,authenticated;
grant execute on function public.save_gym_resource(uuid,text,text,text,integer,numeric,text,boolean,text) to authenticated;

create function private.available_training_resources(org uuid) returns text[] language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(distinct resource),'{}') from (
   select equipment_type as resource from public.organization_equipment where organization_id=org and is_available
   union select feature_type from public.organization_facilities where organization_id=org and is_available and usable_length>0
 ) q
$$;
revoke all on function private.available_training_resources(uuid) from public,anon,authenticated;

alter table public.exercise_library
 add column primary_muscles text[] not null default '{}',
 add column secondary_muscles text[] not null default '{}',
 add column purposes text[] not null default '{}',
 add column laterality text not null default 'bilateral' check(laterality in ('bilateral','unilateral','alternating')),
 add column measurement text not null default 'reps' check(measurement in ('reps','time','distance')),
 add column regression_slug text,
 add column progression_slug text,
 add column coach_cue text check(char_length(coach_cue)<=500),
 add column demonstration_url text check(demonstration_url is null or demonstration_url ~ '^https://');

-- Curated movements, not names automatically extracted from imported records.
insert into public.exercise_library(slug,name,movement_pattern,primary_quality,difficulty,equipment_requirements,contraindication_tags,
 substitution_slugs,default_rep_min,default_rep_max,default_set_min,default_set_max,measurement,laterality,coach_cue) values
 ('box-squat','Box Squat','squat','general_fitness','beginner',array['bench'],array['knee_flexion'],array['goblet-squat'],6,12,2,3,'reps','bilateral','Sit back under control; stand without rocking.'),
 ('bodyweight-squat','Bodyweight Squat','squat','general_fitness','beginner','{}',array['knee_flexion'],array['box-squat'],6,15,2,3,'reps','bilateral','Use a comfortable depth and keep feet grounded.'),
 ('front-squat','Front Squat','squat','strength','intermediate',array['barbell','plates','squat_rack'],array['knee_flexion','axial_load'],array['goblet-squat'],4,8,2,4,'reps','bilateral','Keep elbows high and brace before each repetition.'),
 ('kettlebell-deadlift','Kettlebell Deadlift','hinge','general_fitness','beginner',array['kettlebells'],array['hinge'],array['glute-bridge'],6,12,2,3,'reps','bilateral','Push hips back; stand tall without leaning back.'),
 ('glute-bridge','Glute Bridge','hinge','general_fitness','beginner','{}',array['hinge'],array['kettlebell-deadlift'],8,15,2,3,'reps','bilateral','Drive through heels and stop before arching your back.'),
 ('hip-thrust','Hip Thrust','hinge','muscle_gain','intermediate',array['bench','barbell','plates'],array['hinge','axial_load'],array['glute-bridge'],8,12,2,4,'reps','bilateral','Keep ribs down and finish with level hips.'),
 ('incline-push-up','Incline Push-up','horizontal_push','general_fitness','beginner',array['bench'],array['horizontal_push','wrist_load'],array['dumbbell-bench-press'],6,15,2,3,'reps','bilateral','Maintain a straight body and lower with control.'),
 ('push-up','Push-up','horizontal_push','strength','intermediate','{}',array['horizontal_push','wrist_load'],array['incline-push-up'],6,15,2,4,'reps','bilateral','Brace your trunk; keep elbows comfortably angled.'),
 ('incline-dumbbell-press','Incline Dumbbell Press','horizontal_push','muscle_gain','intermediate',array['dumbbells','bench'],array['horizontal_push','overhead'],array['dumbbell-bench-press'],8,12,2,4,'reps','bilateral','Press smoothly without shrugging.'),
 ('dumbbell-shoulder-press','Dumbbell Shoulder Press','vertical_push','muscle_gain','intermediate',array['dumbbells'],array['overhead','axial_load'],array['dumbbell-bench-press'],6,12,2,4,'reps','bilateral','Keep ribs stacked; use a pain-free range.'),
 ('one-arm-dumbbell-row','One-arm Dumbbell Row','horizontal_pull','muscle_gain','beginner',array['dumbbells','bench'],array['hinge'],array['band-row'],8,15,2,4,'reps','unilateral','Support your body and pull your elbow toward your hip.'),
 ('chest-supported-row','Chest-supported Dumbbell Row','horizontal_pull','muscle_gain','beginner',array['dumbbells','bench'],'{}',array['band-row'],8,15,2,4,'reps','bilateral','Keep chest supported and pause without shrugging.'),
 ('band-pulldown','Band Pulldown','vertical_pull','general_fitness','beginner',array['bands'],array['overhead'],array['band-row'],10,15,2,3,'reps','bilateral','Use a secure anchor and pull elbows down gently.'),
 ('reverse-lunge','Reverse Lunge','unilateral','athletic_performance','intermediate','{}',array['knee_flexion','balance'],array['split-squat'],6,12,2,3,'reps','unilateral','Step back with control; keep the front foot grounded.'),
 ('step-up','Step-up','unilateral','general_fitness','beginner',array['bench'],array['knee_flexion','balance'],array['split-squat'],6,12,2,3,'reps','unilateral','Use a stable low step and control the descent.'),
 ('lateral-lunge','Lateral Lunge','unilateral','athletic_performance','intermediate','{}',array['knee_flexion','balance','lateral'],array['split-squat'],6,10,2,3,'reps','unilateral','Sit into the working hip without forcing depth.'),
 ('single-leg-rdl','Single-leg Dumbbell RDL','hinge','athletic_performance','intermediate',array['dumbbells'],array['hinge','balance'],array['dumbbell-rdl'],6,10,2,3,'reps','unilateral','Keep hips level and use support if needed.'),
 ('suitcase-carry','Suitcase Carry','carry','athletic_performance','beginner',array['dumbbells'],array['balance','axial_load'],array['farmer-carry'],1,1,2,3,'distance','unilateral','Walk tall without leaning toward the weight.'),
 ('turf-walk','Turf Walk','conditioning','general_fitness','beginner',array['turf'],array['balance','conditioning'],array['bike-conditioning'],1,1,2,4,'distance','bilateral','Walk at a conversational pace within the clear turf lane.'),
 ('turf-shuttle','Turf Shuttle','conditioning','athletic_performance','intermediate',array['turf'],array['impact','knee_flexion','balance','conditioning'],array['turf-walk'],1,1,2,4,'distance','bilateral','Decelerate under control before each turn.'),
 ('sled-push','Sled Push','conditioning','athletic_performance','intermediate',array['sled','turf'],array['knee_flexion','axial_load','conditioning'],array['turf-walk'],1,1,2,4,'distance','bilateral','Use small steady steps; Coach chooses a controllable load.'),
 ('sled-drag','Backward Sled Drag','conditioning','athletic_performance','intermediate',array['sled','turf'],array['knee_flexion','balance','conditioning'],array['turf-walk'],1,1,2,4,'distance','bilateral','Keep the lane clear and take controlled backward steps.'),
 ('ski-erg-interval','SkiErg Interval','conditioning','conditioning','beginner',array['ski_erg'],array['overhead','hinge','conditioning'],array['bike-conditioning'],1,1,2,4,'time','bilateral','Use controlled strokes and leave effort in reserve.'),
 ('rower-interval','Rower Interval','conditioning','conditioning','beginner',array['rower'],array['hinge','knee_flexion','conditioning'],array['bike-conditioning'],1,1,2,4,'time','bilateral','Drive with the legs; recover smoothly without rushing.'),
 ('dead-bug','Dead Bug','carry','general_fitness','beginner','{}',array['supine'],array['bird-dog'],6,10,2,3,'reps','alternating','Exhale gently and keep the lower back comfortable.'),
 ('bird-dog','Bird Dog','carry','general_fitness','beginner','{}',array['wrist_load','kneeling'],array['dead-bug'],6,10,2,3,'reps','alternating','Reach opposite arm and leg without twisting.'),
 ('side-plank','Side Plank','carry','general_fitness','intermediate','{}',array['horizontal_push','lateral'],array['dead-bug'],1,1,2,3,'time','unilateral','Stack shoulders and hips; stop if alignment breaks.'),
 ('front-plank','Front Plank','carry','general_fitness','beginner','{}',array['horizontal_push'],array['dead-bug'],1,1,2,3,'time','bilateral','Brace gently and breathe; do not hold your breath.'),
 ('band-pull-apart','Band Pull-apart','horizontal_pull','general_fitness','beginner',array['bands'],'{}',array['band-row'],10,15,1,3,'reps','bilateral','Keep ribs down and use light band tension.'),
 ('wall-slide','Wall Slide','vertical_push','general_fitness','beginner','{}',array['overhead'],array['band-pull-apart'],6,10,1,2,'reps','bilateral','Slide within a comfortable range without forcing overhead reach.'),
 ('calf-raise','Standing Calf Raise','unilateral','muscle_gain','beginner','{}',array['balance'],array['turf-walk'],8,15,2,3,'reps','bilateral','Rise and lower slowly using stable support.'),
 ('dumbbell-curl','Dumbbell Curl','horizontal_pull','muscle_gain','beginner',array['dumbbells'],'{}',array['band-row'],8,15,2,3,'reps','bilateral','Keep elbows steady and avoid swinging.'),
 ('cable-triceps-pressdown','Cable Triceps Pressdown','horizontal_push','muscle_gain','beginner',array['cable_machine'],array['horizontal_push'],array['incline-push-up'],8,15,2,3,'reps','bilateral','Keep upper arms still; extend without locking forcefully.'),
 ('medicine-ball-chest-pass','Medicine Ball Chest Pass','horizontal_push','athletic_performance','intermediate',array['medicine_balls'],array['horizontal_push','impact'],array['incline-push-up'],3,6,2,3,'reps','bilateral','Use a clear safe throwing area and reset every repetition.'),
 ('easy-walk','Easy Walk','conditioning','general_fitness','beginner','{}',array['balance','conditioning'],array['bike-conditioning'],1,1,1,3,'time','bilateral','Use an easy conversational pace in a safe clear area.')
on conflict(slug) where organization_id is null do nothing;

-- Metadata for the original approved core is additive; no historic IDs change.
update public.exercise_library set
 primary_muscles=case movement_pattern when 'squat' then array['quadriceps','glutes'] when 'hinge' then array['glutes','hamstrings'] when 'horizontal_push' then array['chest','triceps'] when 'vertical_push' then array['shoulders','triceps'] when 'horizontal_pull' then array['upper_back'] when 'vertical_pull' then array['lats'] when 'unilateral' then array['quadriceps','glutes'] when 'knee_flexion' then array['hamstrings'] when 'carry' then array['trunk'] else array['whole_body'] end,
 secondary_muscles=case when movement_pattern in ('horizontal_pull','vertical_pull') then array['biceps'] when movement_pattern in ('squat','hinge','unilateral','carry') then array['trunk'] else array['stabilizers'] end,
 purposes=case when primary_quality='muscle_gain' then array['hypertrophy','strength'] when primary_quality='athletic_performance' then array['athletic','conditioning'] when primary_quality='general_fitness' then array['strength','general_fitness'] else array[primary_quality] end,
 regression_slug=coalesce(regression_slug,substitution_slugs[1]),
 progression_slug=coalesce(progression_slug,case slug when 'goblet-squat' then 'front-squat' when 'box-squat' then 'goblet-squat' when 'glute-bridge' then 'hip-thrust' when 'incline-push-up' then 'push-up' when 'turf-walk' then 'turf-shuttle' else null end),
 coach_cue=coalesce(coach_cue,'Use a controlled, comfortable range. Stop for pain and ask your Coach.')
where organization_id is null;
update public.exercise_library set measurement='distance' where organization_id is null and slug='farmer-carry';
update public.exercise_library set measurement='time' where organization_id is null and slug in ('bike-conditioning','rower-conditioning');
update public.exercise_library set laterality='unilateral' where organization_id is null and slug='split-squat';
-- A generic cardio item is not evidence that a rower exists.
update public.exercise_library set equipment_requirements=array['rower'] where organization_id is null and slug='rower-conditioning';
update public.exercise_library set equipment_requirements=array['bike'] where organization_id is null and slug='bike-conditioning';
update public.exercise_library set contraindication_tags=contraindication_tags||array['vertical_push']
where organization_id is null and not('vertical_push'=any(contraindication_tags)) and (movement_pattern='vertical_push' or 'overhead'=any(contraindication_tags) or slug='lat-pulldown');
update public.exercise_library set
 primary_muscles=case slug
   when 'calf-raise' then array['calves'] when 'dumbbell-curl' then array['biceps','brachialis'] when 'cable-triceps-pressdown' then array['triceps']
   when 'wall-slide' then array['serratus_anterior','lower_trapezius'] when 'band-pull-apart' then array['rear_deltoids','rhomboids']
   when 'ski-erg-interval' then array['lats','triceps','trunk'] when 'rower-interval' then array['quadriceps','glutes','upper_back']
   when 'rower-conditioning' then array['quadriceps','glutes','upper_back'] when 'bike-conditioning' then array['quadriceps','glutes']
   when 'turf-walk' then array['glutes','quadriceps','calves'] when 'easy-walk' then array['glutes','quadriceps','calves']
   when 'turf-shuttle' then array['quadriceps','glutes','calves'] when 'sled-push' then array['quadriceps','glutes'] when 'sled-drag' then array['quadriceps','calves']
   else primary_muscles end,
 secondary_muscles=case
   when slug='dumbbell-curl' then array['forearms'] when slug='calf-raise' then array['foot_stabilizers']
   when slug='cable-triceps-pressdown' then array['forearms'] when slug='wall-slide' then array['rotator_cuff']
   when movement_pattern in ('horizontal_pull','vertical_pull') then array['biceps','rear_deltoids']
   when movement_pattern in ('horizontal_push','vertical_push') then array['shoulders','trunk']
   when movement_pattern in ('squat','hinge','unilateral') then array['trunk','calves']
   when movement_pattern='carry' then array['shoulders','glutes'] else array['trunk'] end,
 purposes=case when slug in ('wall-slide','band-pull-apart','bird-dog','dead-bug') then array['mobility','preparation','general_fitness'] else purposes end
where organization_id is null;

create or replace function private.generation_exercise_compatible(exercise_id uuid,target_intake_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.exercise_library e cross join public.client_intakes i
 where e.id=exercise_id and i.id=target_intake_id and e.is_active
 and (e.organization_id is null or e.organization_id=i.organization_id)
 and e.equipment_requirements <@ private.available_training_resources(i.organization_id)
 and not(e.contraindication_tags && i.constraint_tags)
 and case e.difficulty when 'beginner' then 1 when 'intermediate' then 2 else 3 end <= case i.experience_level when 'beginner' then 1 when 'intermediate' then 2 else 3 end
 and not exists(select 1 from unnest(i.avoided_exercises||i.movements_to_avoid) a where trim(a)<>'' and (lower(e.name) like '%'||lower(trim(a))||'%' or lower(replace(e.movement_pattern,'_',' '))=lower(trim(a)))))
$$;
