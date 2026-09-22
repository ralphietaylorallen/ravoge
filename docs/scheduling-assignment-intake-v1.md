# Scheduling, assignment, and intake V1

This release extends Ravoge's existing organization-scoped booking system. Client, Coach, and Owner scheduling all use the same `bookings` table and the existing gym-hours, availability, exception, closure, notice, buffer, and collision rules. The UI offers organization-local dates from today through today + 30 days; the database remains authoritative for every slot and mutation.

An active Coach may atomically claim only an active, unassigned Client in their gym. Direct assignment writes from authenticated clients are revoked; Owners retain the audited `assign_client_to_coach` operation and can reassign. Owners may schedule any active Coach and Client in their gym without changing primary assignment. Coach scheduling is limited to their own active assignments. Staff-triggered booking email queue entries are marked `skipped` because this release does not add a staff email delivery flow.

Each new structured baseline belongs to one immutable intake version. Squat, Bench, Pull-Ups, Rower/Versa, and InBody status/measurements are recorded separately from the existing Gate 4 state calculation. InBody may be `pending`, visibly incomplete, with no fabricated values. The V1 RPC saves intake, state, baseline, and completed InBody measurement in one transaction; existing prescription weights are unchanged.

The previously approved eight pre-workout question wordings and numeric scales could not be found in repository code, documentation, or Git history. Eight organization-scoped slots exist but start unconfigured. The Client UI clearly says approved product input is needed. Once all eight are configured, check-ins store numeric raw answers, normalized values, wording snapshots, timestamps, and one workout/session relation. No medical thresholds or Bayesian weights are inferred.

Coach and Client photo uploads are client-cropped WebP images in the existing private Supabase Storage bucket, using unique `organization/user/avatar/uuid.webp` paths. A prior object is removed only after the new object uploads and the profile path update succeeds. The old path format stays readable for existing profiles.

The migration must be applied before deploying the matching application code. Its focused RLS suite and all existing database suites must pass in an isolated local database, followed by authenticated UI checks, before any production release.
