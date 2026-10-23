# Owner-authorized raw gym references

Uploading a workout authorizes reference use, not claims of verified exercise
mapping. `reference_enabled` is independent of the optional structured-template
status. Raw rows and review revisions remain immutable. New authenticated Owner
imports default on. Existing raw imports require one reversible Owner bulk action.
Select all is evaluated server-side across every matching page; search uses the
same literal workout-title substring in the page and RPC. Delete is recoverable
archiving, not raw-data destruction. Restore does not automatically re-enable.

The only write API is an active-Owner scoped RPC. No organization ID or actor is
accepted from the browser. Foreign IDs fail atomically. Existing RLS remains on;
Clients cannot read the library and Coaches cannot change reference status.
Assigned Coaches receive only their own gym's source signatures through the
existing guarded generation-input API.

## Retrieval and privacy

An inexpensive cached lexical signature recognizes canonical exercise names,
explicit format tokens and limited style terms. It does not infer sets, reps,
percentage loads, unknown combinations, or claim raw protocols are verified.
No arbitrary prose, personal names, email, filenames or notes are sent to OpenAI.
Retrieval searches all enabled records locally and ranks goal, duration, movement
patterns, format, compatible equipment/restrictions and prior recorded results.
Up to five raw excerpts are projected as canonical aliases and allowlisted style
signals. Structured templates retain coherent-block safety handling.

Only existing canonical, equipment-compatible candidates can become assigned
exercises. Existing structure/volume/time/RPE validators and deterministic pound
load rules remain authoritative. AI adds no absolute load. Source credits are
validated again against the current organization catalog, and the saved snapshot
retains only used source versions plus the catalog digest, not 124 copies.
Added movements are derived from canonical source matches and shown to Coaches.

Provider failure offers an explicitly labeled reference-inspired deterministic
draft when a safe compatible adaptation is possible. It never pretends OpenAI
succeeded or silently labels generic programming gym-informed. Stale snapshots
or unsatisfied safety constraints fail clearly, preserve saved inputs, and allow
retry/manual creation. Coach approval remains mandatory before Client visibility.

## Evidence cache

`lib/programming-evidence.ts` is a versioned, reviewed cache of concise principles
and primary-source links, reviewed 2026-10-22 and due for review after 90 days.
No live research is claimed or purchased at generation time. A source-cache
refresh requires reviewing/updating that small versioned interface; automated
web research and Owner-triggered research retrieval are deliberately deferred
rather than presenting an unverified web response as established guidance.
Sources: [ACSM 2026 overview of reviews](https://pubmed.ncbi.nlm.nih.gov/41843416/)
and [US Physical Activity Guidelines](https://odphp.health.gov/our-work/nutrition-physical-activity/physical-activity-guidelines/about-physical-activity-guidelines/questions-answers).

## Release verification

`gym_references_rls.sql` covers all 124 rows, reversible decisions, no fake
template publication, raw checksum preservation, source credits, private drafts,
ordinary-role/cross-gym denial and new-import defaults. `gym-references.spec.ts`
uses disposable independent Owner/Coach/Client sessions for the complete browser
flow, including 125th immediate import and responsive layouts. Enable with
`RAVOGE_REFERENCE_QA=yes RAVOGE_QUALITY_QA=yes RAVOGE_BETA_QA=yes` and the existing
`scripts/verify-beta-ui.mjs`; add `RAVOGE_LIVE_WORKOUT_QA=yes` on a verified
preview/production to require real OpenAI rather than the tested local fallback.
Real Pitt bulk enable and Ralphie proof must be recorded separately from QA.

## Primary user workflow

Owner uploads use the existing parser and atomic import RPC in one server action.
Preview-before-upload remains optional under Advanced. The normal library reports
workouts saved and gym references enabled; mapping, template statistics and load
rules are optional. Bulk controls sit above the list and use one keyboard-accessible
in-page confirmation, with cancellation leaving all reference decisions unchanged.

Coach creation still uses the existing intake-safety review, equipment filters,
load calculations and history. The review page leads with client context, gym
workout names, starting loads and editable exercises. Optional percentage loads,
protocol controls and technical evidence remain under Advanced, mounted in the
same form so unchanged targets are preserved. Assign is the existing approval
and assignment transaction, not an additional gate. Validation opens any hidden
Advanced section containing an invalid field. Readiness pain warnings stay visible.

The focused browser suite now enters equipment and intake through visible forms,
uploads without a preview/save gate, checks cancel/keyboard confirmation, edits
and assigns, completes the workout as the independent Client, then creates another
draft and verifies that completed results reached its history snapshot. Assertions
may read stored state; workflow mutations do not use test routes or direct RPCs.
Disposable QA proof must never be described as real Pitt/Ralphie acceptance.
This usability change requires no database migration, data rewrite or new service.
