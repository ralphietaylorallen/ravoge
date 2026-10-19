# Equipment and pound-unit boundary

All current weight inputs and presentation use pounds (lb). Body-fat percentage,
distance, time and effort keep their distinct units. Shared conversion lives in
`lib/weight-units.ts`: **1 kg = 2.20462262185 lb**. Canonical assessment/baseline
columns and existing goal JSON keys remain in kilograms. Convert exactly once on
the server input boundary and once on presentation/provider projection. Optional
blank values remain absent, never zero. Read-only summaries show one decimal;
canonical goal edit defaults retain precision to prevent cumulative resave drift.
Existing assessment columns retain their existing three-decimal storage precision.

## Individual inventory, not invented loaded capacity

Owner ranges describe individual unloaded bars, individual plates, or individual
dumbbells/kettlebells/medicine balls and selectable machine loads. Exact positive
decimal sizes are optional, normalized and sorted; unknown capacity/quantities
remain unknown. Individual bar/plate maxima are **not** a total loaded bar limit.

The matched-pair confirmation proves one pair per listed plate size. Neither an
unknown count nor a list of sizes proves unlimited pairs. Assembled loading uses
one saved bar plus zero or one confirmed pair of each size. Additional pair-count
inventory is deliberately not invented. At most 16 distinct paired sizes bounds
the combination calculation. Percentage prescriptions require a Coach-confirmed
reference in lb and round **down** to the nearest proven achievable load. Current
inventory is checked again atomically when assigning; a failed check rolls back
the whole assignment. Unknown increments require Coach confirmation rather than
a claim of verified capacity.

## History and generation

New assignments/sets explicitly record lb. Known historical kg outcomes convert
for display; viewing never updates them. Historical unlabelled loads are labelled
unrecorded, not guessed to be pounds or kilograms. Newly reviewed immutable source
revisions retain explicit unit metadata; every original raw import row and prior
review remains unchanged. A review of an unlabelled source load requires deliberate
Owner confirmation. Raw source evidence remains original evidence, not silently
rewritten or auto-published.

OpenAI receives a narrow, deidentified pound projection of body measurements,
goals, equipment capabilities and known-unit performance. No private notes,
identities or credentials are added. It still must leave absolute/percentage
loads blank: body composition or inventory is not evidence of lifting capacity.
Unexpected numeric loads or kilogram weight text are rejected, with the existing
truthful deterministic fallback. Fallback source loads are not guessed or copied
across Clients. Coach review selects/validates appropriate lb loads, approves and
assigns; Clients cannot see drafts. Existing safety, restriction, equipment,
published-source and role checks remain in force.

## Migration and PWA

`20261019182143_equipment_pound_units.sql` is additive: optional equipment ranges,
sizes and explicit load-unit columns, plus guarded pound-aware RPC extensions.
No historical backfill, canonical column rename, raw-row update, automatic source
publication, reset, reseed or old-migration reapplication is part of this repair.
`20261019185021_equipment_minimum_bar_guard.sql` additionally enforces the exact
known unloaded bar minimum when the optional range is blank, without data updates.
Existing authenticated APIs remain compatible. New functions revoke PUBLIC/anon
execution; private data helpers remain inaccessible. The constraint's pure
argument validator alone allows authenticated execution; it reads no data and is
not security-definer.

The existing service worker does not cache authenticated application responses.
They remain network-only, so a normal reload gets updated UI without uninstalling
the PWA or clearing account sessions. No unrelated cache system was introduced.

## Verification

Focused unit coverage includes exact conversions, blank/invalid inputs, repeated
canonical edit roundtrips, historical known/unknown units, individual ranges,
decimal/deduplicated sizes, bounded matched-pair loading, percentage rounding and
the deidentified provider projection. The ordinary-authenticated SQL suite covers
Owner editing, Coach/Client/cross-gym denial, stale snapshots, invalid increments,
unit/percentage tampering, atomic approval and explicit pound outcomes. The
authenticated quality browser suite also exercises equipment edits, pound intake
and targets/reload, generation/review, Client logging and Coach result review at
phone/iPad portrait/landscape widths. Run existing suites unchanged in intent;
do not count environment skips or fallback as proof of a live OpenAI result.

Pre-release verification on 2026-10-19 passed: `npm run lint`,
`npm run typecheck`, `npm run test:unit` (47 tests), `npm run test:db`
(23 rollback SQL/RLS suites), and `node scripts/with-ravoge-public-env.mjs build`.
`CI=true node scripts/with-ravoge-public-env.mjs test:e2e` passed 190 tests;
50 fixture/platform-gated cases were skipped. Separately opted-in disposable
authenticated runs passed the pound-quality workflow (1), beta flow (1),
operations flow (1) and private-photo checks (2). Local generation deliberately
uses the safe fallback. Preview/production provider verification and deployment
IDs belong in the release PR; these local results alone are not a live-release claim.

Live verification of the first deployment also encountered rejected provider
output. The existing two-attempt limit and fallback remain intact. A focused
follow-up supplies the repair attempt with a fixed application-owned constraint
hint (protocol, duration, grouping, numeric loads, etc.), rather than a generic
retry instruction. Only fixed issue codes and attempt numbers are logged; no
rejected output, client context or provider exception text is retained. All
original validators still run on the repaired result; repeated failure still
returns the truthful safe fallback. Three focused regression tests cover these
boundaries, bringing the unit total to 50. No additional migration is needed.

The focused browser checks also caught and repaired equipment-form native reset
changing the displayed type after save, and the chart tooltip's multi-child
`<title>` hydration mismatch. Tooltips now render a single string and deterministic
UTC chart dates. Security headers were not relaxed for development diagnostics.

Post-migration advisors reported no new anon-executable RPC, exposed table without
RLS, missing function search path or new unindexed foreign key. Six new guarded
authenticated RPCs appear in the broad [security-definer inventory warning](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable);
their role/assignment/isolation checks are covered by ordinary-user tests. Existing
token-bound anon entry RPC warnings and the intentionally deny-all private signup
intent table remain unchanged. Existing [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
is disabled (an Auth configuration decision outside this units repair). Two old
[unindexed foreign-key notices](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)
and unused-index information remain; no unrelated indexes were removed.

## Changed files

- `app/client/workout-player-actions.ts`
- `app/client/workouts/[workoutId]/page.tsx`
- `app/coach/actions.ts`
- `app/coach/clients/[clientId]/page.tsx`
- `app/coach/clients/[clientId]/prescriptions/[prescriptionId]/page.tsx`
- `app/coach/workout-actions.ts`
- `app/owner/clients/[clientId]/page.tsx`
- `app/owner/equipment/actions.ts`
- `app/owner/equipment/page.tsx`
- `app/owner/reports/page.tsx`
- `app/owner/training-library/actions.ts`
- `components/baseline-summary.tsx`
- `components/client-workout-player.tsx`
- `components/equipment-form.tsx`
- `components/intake-form.tsx`
- `components/prescription-review-form.tsx`
- `components/progress-chart.tsx`
- `components/training-library-review.tsx`
- `components/workout-execution.tsx`
- `components/workout-form.tsx`
- `docs/equipment-pound-units.md`
- `lib/equipment-weights.ts`
- `lib/intake-targets.ts`
- `lib/training-review.ts`
- `lib/weight-units.ts`
- `lib/workout-generation-quality.ts`
- `lib/workout-generation.ts`
- `package.json`
- `supabase/migrations/20261019182143_equipment_pound_units.sql`
- `supabase/migrations/20261019185021_equipment_minimum_bar_guard.sql`
- `supabase/tests/equipment_pound_units_rls.sql`
- `tests/beta-readiness.spec.ts`
- `tests/operations-ui.spec.ts`
- `tests/unit/weight-units.test.ts`
- `tests/unit/workout-generation.test.ts`
- `tests/unit/workout-quality.test.ts`
- `tests/workout-quality.spec.ts`
