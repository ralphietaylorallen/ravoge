# Completed sessions and six-week progress

The existing completion RPCs remain authoritative. A status-transition trigger
captures one version-1 factual report per workout ID, after results have been
saved. Capture failure is deferred without rejecting completion; the checked
repair RPC retries archiving, and the existing results provide a factual fallback.
The migration backfills report rows for completed workouts in chronological
order. It does not change workouts, sets, memberships, imports or client data.

Client profile history and authorized Coach/Owner profiles open the same shared
report. Current assigned Coaches retain historical continuity through the existing
Client-domain access helper; unrelated Coaches, Clients and gyms cannot read it.

## Facts and pending scores

Actual duration is used only when recorded. Missing fields remain unavailable.
Working sets exclude warm-up, preparation and cooldown; unknown legacy block
classification is shown explicitly. Adjusted and missed outcomes remain visible.
Volume uses actual repetitions and explicit external-load semantics: total load,
two bilateral dumbbells at per-hand load, or external added load. Per-side or
unilateral ambiguity, substitutions with unknown load basis, bands, bodyweight
and time/distance work are not converted into lifting volume. Units are converted
to pounds. Cardio shows recorded time/distance instead.

The single database score module stores version `session-execution-v0.1-pending`,
50/30/20 weights, actual source inputs and coverage. **The user approved keeping
scores pending until the completion, effort-deviation and comparable-performance
mappings are defined.** No numeric score is invented. Maximum remains 99.
Recovery and supplements never add points. Missing RPE is not guessed.

Comparisons require the same exercise and fully matching straight/interval
protocol, load convention, targets and rest, with complete, pain-free recorded
outcomes. Circuits with potentially different partners are excluded. Volume/time
change alone is not labeled a fitness improvement. The report retains the original
prescription beside actual results. No automatic supplement recommendation or
dose is created; the empty reviewed-guidance state is intentional.

## Recovery and generation

The existing recovery table is extended with actual occurrence time, notes,
reported feeling and soft deletion. Legacy occurrence times stay unknown.
Explicit entry IDs make saves retry-safe while allowing multiple real same-type
sessions. New RPCs derive the gym and Client from the completed workout and check
the active authenticated Client. Existing column permissions and RLS remain.
Temperature remains the existing optional cold-plunge water temperature in F/C.

The next generation reads bounded recent performance/feedback/pain and recovery
context through an authorized prescription ID. The private model projection
omits account/gym/workout IDs and redacts email/URL/phone/UUID text. Reported
recovery is not clearance or evidence for increasing load. Logging does not
rewrite existing drafts or assigned workouts. Coach review and all existing
equipment, safety and load validation remain in place.

## Six-week reports

Periods are exactly 42 local dates ending today or earlier in the gym timezone.
Workout completion and booked attendance are counted separately. Coverage,
missing data, compatible first/last exercise records, recorded RPE, adjustments,
recovery, existing measurements and goals remain factual.

Staff preview is live. Share creates an immutable dated snapshot plus the
Coach-authored summary and priorities. An advisory transaction lock and content
hash deduplicate repeated publication. Changed content requires the latest
previous share ID and explicit revision confirmation; prior versions are retained.
Clients can read only their own authorized snapshots. Print/save PDF uses the
browser's existing print dialog; there is no email dependency.

## Release safety

Migration: `20261105032234_session_reports_and_recovery.sql`.
Applied once to the verified Ravoge project after isolated CI passed. The file
timestamp matches the version assigned by Supabase's migration API; its SQL is
unchanged from the tested authoring file. Do not apply it again.
Hosted history has a remote-only historical email migration; do not repair or
reapply it. Always check hosted migration history before applying later changes.
Database fixtures and authenticated browser writes run only against CI's local
Supabase. Production smoke checks must preserve real Client records.
