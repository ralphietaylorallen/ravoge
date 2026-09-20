create type public.prescription_status as enum ('draft', 'assigned', 'discarded');
create type public.set_outcome_status as enum ('planned', 'completed', 'incomplete');
create type public.set_difficulty as enum ('easy', 'about_right', 'hard');
create type public.set_failure_reason as enum (
  'failed_reps',
  'too_heavy',
  'pain_discomfort',
  'form_breakdown',
  'fatigue',
  'coach_stopped',
  'equipment_unavailable',
  'time',
  'other'
);
create type public.training_library_source as enum ('manual', 'csv', 'excel', 'pdf', 'word');
create type public.training_library_status as enum ('draft', 'review', 'published', 'archived');

create table public.client_intakes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_user_id uuid not null references auth.users (id) on delete cascade,
  completed_by uuid not null references auth.users (id) on delete restrict,
  version integer not null check (version > 0),
  schema_version integer not null default 1 check (schema_version > 0),
  client_name text not null check (char_length(trim(client_name)) between 2 and 120),
  birth_year smallint check (birth_year is null or birth_year between 1900 and 2100),
  training_frequency_goal smallint not null check (training_frequency_goal between 1 and 7),
  primary_goal text not null check (primary_goal in (
    'strength', 'muscle_gain', 'general_fitness', 'conditioning',
    'fat_loss', 'athletic_performance'
  )),
  secondary_goal text check (secondary_goal is null or secondary_goal in (
    'strength', 'muscle_gain', 'general_fitness', 'conditioning',
    'fat_loss', 'athletic_performance'
  )),
  training_years numeric(4, 1) not null check (training_years between 0 and 80),
  experience_level text not null check (experience_level in ('beginner', 'intermediate', 'advanced')),
  recent_consistency text not null check (recent_consistency in ('inconsistent', 'building', 'consistent')),
  preferred_training_days text[] not null default '{}',
  current_injuries text,
  movement_limitations text,
  pain_areas text[] not null default '{}',
  movements_to_avoid text[] not null default '{}',
  medical_coach_notes text,
  strength_baseline smallint check (strength_baseline is null or strength_baseline between 1 and 5),
  conditioning_baseline smallint check (conditioning_baseline is null or conditioning_baseline between 1 and 5),
  mobility_baseline smallint check (mobility_baseline is null or mobility_baseline between 1 and 5),
  assessment_scores jsonb not null default '{}'::jsonb check (jsonb_typeof(assessment_scores) = 'object'),
  sleep_quality smallint not null check (sleep_quality between 1 and 5),
  stress_level smallint not null check (stress_level between 1 and 5),
  recovery_perception smallint not null check (recovery_perception between 1 and 5),
  soreness_fatigue smallint not null check (soreness_fatigue between 1 and 5),
  preferred_exercises text[] not null default '{}',
  avoided_exercises text[] not null default '{}',
  session_duration_minutes smallint not null check (session_duration_minutes between 20 and 180),
  coach_notes text,
  constraint_tags text[] not null default '{}' check (
    constraint_tags <@ array[
      'knee_flexion', 'hinge', 'axial_load', 'horizontal_push',
      'vertical_push', 'impact', 'balance', 'conditioning'
    ]::text[]
  ),
  custom_fields jsonb not null default '{}'::jsonb check (jsonb_typeof(custom_fields) = 'object'),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, client_user_id, version),
  unique (id, organization_id, client_user_id),
  foreign key (organization_id, client_user_id)
    references public.organization_memberships (organization_id, user_id) on delete cascade,
  foreign key (organization_id, completed_by)
    references public.organization_memberships (organization_id, user_id) on delete restrict
);

create table public.client_states (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_user_id uuid not null references auth.users (id) on delete cascade,
  intake_id uuid not null,
  calculated_by uuid not null references auth.users (id) on delete restrict,
  engine_version text not null default 'state-v0.1',
  training_experience numeric(4, 3) not null check (training_experience between 0 and 1),
  strength_capacity_estimate numeric(4, 3) not null check (strength_capacity_estimate between 0 and 1),
  conditioning_capacity_estimate numeric(4, 3) not null check (conditioning_capacity_estimate between 0 and 1),
  recovery_capacity numeric(4, 3) not null check (recovery_capacity between 0 and 1),
  current_readiness numeric(4, 3) not null check (current_readiness between 0 and 1),
  movement_tolerance numeric(4, 3) not null check (movement_tolerance between 0 and 1),
  technical_capacity numeric(4, 3) not null check (technical_capacity between 0 and 1),
  volume_tolerance numeric(4, 3) not null check (volume_tolerance between 0 and 1),
  intensity_tolerance numeric(4, 3) not null check (intensity_tolerance between 0 and 1),
  adherence_confidence numeric(4, 3) not null check (adherence_confidence between 0 and 1),
  primary_goal text not null,
  preferred_frequency smallint not null check (preferred_frequency between 1 and 7),
  constraint_tags text[] not null default '{}',
  confidence jsonb not null check (jsonb_typeof(confidence) = 'object'),
  state_values jsonb not null default '{}'::jsonb check (jsonb_typeof(state_values) = 'object'),
  calculated_at timestamptz not null default now(),
  unique (intake_id),
  unique (id, organization_id, client_user_id),
  foreign key (intake_id, organization_id, client_user_id)
    references public.client_intakes (id, organization_id, client_user_id) on delete cascade,
  foreign key (organization_id, calculated_by)
    references public.organization_memberships (organization_id, user_id) on delete restrict
);

create table public.organization_equipment (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  equipment_type text not null check (equipment_type in (
    'barbell', 'plates', 'squat_rack', 'bench', 'dumbbells', 'kettlebells',
    'cable_machine', 'selectorized_machine', 'cardio_equipment', 'sled',
    'bands', 'medicine_balls', 'specialty_equipment', 'other'
  )),
  name text not null check (char_length(trim(name)) between 2 and 120),
  quantity integer check (quantity is null or quantity between 1 and 10000),
  is_available boolean not null default true,
  notes text check (notes is null or char_length(notes) <= 1000),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, created_by)
    references public.organization_memberships (organization_id, user_id) on delete restrict
);

create unique index organization_equipment_name_idx
  on public.organization_equipment (organization_id, lower(name));

create table public.exercise_library (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(trim(name)) between 2 and 120),
  movement_pattern text not null check (movement_pattern in (
    'squat', 'hinge', 'horizontal_push', 'vertical_push', 'horizontal_pull',
    'vertical_pull', 'unilateral', 'knee_flexion', 'carry', 'conditioning'
  )),
  primary_quality text not null check (primary_quality in (
    'strength', 'muscle_gain', 'general_fitness', 'conditioning',
    'fat_loss', 'athletic_performance'
  )),
  difficulty text not null check (difficulty in ('beginner', 'intermediate', 'advanced')),
  equipment_requirements text[] not null default '{}',
  contraindication_tags text[] not null default '{}',
  substitution_slugs text[] not null default '{}',
  default_rep_min smallint not null check (default_rep_min between 1 and 1000),
  default_rep_max smallint not null check (default_rep_max between default_rep_min and 1000),
  default_set_min smallint not null check (default_set_min between 1 and 100),
  default_set_max smallint not null check (default_set_max between default_set_min and 100),
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((organization_id is null and created_by is null) or (organization_id is not null and created_by is not null))
);

create unique index exercise_library_global_slug_idx
  on public.exercise_library (slug) where organization_id is null;
create unique index exercise_library_org_slug_idx
  on public.exercise_library (organization_id, slug) where organization_id is not null;
create index exercise_library_selection_idx
  on public.exercise_library (movement_pattern, difficulty, primary_quality)
  where is_active;

create table public.generated_prescriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  coach_user_id uuid not null references auth.users (id) on delete restrict,
  client_user_id uuid not null references auth.users (id) on delete cascade,
  intake_id uuid not null,
  state_id uuid not null,
  engine_version text not null default 'prescription-v0.1',
  status public.prescription_status not null default 'draft',
  title text not null check (char_length(trim(title)) between 2 and 120),
  objective text not null check (char_length(trim(objective)) between 2 and 500),
  estimated_duration_minutes smallint not null check (estimated_duration_minutes between 15 and 240),
  volume_intent text not null check (volume_intent in ('conservative', 'moderate', 'progressive')),
  rationale text not null check (char_length(trim(rationale)) between 2 and 4000),
  original_recommendation jsonb not null check (jsonb_typeof(original_recommendation) = 'array'),
  final_prescription jsonb not null check (jsonb_typeof(final_prescription) = 'array'),
  coach_modified boolean not null default false,
  generated_at timestamptz not null default now(),
  approved_at timestamptz,
  workout_assignment_id uuid references public.workout_assignments (id) on delete set null,
  unique (id, organization_id, client_user_id),
  foreign key (intake_id, organization_id, client_user_id)
    references public.client_intakes (id, organization_id, client_user_id) on delete restrict,
  foreign key (state_id, organization_id, client_user_id)
    references public.client_states (id, organization_id, client_user_id) on delete restrict,
  foreign key (organization_id, coach_user_id)
    references public.organization_memberships (organization_id, user_id) on delete restrict,
  foreign key (organization_id, client_user_id)
    references public.organization_memberships (organization_id, user_id) on delete cascade
);

alter table public.workout_assignments
  add column source_prescription_id uuid references public.generated_prescriptions (id) on delete set null,
  add column objective text,
  add column estimated_duration_minutes smallint check (
    estimated_duration_minutes is null or estimated_duration_minutes between 15 and 240
  ),
  add column volume_intent text check (
    volume_intent is null or volume_intent in ('conservative', 'moderate', 'progressive')
  ),
  add column coach_rationale text;

alter table public.workout_exercises
  add column library_exercise_id uuid references public.exercise_library (id) on delete set null,
  add column rest_seconds smallint check (rest_seconds is null or rest_seconds between 10 and 1800),
  add column selection_reason text check (selection_reason is null or char_length(selection_reason) <= 1000);

create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references public.workout_exercises (id) on delete cascade,
  set_number smallint not null check (set_number between 1 and 100),
  prescribed_reps smallint not null check (prescribed_reps between 1 and 1000),
  prescribed_load numeric(10, 2) check (prescribed_load is null or prescribed_load between 0 and 100000),
  actual_reps smallint check (actual_reps is null or actual_reps between 0 and 1000),
  actual_load numeric(10, 2) check (actual_load is null or actual_load between 0 and 100000),
  outcome_status public.set_outcome_status not null default 'planned',
  difficulty public.set_difficulty,
  failure_reason public.set_failure_reason,
  failure_notes text check (failure_notes is null or char_length(failure_notes) <= 1000),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workout_exercise_id, set_number),
  check (
    (outcome_status = 'planned' and completed_at is null and difficulty is null and failure_reason is null)
    or (outcome_status = 'completed' and completed_at is not null and failure_reason is null)
    or (outcome_status = 'incomplete' and completed_at is not null and failure_reason is not null)
  )
);

create table public.training_library_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 160),
  source_type public.training_library_source not null default 'manual',
  status public.training_library_status not null default 'draft',
  source_filename text,
  normalized_content jsonb not null default '{}'::jsonb check (jsonb_typeof(normalized_content) = 'object'),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, created_by)
    references public.organization_memberships (organization_id, user_id) on delete restrict
);

create index client_intakes_client_version_idx
  on public.client_intakes (organization_id, client_user_id, version desc);
create index client_states_client_calculated_idx
  on public.client_states (organization_id, client_user_id, calculated_at desc);
create index generated_prescriptions_client_generated_idx
  on public.generated_prescriptions (organization_id, client_user_id, generated_at desc);
create index generated_prescriptions_coach_status_idx
  on public.generated_prescriptions (coach_user_id, status, generated_at desc);
create index workout_sets_exercise_order_idx
  on public.workout_sets (workout_exercise_id, set_number);
create index training_library_items_org_status_idx
  on public.training_library_items (organization_id, status, created_at desc);

create trigger client_intakes_set_updated_at
  before update on public.client_intakes
  for each row execute function private.set_updated_at();
create trigger organization_equipment_set_updated_at
  before update on public.organization_equipment
  for each row execute function private.set_updated_at();
create trigger exercise_library_set_updated_at
  before update on public.exercise_library
  for each row execute function private.set_updated_at();
create trigger workout_sets_set_updated_at
  before update on public.workout_sets
  for each row execute function private.set_updated_at();
create trigger training_library_items_set_updated_at
  before update on public.training_library_items
  for each row execute function private.set_updated_at();

create function private.can_read_client_domain(
  target_organization_id uuid,
  target_client_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (
      target_client_user_id = (select auth.uid())
      and private.has_active_role(
        target_organization_id,
        array['client']::public.organization_role[]
      )
    )
    or private.has_active_role(
      target_organization_id,
      array['owner']::public.organization_role[]
    )
    or private.has_active_coach_client_assignment(
      target_organization_id,
      (select auth.uid()),
      target_client_user_id
    );
$$;

create function private.can_manage_client_domain(
  target_organization_id uuid,
  target_client_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_active_coach_client_assignment(
    target_organization_id,
    (select auth.uid()),
    target_client_user_id
  );
$$;

create function private.calculate_client_state_v0(
  target_intake_id uuid,
  actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  intake public.client_intakes%rowtype;
  experience_score numeric;
  consistency_score numeric;
  recovery_score numeric;
  movement_score numeric;
  strength_score numeric;
  conditioning_score numeric;
  state_id uuid;
  overall_confidence text;
begin
  select * into strict intake
  from public.client_intakes
  where id = target_intake_id;

  experience_score := case intake.experience_level
    when 'beginner' then 0.25
    when 'intermediate' then 0.55
    else 0.82
  end;
  consistency_score := case intake.recent_consistency
    when 'inconsistent' then 0.30
    when 'building' then 0.58
    else 0.82
  end;
  recovery_score := round((
    intake.sleep_quality
    + (6 - intake.stress_level)
    + intake.recovery_perception
    + (6 - intake.soreness_fatigue)
  )::numeric / 20, 3);
  movement_score := greatest(
    0.10,
    least(
      1.00,
      coalesce(intake.mobility_baseline::numeric / 5, 0.55)
      - cardinality(intake.constraint_tags) * 0.11
    )
  );
  strength_score := coalesce(
    intake.strength_baseline::numeric / 5,
    experience_score * 0.85
  );
  conditioning_score := coalesce(
    intake.conditioning_baseline::numeric / 5,
    (experience_score + consistency_score) / 2
  );
  overall_confidence := case
    when intake.strength_baseline is null
      and intake.conditioning_baseline is null
      and intake.mobility_baseline is null then 'low'
    when intake.strength_baseline is null
      or intake.conditioning_baseline is null
      or intake.mobility_baseline is null then 'medium'
    else 'high'
  end;

  insert into public.client_states (
    organization_id,
    client_user_id,
    intake_id,
    calculated_by,
    training_experience,
    strength_capacity_estimate,
    conditioning_capacity_estimate,
    recovery_capacity,
    current_readiness,
    movement_tolerance,
    technical_capacity,
    volume_tolerance,
    intensity_tolerance,
    adherence_confidence,
    primary_goal,
    preferred_frequency,
    constraint_tags,
    confidence,
    state_values
  ) values (
    intake.organization_id,
    intake.client_user_id,
    intake.id,
    actor_user_id,
    experience_score,
    round(strength_score, 3),
    round(conditioning_score, 3),
    recovery_score,
    round(greatest(0.10, least(1.00, recovery_score * 0.65 + consistency_score * 0.35)), 3),
    round(movement_score, 3),
    experience_score,
    round(greatest(0.10, least(1.00,
      experience_score * 0.45
      + recovery_score * 0.30
      + (intake.training_frequency_goal::numeric / 7) * 0.25
    )), 3),
    round(greatest(0.10, least(1.00, experience_score * 0.65 + recovery_score * 0.35)), 3),
    consistency_score,
    intake.primary_goal,
    intake.training_frequency_goal,
    intake.constraint_tags,
    jsonb_build_object(
      'overall', overall_confidence,
      'strength', case when intake.strength_baseline is null then 'low' else 'medium' end,
      'conditioning', case when intake.conditioning_baseline is null then 'low' else 'medium' end,
      'movement', case when intake.mobility_baseline is null then 'low' else 'medium' end,
      'recovery', 'medium'
    ),
    jsonb_build_object(
      'rules_version', 'state-v0.1',
      'experience_level', intake.experience_level,
      'recent_consistency', intake.recent_consistency,
      'constraint_count', cardinality(intake.constraint_tags),
      'uncertainty_note', 'V0 estimates are directional and require coach review.'
    )
  ) returning id into state_id;

  return state_id;
end;
$$;

create function public.upsert_client_intake(
  target_client_user_id uuid,
  intake_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  active_organization_id uuid;
  profile_name text;
  next_version integer;
  new_intake_id uuid;
begin
  if actor_user_id is null or jsonb_typeof(intake_payload) <> 'object' then
    raise exception 'Authentication and a valid intake are required';
  end if;

  select membership.organization_id into strict active_organization_id
  from public.organization_memberships membership
  join public.organizations organization
    on organization.id = membership.organization_id and organization.status = 'active'
  join public.profiles profile
    on profile.id = membership.user_id and profile.account_status = 'active'
  where membership.user_id = actor_user_id
    and membership.role = 'coach'
    and membership.status = 'active';

  if not private.has_active_coach_client_assignment(
    active_organization_id,
    actor_user_id,
    target_client_user_id
  ) then
    raise exception 'Client is not assigned to this coach';
  end if;

  if jsonb_typeof(coalesce(intake_payload -> 'preferredTrainingDays', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(intake_payload -> 'painAreas', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(intake_payload -> 'movementsToAvoid', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(intake_payload -> 'preferredExercises', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(intake_payload -> 'avoidedExercises', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(intake_payload -> 'constraintTags', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(intake_payload -> 'assessmentScores', '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(intake_payload -> 'customFields', '{}'::jsonb)) <> 'object' then
    raise exception 'Intake arrays and extension fields are invalid';
  end if;

  select full_name into strict profile_name
  from public.profiles where id = target_client_user_id;
  select coalesce(max(version), 0) + 1 into next_version
  from public.client_intakes
  where organization_id = active_organization_id
    and client_user_id = target_client_user_id;

  insert into public.client_intakes (
    organization_id, client_user_id, completed_by, version, client_name,
    birth_year, training_frequency_goal, primary_goal, secondary_goal,
    training_years, experience_level, recent_consistency, preferred_training_days,
    current_injuries, movement_limitations, pain_areas, movements_to_avoid,
    medical_coach_notes, strength_baseline, conditioning_baseline, mobility_baseline,
    assessment_scores, sleep_quality, stress_level, recovery_perception,
    soreness_fatigue, preferred_exercises, avoided_exercises,
    session_duration_minutes, coach_notes, constraint_tags, custom_fields
  ) values (
    active_organization_id,
    target_client_user_id,
    actor_user_id,
    next_version,
    profile_name,
    nullif(intake_payload ->> 'birthYear', '')::smallint,
    (intake_payload ->> 'trainingFrequencyGoal')::smallint,
    intake_payload ->> 'primaryGoal',
    nullif(intake_payload ->> 'secondaryGoal', ''),
    (intake_payload ->> 'trainingYears')::numeric,
    intake_payload ->> 'experienceLevel',
    intake_payload ->> 'recentConsistency',
    array(select jsonb_array_elements_text(coalesce(intake_payload -> 'preferredTrainingDays', '[]'::jsonb))),
    nullif(trim(coalesce(intake_payload ->> 'currentInjuries', '')), ''),
    nullif(trim(coalesce(intake_payload ->> 'movementLimitations', '')), ''),
    array(select jsonb_array_elements_text(coalesce(intake_payload -> 'painAreas', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(intake_payload -> 'movementsToAvoid', '[]'::jsonb))),
    nullif(trim(coalesce(intake_payload ->> 'medicalCoachNotes', '')), ''),
    nullif(intake_payload ->> 'strengthBaseline', '')::smallint,
    nullif(intake_payload ->> 'conditioningBaseline', '')::smallint,
    nullif(intake_payload ->> 'mobilityBaseline', '')::smallint,
    coalesce(intake_payload -> 'assessmentScores', '{}'::jsonb),
    (intake_payload ->> 'sleepQuality')::smallint,
    (intake_payload ->> 'stressLevel')::smallint,
    (intake_payload ->> 'recoveryPerception')::smallint,
    (intake_payload ->> 'sorenessFatigue')::smallint,
    array(select jsonb_array_elements_text(coalesce(intake_payload -> 'preferredExercises', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(intake_payload -> 'avoidedExercises', '[]'::jsonb))),
    (intake_payload ->> 'sessionDurationMinutes')::smallint,
    nullif(trim(coalesce(intake_payload ->> 'coachNotes', '')), ''),
    array(select jsonb_array_elements_text(coalesce(intake_payload -> 'constraintTags', '[]'::jsonb))),
    coalesce(intake_payload -> 'customFields', '{}'::jsonb)
  ) returning id into new_intake_id;

  perform private.calculate_client_state_v0(new_intake_id, actor_user_id);
  return new_intake_id;
exception
  when no_data_found then raise exception 'An active coach and assigned client are required';
  when too_many_rows then raise exception 'Coach membership is ambiguous';
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Intake numeric values are invalid';
end;
$$;

create function public.generate_initial_prescription_v0(
  target_client_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  active_organization_id uuid;
  intake public.client_intakes%rowtype;
  state public.client_states%rowtype;
  available_equipment text[];
  target_patterns text[];
  recommendation jsonb := '[]'::jsonb;
  pattern text;
  pattern_order integer;
  selected_exercise public.exercise_library%rowtype;
  selected_sets integer;
  selected_reps integer;
  selected_rest integer;
  volume_intent_value text;
  objective_value text;
  rationale_value text;
  prescription_id uuid;
begin
  if actor_user_id is null then raise exception 'Authentication is required'; end if;

  select membership.organization_id into strict active_organization_id
  from public.organization_memberships membership
  join public.organizations organization
    on organization.id = membership.organization_id and organization.status = 'active'
  join public.profiles profile
    on profile.id = membership.user_id and profile.account_status = 'active'
  where membership.user_id = actor_user_id
    and membership.role = 'coach'
    and membership.status = 'active';

  if not private.has_active_coach_client_assignment(
    active_organization_id, actor_user_id, target_client_user_id
  ) then raise exception 'Client is not assigned to this coach'; end if;

  select * into strict intake
  from public.client_intakes
  where organization_id = active_organization_id
    and client_user_id = target_client_user_id
  order by version desc limit 1;
  select * into strict state
  from public.client_states where intake_id = intake.id;

  select coalesce(array_agg(distinct equipment_type), '{}'::text[])
  into available_equipment
  from public.organization_equipment
  where organization_id = active_organization_id and is_available;

  target_patterns := case intake.primary_goal
    when 'strength' then array['squat','hinge','horizontal_push','horizontal_pull','carry']
    when 'muscle_gain' then array['squat','hinge','horizontal_push','vertical_pull','knee_flexion']
    when 'conditioning' then array['conditioning','squat','horizontal_pull','carry']
    when 'fat_loss' then array['conditioning','squat','hinge','carry']
    when 'athletic_performance' then array['squat','hinge','unilateral','carry','conditioning']
    else array['squat','hinge','horizontal_push','horizontal_pull','conditioning']
  end;

  for pattern, pattern_order in
    select value, ordinality::integer
    from unnest(target_patterns) with ordinality as requested(value, ordinality)
  loop
    select exercise.* into selected_exercise
    from public.exercise_library exercise
    where exercise.is_active
      and (exercise.organization_id is null or exercise.organization_id = active_organization_id)
      and exercise.movement_pattern = pattern
      and exercise.equipment_requirements <@ available_equipment
      and not (exercise.contraindication_tags && intake.constraint_tags)
      and case exercise.difficulty
        when 'beginner' then 1 when 'intermediate' then 2 else 3
      end <= case intake.experience_level
        when 'beginner' then 1 when 'intermediate' then 2 else 3
      end
    order by
      (exercise.primary_quality = intake.primary_goal) desc,
      (exercise.organization_id is not null) desc,
      exercise.name
    limit 1;

    if found then
      if intake.primary_goal = 'strength' then
        selected_sets := case when pattern_order = 1 then 4 else 3 end;
        selected_reps := case when pattern_order = 1 then 6 else 8 end;
        selected_rest := case when pattern_order = 1 then 150 else 90 end;
      elsif intake.primary_goal = 'muscle_gain' then
        selected_sets := 3; selected_reps := 10; selected_rest := 75;
      elsif pattern = 'conditioning' then
        selected_sets := 6; selected_reps := 1; selected_rest := 60;
      else
        selected_sets := 3; selected_reps := 8; selected_rest := 75;
      end if;

      if state.recovery_capacity < 0.45 or state.current_readiness < 0.45 then
        selected_sets := greatest(2, selected_sets - 1);
      end if;

      recommendation := recommendation || jsonb_build_array(jsonb_build_object(
        'libraryExerciseId', selected_exercise.id,
        'name', selected_exercise.name,
        'sets', selected_sets,
        'reps', selected_reps,
        'load', null,
        'restSeconds', selected_rest,
        'notes', case when pattern = 'conditioning' then 'Use controlled, repeatable intervals.' else 'Begin conservatively and preserve clean technique.' end,
        'reason', format('%s pattern selected for %s with available equipment.', replace(pattern, '_', ' '), replace(intake.primary_goal, '_', ' '))
      ));
    end if;
  end loop;

  if jsonb_array_length(recommendation) < 3 then
    raise exception 'Not enough safe exercises match this client and gym equipment';
  end if;

  volume_intent_value := case
    when state.volume_tolerance < 0.45 or state.recovery_capacity < 0.45 then 'conservative'
    when state.volume_tolerance >= 0.72 and state.recovery_capacity >= 0.62 then 'progressive'
    else 'moderate'
  end;
  objective_value := format('Establish a safe %s baseline with repeatable technique.', replace(intake.primary_goal, '_', ' '));
  rationale_value := format(
    'V0 uses %s experience, %s recovery, a %s volume intent, %s weekly sessions, and %s active movement constraint(s). Coach review is required.',
    intake.experience_level,
    case when state.recovery_capacity < 0.45 then 'limited' when state.recovery_capacity < 0.7 then 'moderate' else 'strong' end,
    volume_intent_value,
    intake.training_frequency_goal,
    cardinality(intake.constraint_tags)
  );

  insert into public.generated_prescriptions (
    organization_id, coach_user_id, client_user_id, intake_id, state_id,
    title, objective, estimated_duration_minutes, volume_intent, rationale,
    original_recommendation, final_prescription
  ) values (
    active_organization_id, actor_user_id, target_client_user_id, intake.id, state.id,
    case intake.primary_goal
      when 'strength' then 'Foundation Strength A'
      when 'muscle_gain' then 'Foundation Hypertrophy A'
      when 'conditioning' then 'Conditioning Foundation A'
      when 'fat_loss' then 'Strength & Conditioning A'
      when 'athletic_performance' then 'Athletic Foundation A'
      else 'General Training Foundation A'
    end,
    objective_value,
    least(90, greatest(30, intake.session_duration_minutes)),
    volume_intent_value,
    rationale_value,
    recommendation,
    recommendation
  ) returning id into prescription_id;

  return prescription_id;
exception
  when no_data_found then raise exception 'A completed intake and calculated state are required';
  when too_many_rows then raise exception 'Coach membership is ambiguous';
end;
$$;

create function public.approve_generated_prescription_v0(
  target_prescription_id uuid,
  workout_title text,
  workout_instructions text,
  workout_scheduled_date date,
  exercises jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  prescription public.generated_prescriptions%rowtype;
  intake public.client_intakes%rowtype;
  new_workout_id uuid;
  exercise jsonb;
  exercise_index integer;
  selected_library public.exercise_library%rowtype;
  available_equipment text[];
  exercise_sets integer;
  exercise_reps integer;
  exercise_load numeric;
  exercise_rest integer;
  exercise_notes text;
  exercise_reason text;
  normalized_exercises jsonb := '[]'::jsonb;
begin
  if actor_user_id is null then raise exception 'Authentication is required'; end if;
  select * into strict prescription
  from public.generated_prescriptions
  where id = target_prescription_id
  for update;

  if prescription.coach_user_id <> actor_user_id
    or prescription.status <> 'draft'
    or not private.has_active_coach_client_assignment(
      prescription.organization_id, actor_user_id, prescription.client_user_id
    ) then raise exception 'Prescription is not available to this coach'; end if;

  select * into strict intake from public.client_intakes where id = prescription.intake_id;
  select coalesce(array_agg(distinct equipment_type), '{}'::text[])
  into available_equipment
  from public.organization_equipment
  where organization_id = prescription.organization_id and is_available;

  workout_title := trim(coalesce(workout_title, ''));
  workout_instructions := nullif(trim(coalesce(workout_instructions, '')), '');
  if char_length(workout_title) not between 2 and 120
    or workout_scheduled_date is null
    or char_length(coalesce(workout_instructions, '')) > 4000
    or jsonb_typeof(exercises) <> 'array'
    or jsonb_array_length(exercises) not between 1 and 30 then
    raise exception 'Invalid final workout';
  end if;

  insert into public.workout_assignments (
    organization_id, coach_user_id, client_user_id, title, instructions,
    scheduled_date, source_prescription_id, objective,
    estimated_duration_minutes, volume_intent, coach_rationale
  ) values (
    prescription.organization_id, actor_user_id, prescription.client_user_id,
    workout_title, workout_instructions, workout_scheduled_date,
    prescription.id, prescription.objective, prescription.estimated_duration_minutes,
    prescription.volume_intent, prescription.rationale
  ) returning id into new_workout_id;

  for exercise, exercise_index in
    select value, ordinality::integer - 1
    from jsonb_array_elements(exercises) with ordinality
  loop
    select library.* into strict selected_library
    from public.exercise_library library
    where library.id = (exercise ->> 'libraryExerciseId')::uuid
      and library.is_active
      and (library.organization_id is null or library.organization_id = prescription.organization_id)
      and library.equipment_requirements <@ available_equipment
      and not (library.contraindication_tags && intake.constraint_tags);

    exercise_sets := (exercise ->> 'sets')::integer;
    exercise_reps := (exercise ->> 'reps')::integer;
    exercise_load := nullif(trim(coalesce(exercise ->> 'load', '')), '')::numeric;
    exercise_rest := nullif(trim(coalesce(exercise ->> 'restSeconds', '')), '')::integer;
    exercise_notes := nullif(trim(coalesce(exercise ->> 'notes', '')), '');
    exercise_reason := nullif(trim(coalesce(exercise ->> 'reason', '')), '');
    if exercise_sets not between 1 and 100
      or exercise_reps not between 1 and 1000
      or (exercise_load is not null and exercise_load not between 0 and 100000)
      or (exercise_rest is not null and exercise_rest not between 10 and 1800)
      or char_length(coalesce(exercise_notes, '')) > 1000
      or char_length(coalesce(exercise_reason, '')) > 1000 then
      raise exception 'Invalid final exercise';
    end if;

    insert into public.workout_exercises (
      workout_assignment_id, library_exercise_id, exercise_name, sets, reps,
      load, rest_seconds, notes, selection_reason, sort_order
    ) values (
      new_workout_id, selected_library.id, selected_library.name, exercise_sets,
      exercise_reps, exercise_load, exercise_rest, exercise_notes,
      exercise_reason, exercise_index
    );

    normalized_exercises := normalized_exercises || jsonb_build_array(jsonb_build_object(
      'libraryExerciseId', selected_library.id,
      'name', selected_library.name,
      'sets', exercise_sets,
      'reps', exercise_reps,
      'load', exercise_load,
      'restSeconds', exercise_rest,
      'notes', exercise_notes,
      'reason', exercise_reason
    ));
  end loop;

  update public.generated_prescriptions
  set status = 'assigned',
      final_prescription = normalized_exercises,
      coach_modified = normalized_exercises <> original_recommendation
        or workout_title <> title
        or coalesce(workout_instructions, '') <> '',
      approved_at = now(),
      workout_assignment_id = new_workout_id
  where id = prescription.id;
  return new_workout_id;
exception
  when no_data_found then raise exception 'Prescription or safe exercise was not found';
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Final exercise values are invalid';
end;
$$;

create function private.create_prescribed_sets()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.workout_sets (
    workout_exercise_id, set_number, prescribed_reps, prescribed_load
  )
  select new.id, series, new.reps, new.load
  from generate_series(1, new.sets) as series;
  return new;
end;
$$;

create trigger create_prescribed_sets
  after insert on public.workout_exercises
  for each row execute function private.create_prescribed_sets();

insert into public.workout_sets (
  workout_exercise_id, set_number, prescribed_reps, prescribed_load
)
select exercise.id, series, exercise.reps, exercise.load
from public.workout_exercises exercise
cross join lateral generate_series(1, exercise.sets) as series
on conflict (workout_exercise_id, set_number) do nothing;

insert into public.exercise_library (
  id, slug, name, movement_pattern, primary_quality, difficulty,
  equipment_requirements, contraindication_tags, substitution_slugs,
  default_rep_min, default_rep_max, default_set_min, default_set_max
) values
  ('51000000-0000-0000-0000-000000000001', 'back-squat', 'Back Squat', 'squat', 'strength', 'intermediate', array['barbell','plates','squat_rack'], array['knee_flexion','axial_load'], array['goblet-squat','leg-press'], 4, 8, 3, 5),
  ('51000000-0000-0000-0000-000000000002', 'goblet-squat', 'Goblet Squat', 'squat', 'general_fitness', 'beginner', array['dumbbells'], array['knee_flexion'], array['leg-press'], 8, 12, 2, 4),
  ('51000000-0000-0000-0000-000000000003', 'leg-press', 'Leg Press', 'squat', 'muscle_gain', 'beginner', array['selectorized_machine'], array['knee_flexion'], array['goblet-squat'], 8, 15, 2, 4),
  ('51000000-0000-0000-0000-000000000004', 'romanian-deadlift', 'Romanian Deadlift', 'hinge', 'strength', 'intermediate', array['barbell','plates'], array['hinge'], array['dumbbell-rdl'], 6, 10, 3, 4),
  ('51000000-0000-0000-0000-000000000005', 'dumbbell-rdl', 'Dumbbell RDL', 'hinge', 'general_fitness', 'beginner', array['dumbbells'], array['hinge'], array['romanian-deadlift'], 8, 12, 2, 4),
  ('51000000-0000-0000-0000-000000000006', 'bench-press', 'Bench Press', 'horizontal_push', 'strength', 'intermediate', array['barbell','plates','bench'], array['horizontal_push'], array['dumbbell-bench-press'], 4, 10, 3, 5),
  ('51000000-0000-0000-0000-000000000007', 'dumbbell-bench-press', 'Dumbbell Bench Press', 'horizontal_push', 'muscle_gain', 'beginner', array['dumbbells','bench'], array['horizontal_push'], array['bench-press'], 8, 12, 2, 4),
  ('51000000-0000-0000-0000-000000000008', 'seated-row', 'Seated Row', 'horizontal_pull', 'general_fitness', 'beginner', array['cable_machine'], '{}'::text[], array['band-row'], 8, 15, 2, 4),
  ('51000000-0000-0000-0000-000000000009', 'band-row', 'Band Row', 'horizontal_pull', 'general_fitness', 'beginner', array['bands'], '{}'::text[], array['seated-row'], 10, 20, 2, 4),
  ('51000000-0000-0000-0000-000000000010', 'lat-pulldown', 'Lat Pulldown', 'vertical_pull', 'muscle_gain', 'beginner', array['cable_machine'], '{}'::text[], array['seated-row'], 8, 15, 2, 4),
  ('51000000-0000-0000-0000-000000000011', 'split-squat', 'Split Squat', 'unilateral', 'athletic_performance', 'beginner', '{}'::text[], array['knee_flexion','balance'], array['goblet-squat'], 8, 12, 2, 4),
  ('51000000-0000-0000-0000-000000000012', 'hamstring-curl', 'Hamstring Curl', 'knee_flexion', 'muscle_gain', 'beginner', array['selectorized_machine'], array['knee_flexion'], array['dumbbell-rdl'], 10, 15, 2, 4),
  ('51000000-0000-0000-0000-000000000013', 'farmer-carry', 'Farmer Carry', 'carry', 'athletic_performance', 'beginner', array['dumbbells'], array['balance'], '{}'::text[], 1, 1, 2, 4),
  ('51000000-0000-0000-0000-000000000014', 'bike-conditioning', 'Bike Conditioning', 'conditioning', 'conditioning', 'beginner', array['cardio_equipment'], array['conditioning'], array['rower-conditioning'], 1, 1, 4, 10),
  ('51000000-0000-0000-0000-000000000015', 'rower-conditioning', 'Rower Conditioning', 'conditioning', 'conditioning', 'intermediate', array['cardio_equipment'], array['conditioning','hinge'], array['bike-conditioning'], 1, 1, 4, 10);

alter table public.client_intakes enable row level security;
alter table public.client_states enable row level security;
alter table public.organization_equipment enable row level security;
alter table public.exercise_library enable row level security;
alter table public.generated_prescriptions enable row level security;
alter table public.workout_sets enable row level security;
alter table public.training_library_items enable row level security;

create policy client_intakes_select_authorized
  on public.client_intakes for select to authenticated
  using ((select private.can_read_client_domain(organization_id, client_user_id)));
create policy client_states_select_authorized
  on public.client_states for select to authenticated
  using ((select private.can_read_client_domain(organization_id, client_user_id)));
create policy generated_prescriptions_select_authorized
  on public.generated_prescriptions for select to authenticated
  using (
    (select private.has_active_role(
      organization_id, array['owner']::public.organization_role[]
    ))
    or (select private.can_manage_client_domain(organization_id, client_user_id))
    or (
      status = 'assigned'
      and client_user_id = (select auth.uid())
      and (select private.has_active_role(
        organization_id, array['client']::public.organization_role[]
      ))
    )
  );

create policy organization_equipment_select_staff
  on public.organization_equipment for select to authenticated
  using ((select private.has_active_role(
    organization_id, array['owner','coach']::public.organization_role[]
  )));
create policy organization_equipment_insert_owner
  on public.organization_equipment for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.has_active_role(
      organization_id, array['owner']::public.organization_role[]
    ))
  );
create policy organization_equipment_update_owner
  on public.organization_equipment for update to authenticated
  using ((select private.has_active_role(
    organization_id, array['owner']::public.organization_role[]
  )))
  with check (
    (select private.has_active_role(
      organization_id, array['owner']::public.organization_role[]
    ))
  );
create policy organization_equipment_delete_owner
  on public.organization_equipment for delete to authenticated
  using ((select private.has_active_role(
    organization_id, array['owner']::public.organization_role[]
  )));

create policy exercise_library_select_members
  on public.exercise_library for select to authenticated
  using (
    is_active
    and (
      (
        organization_id is null
        and exists (
          select 1 from public.organization_memberships membership
          join public.organizations organization
            on organization.id = membership.organization_id and organization.status = 'active'
          join public.profiles profile
            on profile.id = membership.user_id and profile.account_status = 'active'
          where membership.user_id = (select auth.uid())
            and membership.status = 'active'
        )
      )
      or (select private.has_active_role(
        organization_id, array['owner','coach','client']::public.organization_role[]
      ))
    )
  );

create policy workout_sets_select_authorized
  on public.workout_sets for select to authenticated
  using (exists (
    select 1 from public.workout_exercises exercise
    where exercise.id = workout_exercise_id
      and (select private.can_read_workout(exercise.workout_assignment_id))
  ));

create policy training_library_items_select_owner
  on public.training_library_items for select to authenticated
  using ((select private.has_active_role(
    organization_id, array['owner']::public.organization_role[]
  )));

revoke all on public.client_intakes from anon, authenticated;
revoke all on public.client_states from anon, authenticated;
revoke all on public.organization_equipment from anon, authenticated;
revoke all on public.exercise_library from anon, authenticated;
revoke all on public.generated_prescriptions from anon, authenticated;
revoke all on public.workout_sets from anon, authenticated;
revoke all on public.training_library_items from anon, authenticated;

grant select on public.client_intakes to authenticated;
grant select on public.client_states to authenticated;
grant select, delete on public.organization_equipment to authenticated;
grant insert (
  organization_id, equipment_type, name, quantity, is_available, notes, created_by
) on public.organization_equipment to authenticated;
grant update (equipment_type, name, quantity, is_available, notes)
  on public.organization_equipment to authenticated;
grant select on public.exercise_library to authenticated;
grant select on public.generated_prescriptions to authenticated;
grant select on public.workout_sets to authenticated;
grant select on public.training_library_items to authenticated;

revoke all on function private.can_read_client_domain(uuid, uuid) from public, anon, authenticated;
revoke all on function private.can_manage_client_domain(uuid, uuid) from public, anon, authenticated;
revoke all on function private.calculate_client_state_v0(uuid, uuid) from public, anon, authenticated;
revoke all on function private.create_prescribed_sets() from public, anon, authenticated;
revoke all on function public.upsert_client_intake(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.generate_initial_prescription_v0(uuid) from public, anon, authenticated;
revoke all on function public.approve_generated_prescription_v0(uuid, text, text, date, jsonb) from public, anon, authenticated;

grant execute on function private.can_read_client_domain(uuid, uuid) to authenticated;
grant execute on function private.can_manage_client_domain(uuid, uuid) to authenticated;
grant execute on function public.upsert_client_intake(uuid, jsonb) to authenticated;
grant execute on function public.generate_initial_prescription_v0(uuid) to authenticated;
grant execute on function public.approve_generated_prescription_v0(uuid, text, text, date, jsonb) to authenticated;
