-- Extend existing versioned intake records, not a parallel intake/assessment model.
alter table public.client_intakes drop constraint client_intakes_primary_goal_check;
alter table public.client_intakes add constraint client_intakes_primary_goal_check check (
  primary_goal in ('strength','muscle_gain','general_fitness','conditioning','fat_loss','athletic_performance','body_recomposition')
);
alter table public.client_intakes drop constraint client_intakes_secondary_goal_check;
alter table public.client_intakes add constraint client_intakes_secondary_goal_check check (
  secondary_goal is null or secondary_goal in ('strength','muscle_gain','general_fitness','conditioning','fat_loss','athletic_performance','body_recomposition')
);

-- Optional targets live in the existing intake's versioned custom_fields.
-- Constraints also protect direct RPC callers, not only the browser form.
create function private.valid_body_composition_goals(fields jsonb)
returns boolean language plpgsql immutable set search_path = ''
as $$
declare goals jsonb := fields -> 'bodyCompositionGoals'; item record;
begin
  if goals is null then return true; end if;
  if jsonb_typeof(goals) <> 'object' then return false; end if;
  for item in select key, value from jsonb_each(goals) loop
    if item.key not in ('weightKg','bodyFatPercentage','skeletalMuscleMassKg')
      or jsonb_typeof(item.value) <> 'number' then return false; end if;
    if item.key = 'weightKg' and not ((item.value::text)::numeric > 0 and (item.value::text)::numeric <= 500) then return false; end if;
    if item.key = 'bodyFatPercentage' and not ((item.value::text)::numeric between 0 and 75) then return false; end if;
    if item.key = 'skeletalMuscleMassKg' and not ((item.value::text)::numeric > 0 and (item.value::text)::numeric <= 200) then return false; end if;
  end loop;
  if goals ? 'weightKg' and goals ? 'skeletalMuscleMassKg'
    and (goals ->> 'skeletalMuscleMassKg')::numeric > (goals ->> 'weightKg')::numeric then return false; end if;
  return true;
end;
$$;
revoke all on function private.valid_body_composition_goals(jsonb) from public, anon, authenticated;
-- An immutable validation helper reads no records and is used by a table CHECK.
grant execute on function private.valid_body_composition_goals(jsonb) to authenticated;
alter table public.client_intakes add constraint client_intakes_body_composition_goals_check
  check (private.valid_body_composition_goals(custom_fields));

create or replace function public.save_client_intake_v1(
  target_client_user_id uuid, intake_payload jsonb, baseline_payload jsonb, inbody_payload jsonb
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_intake_id uuid;
  target_organization_id uuid;
  organization_timezone text;
  inbody_status text;
  inbody_date date;
begin
  if actor_user_id is null or jsonb_typeof(baseline_payload) <> 'object'
    or jsonb_typeof(inbody_payload) <> 'object' then
    raise exception 'A structured baseline and InBody status are required';
  end if;
  select membership.organization_id, organization.timezone
  into strict target_organization_id, organization_timezone
  from public.organization_memberships membership
  join public.organizations organization on organization.id = membership.organization_id and organization.status = 'active'
  join public.profiles profile on profile.id = membership.user_id and profile.account_status = 'active'
  where membership.user_id = actor_user_id and membership.role = 'coach' and membership.status = 'active';
  if not private.has_active_coach_client_assignment(target_organization_id, actor_user_id, target_client_user_id)
    then raise exception 'Client is not assigned to this Coach'; end if;
  inbody_status := inbody_payload ->> 'status';
  if inbody_status not in ('pending','completed') or inbody_status is null then
    raise exception 'InBody must be marked pending or completed';
  end if;
  if inbody_status = 'completed' then
    inbody_date := nullif(inbody_payload ->> 'testDate', '')::date;
    if inbody_date is null or nullif(inbody_payload ->> 'weightKg', '') is null
      or nullif(inbody_payload ->> 'skeletalMuscleMassKg', '') is null
      or nullif(inbody_payload ->> 'bodyFatPercentage', '') is null
    then raise exception 'A completed InBody needs a date, weight, body-fat percentage and skeletal muscle mass'; end if;
    if (inbody_payload ->> 'skeletalMuscleMassKg')::numeric > (inbody_payload ->> 'weightKg')::numeric then
      raise exception 'Skeletal muscle mass cannot exceed body weight';
    end if;
  elsif inbody_payload - 'status' <> '{}'::jsonb then
    raise exception 'Pending InBody must not contain fabricated measurements';
  end if;

  -- The existing function creates the immutable intake version and calculates
  -- Gate 4 state. Any later error rolls back that version and state atomically.
  target_intake_id := public.upsert_client_intake(target_client_user_id, intake_payload);
  insert into public.client_intake_baselines (
    intake_id, organization_id, client_user_id, recorded_by,
    squat_variation, squat_other_variation, squat_load_kg, squat_reps,
    squat_one_rm_kg, squat_one_rm_method, squat_notes,
    bench_variation, bench_load_kg, bench_reps, bench_one_rm_kg, bench_one_rm_method, bench_notes,
    pullup_strict_reps, pullup_mode, pullup_adjustment_kg, pullup_notes,
    rower_distance_m, rower_time_seconds, rower_calories, rower_pace_seconds_per_500m,
    rower_average_heart_rate, rower_notes,
    versa_duration_seconds, versa_feet, versa_calories, versa_average_heart_rate, versa_notes,
    inbody_status
  ) values (
    target_intake_id, target_organization_id, target_client_user_id, actor_user_id,
    baseline_payload ->> 'squatVariation', nullif(baseline_payload ->> 'squatOtherVariation', ''),
    (baseline_payload ->> 'squatLoadKg')::numeric, (baseline_payload ->> 'squatReps')::smallint,
    (baseline_payload ->> 'squatOneRmKg')::numeric, baseline_payload ->> 'squatOneRmMethod',
    nullif(baseline_payload ->> 'squatNotes', ''),
    baseline_payload ->> 'benchVariation', (baseline_payload ->> 'benchLoadKg')::numeric,
    (baseline_payload ->> 'benchReps')::smallint, (baseline_payload ->> 'benchOneRmKg')::numeric,
    baseline_payload ->> 'benchOneRmMethod', nullif(baseline_payload ->> 'benchNotes', ''),
    (baseline_payload ->> 'pullupStrictReps')::smallint, baseline_payload ->> 'pullupMode',
    nullif(baseline_payload ->> 'pullupAdjustmentKg', '')::numeric,
    nullif(baseline_payload ->> 'pullupNotes', ''),
    nullif(baseline_payload ->> 'rowerDistanceM', '')::integer,
    nullif(baseline_payload ->> 'rowerTimeSeconds', '')::integer,
    nullif(baseline_payload ->> 'rowerCalories', '')::integer,
    nullif(baseline_payload ->> 'rowerPaceSecondsPer500m', '')::numeric,
    nullif(baseline_payload ->> 'rowerAverageHeartRate', '')::smallint,
    nullif(baseline_payload ->> 'rowerNotes', ''),
    nullif(baseline_payload ->> 'versaDurationSeconds', '')::integer,
    nullif(baseline_payload ->> 'versaFeet', '')::integer,
    nullif(baseline_payload ->> 'versaCalories', '')::integer,
    nullif(baseline_payload ->> 'versaAverageHeartRate', '')::smallint,
    nullif(baseline_payload ->> 'versaNotes', ''),
    inbody_status
  );
  if inbody_status = 'completed' then
    insert into public.client_body_composition_assessments (
      organization_id, client_user_id, recorded_by, intake_id, measured_at,
      weight_kg, inbody_score, skeletal_muscle_mass_kg, body_fat_mass_kg,
      body_fat_percentage, bmi, visceral_fat_level, ecw_tbw, bmr_kcal, source
    ) values (
      target_organization_id, target_client_user_id, actor_user_id, target_intake_id,
      (inbody_date::timestamp + interval '12 hours') at time zone organization_timezone,
      nullif(inbody_payload ->> 'weightKg', '')::numeric,
      nullif(inbody_payload ->> 'inbodyScore', '')::numeric,
      nullif(inbody_payload ->> 'skeletalMuscleMassKg', '')::numeric,
      nullif(inbody_payload ->> 'bodyFatMassKg', '')::numeric,
      nullif(inbody_payload ->> 'bodyFatPercentage', '')::numeric,
      nullif(inbody_payload ->> 'bmi', '')::numeric,
      nullif(inbody_payload ->> 'visceralFatLevel', '')::numeric,
      nullif(inbody_payload ->> 'ecwTbw', '')::numeric,
      nullif(inbody_payload ->> 'bmrKcal', '')::integer,
      'intake_inbody'
    );
  end if;
  update public.client_states set state_values = state_values || jsonb_build_object(
    'baseline_intake_id', target_intake_id, 'inbody_status', inbody_status
  ) where intake_id = target_intake_id;
  return target_intake_id;
exception when no_data_found then raise exception 'An active assigned Coach is required';
end;
$$;
