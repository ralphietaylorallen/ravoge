# Deterministic starting loads and set-history learning

Extends the existing intake → AI structure → private draft → Coach approval →
Client set player. AI still cannot supply absolute loads or percentages.
`complete_pound_prescription` runs the existing validators first, then resolves
loads inside the database. No new result store or history rewrite.

## Versioned coaching defaults

`exercise_load_rules` has global defaults plus immutable gym-specific revisions.
Active Owners write only new revisions for their own gym through a narrow RPC.
Coaches can read their gym rules; Clients cannot read/write them. No direct
application-role mutation grants. Owners review defaults at
`/owner/training-library/load-rules`.

These are conservative, editable coaching starting defaults, **not universally
validated cross-exercise coefficients**:

- Goblet squat: 25% of a matching back-squat e1RM, total implement.
- Loaded split squat/reverse lunge/step-up: 15%, total external load, displayed
  as half per hand for paired dumbbells. Existing bodyweight variations remain.
- DB bench/incline press: 50%/40% of bench e1RM total, half per hand.
- Back squat, bench, deadlift, RDL and overhead press: at most 75% of their own
  measured variation e1RM, further reduced for prescribed reps/RPE.
- Other weighted exercises: no invented conversion; confirmed technique load
  or explicit Coach calibration. This includes front squat, rows, curls, hip
  thrust, cable/machine movements, kettlebell deadlift, carries and sled work.
- Bodyweight/band/time/distance prescriptions remain their actual modality.

Five explicit canonical movements are added (deadlift, overhead press, and three
loaded unilateral variations); existing bodyweight definitions are unchanged.
Their restriction metadata is inherited from the closest existing curated
movement, not omitted to bypass safety filtering. Defaults cover 55 exercises.

## Resolution and evidence

1. Recent (90 days), comparable same-canonical set history.
2. Explicit Owner-approved equivalent with matching equipment and load semantics.
3. Matching measured intake anchor + rule (no RDL/deadlift interchange).
4. Lightest confirmed achievable technique load.
5. `Calibration required — choose the first technique load before approval.`

Comparable history uses the same format and nearby repetition target. Actual
substitutions are not misattributed to the originally prescribed movement.
All sets must be recorded, successful, pain-free and below target RPE before
one smallest available increment. Reductions use the lowest successful working
load; failed/incomplete work repeats a successful load or reduces one increment.
Pain stops automatic progression and flags Coach review. Unrecorded sets never
imply completion. Raw `workout_sets` are preserved.

Every generated row stores rule/version, anchor, unrounded calculation, equipment
rounding, source workout and an explanation. Coach changes remain authoritative
and the assigned row records `Coach override`. Clients see load semantics and
band selection, not unrelated Client history. Drafts remain private.

Only exact saved sizes establish automatic loads. Ranges do not establish
intermediate sizes. Bars plus confirmed matched plate pairs enumerate achievable
totals; one pair per confirmed plate size, never unlimited plates. Paired
dumbbells require a separate inventory entry for each size with quantity ≥2;
a mixed-size count does not establish pairs. Never round up. Unknown inventory
requires Coach confirmation instead of inventing a load.

Optional deadlift/RDL and overhead-press anchors use versioned intake custom
fields, canonical internal units and pounds at the UI boundary. Untested values
contain no fabricated measurements. Squat/bench also support explicit Not tested.

## Pitt catalog

Before repair: 124 imported, 0 approved, 0 eligible; 50 active exercises. Raw
normalized-content checksum: `157f978e67f7e9e46ce87fe0c8c07ec5`.
No raw import is rewritten or automatically published. Recognizable names can
be suggested while unresolved sets, EMOMs, circuits, per-side and percentage
instructions remain visibly incomplete for explicit Owner review. The existing
publication RPC recalculates the gym profile and retrieval immediately uses
current approved compatible sources. Owner counts distinguish imported, approved
and equipment-eligible sources, before Client-specific restrictions.

Synthetic verification sources are explicitly labeled QA, never Pitt programming.
A real Pitt source must be accurately reviewed/published by its authorized Owner
before a real Pitt influence claim can be proven. No claim of readiness follows
from synthetic source credit alone.

## Verification

One additive migration: `20261022191400_deterministic_starting_loads.sql`.
Before application, all 24 SQL suites execute with the pending DDL in one
rollback-only transaction. `starting_loads_rls.sql` tests the actual SQL kernel,
ordinary Owner/Coach/Client RPCs, scope denial, final-set learning, private
function permissions, and authoritative Coach edits. Legacy assertions are
scoped to their synthetic organization and updated to check confirmed technique
loads rather than the superseded always-null behavior.

`RAVOGE_BETA_QA=yes RAVOGE_QUALITY_QA=yes RAVOGE_LOAD_QA=yes
node scripts/verify-beta-ui.mjs` runs the disposable multi-session browser proof.
Set `PLAYWRIGHT_BASE_URL` to a verified preview/production and
`RAVOGE_LIVE_WORKOUT_QA=yes` to require real OpenAI generation (fallback fails).
The helper creates and cleans only its own synthetic gym/accounts. No real
passwords or emails are changed. Physical iPad Safari installation still needs
hardware testing; viewport emulation does not establish installation behavior.

Official references reviewed: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Supabase changelog](https://supabase.com/changelog), and
[OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
