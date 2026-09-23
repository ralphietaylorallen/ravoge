# Scheduling, assignment, and intake V1

This release extends Ravoge's existing organization-scoped booking system. Client, Coach, and Owner scheduling all use the same `bookings` table and the existing gym-hours, availability, exception, closure, notice, buffer, and collision rules. The UI offers organization-local dates from today through today + 30 days; the database remains authoritative for every slot and mutation.

An active Coach may atomically claim only an active, unassigned Client in their gym. Direct assignment writes from authenticated clients are revoked; Owners retain the audited `assign_client_to_coach` operation and can reassign. Owners may schedule any active Coach and Client in their gym without changing primary assignment. Coach scheduling is limited to their own active assignments. Staff-triggered booking email queue entries are marked `skipped` because this release does not add a staff email delivery flow.

Each new structured baseline belongs to one immutable intake version. Squat, Bench, Pull-Ups, Rower/Versa, and InBody status/measurements are recorded separately from the existing Gate 4 state calculation. InBody may be `pending`, visibly incomplete, with no fabricated values. The V1 RPC saves intake, state, baseline, and completed InBody measurement in one transaction; existing prescription weights are unchanged.

The previously approved eight pre-workout question wordings could not be found in repository code, documentation, or Git history. Per the UI-completion instruction, the eight organization-scoped slots use configurable temporary labels (Question 1–8) and 1–10 controls, internally marked `pending_product`. Final wording still needs product approval. Check-ins store stable question IDs, versions, raw answers, normalized values, wording snapshots, timestamps, and one workout/session relation. No medical thresholds or Bayesian weights are inferred.

Coach and Client photo uploads are client-cropped WebP images in the existing private Supabase Storage bucket, using unique `organization/user/avatar/uuid.webp` paths. A prior object is removed only after the new object uploads and the profile path update succeeds. The old path format stays readable for existing profiles.

## UI/workflow completion

Owner client rows are full-card links with search and Coach/status filters. The client workspace separates Overview, Schedule, Intake, Progress, Workouts, and Notes. Coach assignment uses a keyboard-accessible native dialog and immediate revalidation. Booking controls retain database slot validation, shared schedule records, cancellation, and rescheduling.

Coach workspaces separate assigned and unassigned clients. A dedicated workout execution route records complete, failed (with structured reason), not-completed, and exceeded-target outcomes without changing prescribed targets. Completion requires every set to have an outcome and a real duration. Notes and summaries are persisted; no fabricated performance score is added. Latest intake readiness is labeled with its source/date, not presented as today's readiness.

Intake is a five-step evaluation: session check-in, strength, conditioning, InBody, review. Photo saves revalidate the profile, Owner directory/Team, and Coach client views. The shared cream/gold operational layout uses a dark sidebar, compact page headers, and tablet/phone layouts.

The Client booking page must not query another user's membership row: client RLS intentionally hides it. `get_my_assigned_coach()` provides only that authenticated Client's active assigned Coach's public profile fields, validating both memberships, profiles, and organization. It accepts no organization/user selector and does not broaden table policies.

## Release verification

Apply all four versioned migrations before deploying the matching code. `npm run test:db` includes the two new operational suites; each uses ordinary authenticated contexts with rollback fixtures. CI also runs all SQL suites against local Supabase. Other assigned clients have read-only name/Coach labels; no claim button or private-record access is exposed.

For authenticated browser acceptance, set `RAVOGE_RUN_DISPOSABLE_QA=yes` and run `node scripts/verify-operations-ui.mjs` after a production build. The runner verifies the Ravoge project ref, creates a uniquely named isolated QA gym with random runtime-only identities, exercises real UI/server actions and user-scoped Storage, and removes its records/photos afterward. Set `PLAYWRIGHT_BASE_URL=https://ravoge.com` for post-deployment verification. No existing gym, client measurements, or personal credentials are used. Temporary SQL/state files are gitignored. The ownerless-organization cleanup exception is session-local and limited to the generated fixture IDs; it is never used by application tests or runtime code.

New intake/check-in foreign-key indexes address this release's performance-advisor findings. Remaining pre-existing advisor notices concern two unrelated missing indexes, unused indexes, intentionally authorized SECURITY DEFINER RPCs, private deny-all signup-intent storage, and disabled leaked-password protection. Do not remove auth grants or weaken RLS to silence generic advisor warnings.
