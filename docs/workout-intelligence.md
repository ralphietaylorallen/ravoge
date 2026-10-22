# Workout intelligence: intent → retrieval → private draft

This extends the existing versioned intake, structured Owner review, gym profile,
approved exercise library, safety filters and Coach approval/assignment flow.
It does not reprocess imports or automatically publish programming.

## Flow and cost boundary

1. Coach saves the existing intake. An optional structured training focus makes
   5K running, muscle growth or fitness/fat-loss intent explicit without sending
   private injury descriptions, identities or free-text notes to OpenAI.
2. One compact OpenAI request selects bounded objectives, compatible movement
   patterns, methods, formats, progression focus and conservative intensity.
   Invalid/unavailable analysis uses a clearly labeled structured-goal fallback.
3. Search **all** current, confirmed, published organization reviews locally,
   using their existing goal/protocol classifications. Rank by goals, analysis,
   patterns, methods, formats and duration; pass at most three relevant sources
   to the existing generator. No whole-library prompt, embeddings or bulk AI
   reclassification. Incompatible grouped blocks are excluded intact; independent
   compatible blocks may remain. Unresolved/draft sources are never eligible.
4. Existing bounded generation (at most two attempts) adapts those structures,
   current gym profile, actual equipment/facilities and recent performance.
   AI absolute loads stay blank; the deterministic database load engine then
   resolves confirmed starting pounds or explicit calibration (see
   [starting loads](deterministic-starting-loads.md)). Existing safety, units,
   duration, protocol and equipment validators remain enforced.
5. Map model reference aliases back to current approved review IDs server-side.
   The database rechecks sources, intensity and the complete optimistic snapshot.
   Store actual source revisions and bounded analysis, not the full library, in
   the existing audit context. The draft remains invisible to the Client until
   the existing Coach review and atomic approval/assignment succeed.

Validated intent plans have a best-effort, process-local five-minute cache (64
entries), keyed by a hash of the deidentified context and existing configured
model. Changed goals, restrictions, resources, readiness or recent performance
invalidate the key. No cross-request persistence guarantee on serverless hosts.
Maximum paid requests: one planner plus the existing two bounded generation
attempts; cached intent avoids the planner call. Existing Coach rate guard stays.
No provider/model change or new credentials are required.

## Publication and fallback

Owner uses the existing Training Library review screen to confirm every source
interpretation and publish it. Complex/ambiguous EMOM, timed, per-side or load
instructions must remain in review until accurately resolved. Raw source values
are immutable and unchanged by this migration.

The Pitt was checked before this release: **124 imported rows, zero approved
published sources**. Those rows are not silently made eligible. Gym-history
influence begins as the Owner approves them. Until then, the existing safe
general-library fallback remains explicit in Generation evidence. The evidence
also shows stored/approved/compatible counts, Client focus, analysis method and
credited historical revisions. A planned progression focus is guidance for Coach
review, not automatic load progression, medical clearance or a promised outcome.

## Verification

- Unit tests cover the three requested profiles, all-124 retrieval, gym-specific
  sources, coherent block exclusion, deidentification, cache invalidation,
  source-credit validation and intensity bounds.
- `supabase/tests/workout_quality_rls.sql` uses ordinary authenticated contexts
  to test current approved source eligibility, stale/unpublished exclusion,
  invalid/cross-gym credits, grouped equipment compatibility, private function
  permissions and preserved Client draft isolation/approval.
- Existing authenticated browser suite has an opt-in intelligence mode:
  `RAVOGE_BETA_QA=yes RAVOGE_QUALITY_QA=yes RAVOGE_INTELLIGENCE_QA=yes` through
  `scripts/verify-beta-ui.mjs`. It uses a disposable organization and independently
  authenticated Owner/Coach/Client accounts, not real member passwords.
  `RAVOGE_LIVE_WORKOUT_QA=yes` additionally requires actual OpenAI analysis and
  generation (fallback fails that check). It verifies source audit, untouched raw
  imports, mobile/tablet overflow and Coach review → assignment → Client execution.
