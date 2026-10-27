# Group Class Programming and Mindbody proof gate

This release adds a separate Monday–Saturday plain-text notepad and recoverable publication history. It does not change personal-training generation, intake, assignments, scheduling, invitations, Auth, roles, imports or existing data. There are no Mindbody write calls.

Owners have access and can enable individual active Coaches on the Group Class Programming page. The existing membership/role/account/organization status remains authoritative on every request and in RLS. Permission revocation or membership deactivation applies to existing sessions. Clients have no access. No names or real emails are hard-coded. No Coach is automatically granted permission.

Each gym/date is unique. Save Draft preserves raw text without trimming or interpreting it. Changed saves append a recoverable version. Optimistic revision checks reject stale writes, and an advisory transaction lock handles concurrent first saves. Publishing locks the row and marks the saved revision as published; future draft edits do not overwrite it. Repeated publication of the same revision is idempotent. Each date is a separate operation so one failure does not roll back other selected dates. Retry checks only the currently published revision, never sends a newer draft. Read-only version history can restore old text into the editor without silently republishing.

All four new exposed tables have RLS, explicit read grants and no browser DML. Mutations use existing-style invoker RPC wrappers around private, restricted definer functions that validate the current authenticated user, active role and organization. The request never chooses a gym. Version and safe synchronization-attempt records are scoped to the same gym by composite constraints. No credentials are stored.

## Mindbody limitation confirmed in official documentation, 2026-10-27

Primary sources:
- OpenAPI: https://api.mindbodyonline.com/public/v6/swagger/doc
- Public reference: https://developers.mindbodyonline.com/ui/documentation/public-api
- Release notes: https://developers.mindbodyonline.com/Resources/ApiReleaseNotes
- Shared descriptions: https://developers.mindbodyonline.com/WebhooksDocumentation

`PATCH /public/v6/class/updateclassschedulenotes/{classScheduleId}` takes `UpdateClassScheduleNotesRequest.Notes`. The official description explicitly says every coming class instance for that ScheduleID gets the same notes. **Not called:** it would violate the date isolation requirement, even if accepted by the API.

`POST /public/v6/class/updateclass` takes `UpdateClassRequest.ClassId` and `ThemeName` only. A theme name is not a supported formatted daily-workout field. **Not called:** no assumption that undocumented properties work or display in the branded app. Shared `ClassDescription.Description` also affects all schedules using that description and is not used.

The documentation request succeeded (HTTP 200). No authenticated Mindbody sandbox mutation or branded-app display has been proven. There is no suitable verified destination, The Pitt's developer API access/credentials have not been supplied to this task, and no API key is requested through chat. Mindbody must confirm a supported occurrence-specific writable text field, formatting, safe repeat updates, and visibility to members in the branded app. This is a capability/approval gate, not proof the app definitely lacks the feature.

The unsupported integration portion stops here as requested. Owner → Mindbody Integration explains the blocker. Ravoge publication is separately tracked; synchronization records are `blocked`, never `synced`. No fake Connect, empty credential form, unimplemented class mapper, encrypted-key store or staff-token flow is presented as working. The calendar remains usable independently. No new Netlify secret is needed until a viable adapter can be built and verified. At that time use encrypted server-only storage and a protected environment encryption key; never client-readable plaintext, permanent staff passwords or keys in logs.

## Verification and operational follow-up

- Unit tests: date/DST boundaries, selection/empty filtering, statuses, exact raw text.
- Ordinary authenticated SQL contexts: Owner/authorized Coach, denied Coach/Client, cross-gym access, permission grant boundaries, immediate revocation/inactivity, raw formatting, saved revisions, publication scope, stale writes, idempotence, old published text preservation and no fake sync.
- Browser tests: Owner grants a synthetic Coach access; weekly saves, unsaved-change choices, selection and week confirmation, publication, updated draft/republish/history; wrong-role protection and phone/iPad/desktop overflow. Synthetic data only; real Pitt programming and memberships are never altered for QA.
- Existing regression suites and CI remain required. Apply the one additive migration exactly once after disposable database validation; no reset/reseed/backfill on production.
- Do not report the Mindbody pilot as live, working or synced until both a real approved API response and The Pitt's branded-app display pass the proof gate. No Mindbody class/booking data is changed by this release because it contains no Mindbody write path.
