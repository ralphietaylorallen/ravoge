# Workout-quality extension

This branch extends the working PR25/26 account, invitation, scheduling, intake,
photo, deterministic prescription, review and assignment flow. Those systems are
not replaced. Original imported rows remain immutable, and no imports are
automatically published. Production application and migration verification are
separate release gates; code existence is not evidence that the release is live.

## Data and authorization

- Equipment retains historical IDs and nullable quantities. Explicit `rower` and
  `ski_erg` types distinguish machines from generic cardio. Potential normalized
  duplicates are rejected on new resource creation, never merged or deleted.
- `organization_facilities` records a measured turf/open training area with
  availability, usable length and unit. The generator cannot infer a facility
  from an equipment label. Turf distances must fit a confirmed available lane.
- New curated exercises have movement, muscles, purpose, level, measurement,
  laterality, restriction, regression/progression/substitution and cue metadata.
  These are curated global records, not automatically approved import names.
- Version-2 `training_library_reviews` retain grouped and timed structures next
  to legacy immutable fixed-set revisions. Owner confirmation and source evidence
  are mandatory for publication. Unknown/incomplete protocols stay in review.
  Exclusion/unpublication removes a source from retrieval. Bulk publication only
  accepts complete, individually confirmed revisions. Raw imports never change.
- `gym_programming_profiles` is append-only and scoped to active gym staff. Its
  statistics and exact source versions come only from current published reviews.
  Owners can correct the human summary and choose supported format/emphasis
  preferences. A free-text summary is not sent to the model as instructions.
- Only an active assigned Coach can request training context, complete a private
  draft or atomically approve/assign it. Current intake safety, resources, units,
  volume and duration are checked again in the database. RLS/grants deny anonymous,
  unrelated Client and cross-organization access. Existing membership/assignment
  checks are reused; browser role intent and user metadata grant no access.

## Structured targets and compatibility

Each exercise retains its existing sets/reps/load and optional `protocol`:
block, format, group, measurement, work duration, distance/unit, EMOM slot,
AMRAP block duration, percentage load, per-side intent, RPE and approved
substitutions. Circuits/rounds use sets as visits per movement; AMRAP uses one
block and does **not** invent a round count. For time/distance only, legacy
`reps=1` is a compatibility sentinel, not a repetition prescription. The player
and structured review show the actual measurement. A database trigger prevents
version-2 prescriptions being silently flattened into legacy fixed-set targets.

OpenAI may select only compatible approved aliases. It cannot invent absolute
or percentage loads or approve substitutions. Owner-reviewed source percentages
are retained; a Coach must establish the reference load. Generated drafts are
bounded, stateless, tool-free and validated; provider failure retains a clearly
labeled deterministic draft. Raw notes, names, contact information, gym/account
IDs, source titles and private asset paths are excluded from provider requests.
Only curated global exercise names and anonymous source/group aliases are sent.
Past logged loads are normalized only when their unit is known; old unitless
loads are not treated as kg. Recent readiness is context, not a silent mutation
of an approved workout. Unreviewed new pain blocks new generation until reviewed.

The evidence anchor is the [ACSM 2026 position stand](https://pubmed.ncbi.nlm.nih.gov/41843416/):
goal-specific progressive resistance training, appropriate sequencing, manageable
volume and recovery. Ravoge's numeric validation bounds are conservative product
safeguards, not individual medical advice or a claim that the source mandates
those exact limits. Coach safety review remains mandatory.

## Player and readiness

The existing assigned-workout routes support structured block cards, exact units,
progress, set outcomes, optional measured performance, approved substitutions,
rest/work timers, pain notes and end-of-session difficulty/feedback. Targets are
not overwritten by results. Modified/missed work is recorded honestly, not
converted to successful sets. Legacy manual workouts keep their existing path.
One current set opens at a time; circuit/station/EMOM guidance advances through
the movements round by round. Other sets remain manually expandable. Approved
substitutions must retain the original measurement and per-side convention;
different targets require a separately prescribed exercise.

Five versioned 1–5 readiness questions and an optional pain note can be completed
on the Coach's iPad or Client's phone. An assigned Coach accepts, declines or edits
the recommendation and records an intended action. No recommendation RPC changes
an approved prescription. Existing versioned eight-question histories and
scheduled-intake answers remain intact.

## Migration and release gate

New migrations, in order:

1. `20261019051718_workout_quality_foundation.sql`
2. `20261019051942_structured_programming_quality.sql`
3. `20261019052328_structured_workout_generation.sql`
4. `20261019052736_workout_player_readiness.sql`
5. `20261019061349_readiness_client_lookup_index.sql`
6. `20261019062350_workout_substitution_units.sql`

At this checkpoint the first five are applied exactly once to the verified
existing Ravoge project. The sixth passed all 22 ordinary-role SQL/RLS suites
in a bounded rollback-only transaction and is awaiting its final apply gate.
The first five also passed the hosted full database suite; fresh CI passed all
22 suites after a local database reset. Never reset the hosted database.
Check production history before applying pending files exactly once. No hosted
reset/reseed/truncation, production password changes, or automatic publication.

Unit tests mock the provider. `RAVOGE_BETA_QA=yes RAVOGE_QUALITY_QA=yes` with
`node scripts/verify-beta-ui.mjs` creates only disposable fixture accounts/gym,
runs the three-client Owner-review → generation → approval → player test and
cleans up only its own records. `RAVOGE_LIVE_WORKOUT_QA=yes` requires actual
OpenAI-assisted results; fallback is not a passing substitute for that assertion.
Never print browser error-context snapshots that might contain test passwords.

The real Pitt currently has 124 raw imports and zero published sources (read-only
baseline). Disposable QA publication does not prove real Pitt personality. Real
Owner review/publication must be reported separately. With explicit user approval,
the existing Pitt inventory was extended with SkiErgs and rowers (unknown
quantities) and its confirmed 25-yard turf, without changing existing records.
No real users, memberships, passwords, imported rows or publication statuses
were changed. Email delivery remains
unproven without Resend/sender configuration, and physical Safari install/camera
testing is a manual device check, not something Chromium viewports prove.
