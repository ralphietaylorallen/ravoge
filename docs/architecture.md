# Ravoge product scope and architecture

## Product direction

Ravoge is purchased by gym owners and supports three distinct audiences:

- Owners manage their gym, coaches, and clients.
- Coaches sign in individually, including on shared gym iPads.
- Clients sign in to a private view containing only their own profile and training information.

Planned product areas include adaptive workouts, cross-coach session continuity, progress reporting, booking, payments, and communication. Those capabilities are product direction, not implemented behavior in this milestone.

## Foundation decisions

### Application stack

- Next.js App Router with TypeScript provides one web application and route-level layouts.
- Tailwind CSS supplies responsive utility styling; a small global layer holds design tokens and reusable interaction treatments.
- React Server Components are the default. Client components should be added only when interaction requires browser state.
- Inter and Space Grotesk are bundled from pinned `@fontsource-variable` packages, avoiding runtime font requests and ensuring real WOFF2 files ship with the application.
- `next/image` handles project-local imagery and responsive image delivery.

### Route model

- `/` is the public marketing page.
- `/owner` is reserved for the owner application.
- `/coach` is reserved for the individual coach experience, including shared-device sign-in.
- `/client` is reserved for the client’s private experience.

The three application routes are protected Server Components. Unauthenticated users return to `/login`; authenticated users with the wrong role are redirected to the dashboard selected by their active database membership.

### Design system

The visual foundation uses a continuous dark canvas instead of alternating light/dark checkerboard sections. Sharp one-pixel borders, minimal corner rounding, Space Grotesk display type, and restrained champagne accents create hierarchy without decorative excess.

Core palette:

| Token | Value | Use |
| --- | --- | --- |
| Ink | `#050606` | Primary background |
| Deep | `#051919` | Tonal background depth |
| Gunmetal | `#24312E` | Elevated surfaces |
| Muted | `#53544D` | Low-emphasis type and dividers |
| Bronze shadow | `#8A8171` | Action, priority, and quiet brand emphasis |
| Champagne | `#B4AC9B` | Accent and secondary type |
| Soft | `#E6E4DF` | Supporting foreground |
| Paper | `#F6F5F3` | Primary foreground and CTAs |

### Account and tenancy foundation

Supabase Auth is the identity source; credentials are never duplicated in application tables. `profiles` contains display identity only. `organizations` represent gyms, and `organization_memberships` carries database-authoritative owner, coach, or client access. Browser role selection and `user_metadata` are never authorization sources.

Owner self-registration first records an expiring, server-controlled intent containing the normalized email, gym name, and a hash of a random browser token. An authenticated database function matches the Auth email to that durable intent and creates the constrained organization request. This survives an interrupted request or expired browser cookie without consulting `user_metadata` for authorization, cannot attach the user to an existing gym, and is idempotent for an already-provisioned Owner. Direct Data API inserts into organization creation requests are denied. An identity with any membership or a pending organization invitation cannot use this path, preventing Coach or Client onboarding from being changed into first-Owner access.

The organization request trigger creates the new organization and first Owner membership atomically. The first active owner becomes the primary owner (the organization owner of record). An organization can have multiple owners, but every owner has a separate Supabase Auth identity and membership—shared credentials are not supported. Additional owners and coaches join through a cryptographically random, expiring invitation whose hash is stored in the database. The invitation fixes the intended email, gym, and role. A coach-created client invitation also creates the corresponding assignment after acceptance.

The primary-owner marker is immutable in this beta. Database triggers prevent deleting or deactivating the primary owner and prevent removal of an organization's final active owner. A later, separately reviewed operation must atomically transfer the primary marker before destructive organization actions, account deletion, or billing ownership changes are introduced. Additional owners otherwise receive normal owner access within the organization.

Invitation acceptance supports both new and existing Ravoge Auth identities. A confirmed, exact-match invited email may accept the opaque token after signup or login; the server never accepts organization or role as invitation-acceptance input. An account has at most one active organization membership during this MVP, avoiding ambiguous dashboard routing while preserving inactive history. RLS rechecks active profile, organization, membership, and assignment state on every request, so deactivation takes effect without waiting for a JWT refresh.

Coach and Client identities may exist without an organization membership. `profiles.account_type` records only onboarding intent and never grants organization access; protected routes and RLS continue to require an active membership. Unaffiliated users can update only their own base profile and private profile image. Accepting a secure invitation creates the membership only after the database validates the opaque token, exact Auth email, role, organization, expiration, and account-type compatibility.

The Data API receives only explicit table and column grants. There are no table grants for `anon`; role, organization, invited-email, and primary-owner columns are not updateable through the API; and all exposed application tables have RLS enabled. Private helper functions use fixed empty search paths and are not exposed as RPC endpoints. The public invitation RPC is executable only by authenticated users, requires an active profile and confirmed matching email, hashes and locks the supplied token, and derives organization and role exclusively from the invitation row.

### Coach workout slice

`workout_assignments` owns the gym, prescribing coach, client, date, instructions, and lifecycle status. `workout_exercises` stores the ordered prescribed structure. Both tables are separate from memberships so training content cannot leak into general directory records.

Coaches reach clients through active `coach_client_assignments`. The workout-creation RPC derives the coach and organization from the authenticated database membership, verifies the active relationship, validates every exercise, and inserts the workout atomically. It never accepts an organization or coach ID. RLS independently restricts coaches to currently assigned clients, clients to their own workouts, and owners to read access within their gym. Identity columns are immutable and clients do not receive write access to prescribed structure.

Exercise and workout completion timestamps are server-managed. Narrow completion RPCs derive the client from `auth.uid()`, verify the workout belongs to that active client and coach relationship, and refuse cancelled or cross-organization records. Clients never receive direct update grants on workout or exercise tables. Completing the first exercise moves a workout to `in_progress`; finishing the workout requires every exercise to be complete. Coaches read the resulting status through the same RLS-protected assignment.

### Intake, state, and initial prescription V0

Client intake records are immutable, versioned snapshots in `client_intakes`; private health and coaching context never enters membership rows. Saving an intake through the constrained database function immediately creates a corresponding `client_states` record. State values are normalized from zero to one, retain the source intake and rules-engine version, and carry explicit confidence plus an uncertainty note. The V0 rules are deterministic and interpretable: experience, recent consistency, recovery inputs, desired frequency, baselines, and movement constraints contribute fixed weights. Missing baselines reduce confidence instead of inventing precision.

`organization_equipment` is the owner-managed inventory used as a hard prescription filter. The small global `exercise_library` seed describes movement patterns, training qualities, difficulty, equipment requirements, contraindications, substitutions, and default set/rep ranges. `generate_initial_prescription_v0` derives the caller, organization, latest intake, and latest calculated state from active database relationships; it does not trust browser-supplied organization or coach identifiers. It rejects constrained movements, unavailable equipment, and exercises above the client's experience level. The coach must review the result before `approve_generated_prescription_v0` creates a normal workout assignment.

`generated_prescriptions` preserves the original engine output separately from the coach-reviewed final prescription, including engine version, source intake/state, timestamps, and whether the coach changed it. `workout_sets` establishes separate prescribed values, actual values, outcome status, difficulty, and failure reason for the next adaptive gate; incomplete sets are not collapsed into a generic result.

All new public tables have RLS and explicit authenticated grants. Clients can read only their own intake/state and assigned recommendations, coaches only currently assigned clients, and owners only their active organization. Mutation is routed through narrow security-definer functions or owner-only equipment policies that recheck active profile, organization, membership, and assignment state.

The owner training-library route and `training_library_items` table are a deliberately limited import foundation. A future importer will stage CSV, Excel, PDF, or Word source files outside the public schema, parse them into normalized program/workout/block/exercise candidates, require explicit owner review, then publish approved records. Gate 4 performs no document upload or parsing.

### Owner oversight and app distribution

Owners can inspect same-organization coach rosters and client training records without impersonating another account. The Owner Coach and Client routes remain protected Server Components and every query is filtered by both the active Owner membership and table RLS. Cross-organization or wrong-role URL identifiers return no record. Owner management is intentionally narrow: the `assign_client_to_coach` function derives the organization from `auth.uid()`, validates an active same-organization coach and client, maintains one active primary coach, and never accepts an organization identifier.

Every Data API assignment insert or status change writes an immutable `coach_client_assignment_audit` event through a trigger. The actor is `auth.uid()`, so an Owner reassignment remains attributed to the actual Owner rather than the selected coach. Only active same-organization Owners can read these audit events; Coach and Client permissions are unchanged.

`/coach/install` and `/client/install` are public, role-specific PWA entry routes. They carry no trusted role or organization state. General links route existing members through normal login. Secure invitations may carry only the opaque invitation token, while the database invitation row remains authoritative for email, organization, and role. The manifest launches at `/login`, uses standalone display mode and Ravoge branding, and exposes Coach and Client shortcuts. The Owner Apps & Access screen can copy these production links or open a pre-addressed operational message in the Owner's mail application; no marketing email system or privileged email credential is added.

### Profile completeness and private media

`profiles` remains display identity rather than an authorization source. Coach- and Client-editable fields are changed only through `update_own_profile`, which derives the actor and database membership. Coaches may edit their name, preferred name, bio, specialties, experience, and photo; Clients may edit only preferred name, bio, and photo. Organization, role, membership status, Coach assignment, intake state, and account status are not accepted as profile inputs.

`coach_certifications` stores multiple organization-scoped structured credentials. An active Coach controls their own records; same-organization Owners and authorized assigned Clients may read them. Ravoge does not claim external verification. Profile images live in the private `profile-images` bucket under `<organization>/<user>/avatar.<type>`, with a 5 MB limit and JPG/PNG/WebP allowlist. Storage policies use active database relationships for reads and exact self-scoped paths for writes; the UI resolves short-lived signed URLs.

### Scheduling and booking foundation

Organizations define an IANA timezone, non-overnight weekly hours, date-specific closures/special hours, and constrained session defaults. Coaches define recurring weekly windows plus time-bounded unavailable, block, vacation, or one-off override records. Timestamps are stored as `timestamptz`; slot generation converts local wall time through the organization timezone, rejects nonexistent DST wall times, and performs all final checks again inside the database.

`bookings` is the only appointment record used by Owner, Coach, and Client schedule views. A Client booking RPC derives the organization, Client, and active assigned Coach from `auth.uid()` and accepts only a start time, permitted duration, and optional non-sensitive note. Gym hours, closures, Coach availability, blocks, notice/advance rules, buffers, and existing bookings are rechecked atomically. GiST exclusion constraints prevent concurrent Coach and Client overlaps; the Coach constraint includes snapshotted buffers. Reschedule and cancellation functions keep the same booking identity, while `booking_events` retains lifecycle history.

Transactional delivery is separate in `booking_email_deliveries`, so a provider failure never rolls back a valid booking. The server-only Resend adapter produces branded booked/rescheduled/cancelled messages, a normal Google Calendar event link, and an attached `.ics` event with stable `<booking-id>@ravoge.com` identity. No intake, health, or workout detail is rendered into email/calendar content. When `RESEND_API_KEY` or a verified `RAVOGE_EMAIL_FROM` is absent, no provider request is made and the delivery record is finalized as `skipped`; booking and schedule state remain authoritative and complete.

Supabase and Netlify projects already exist. Before any future database mutation or deployment:

1. Read the configured project/site ID from the local, non-committed environment or connected CLI.
2. Verify the ID and project name are the intended Ravoge environment.
3. Record the verification in the task or pull request.
4. Never create a replacement project just because access or configuration is missing.

## Image provenance

The hero coach, coach/tablet, and client/mobile images were generated specifically for Ravoge with the built-in image-generation tool. They contain no intentional third-party brands or readable device UI. Interface details remain accessible HTML overlays rather than text baked into photography. Source prompts are recorded in the implementation task history; the final PNG assets live in `public/images/`.

## Scope boundary

No intake or health records, booking, payments, messaging, nutrition, or AI data belongs in membership records. Intake and health context introduced in Gate 4 stays in dedicated client-domain tables; every additional domain still requires separate tables and policy review.

## Next milestones

Likely follow-on work, each requiring separate product and security review:

1. Progress summaries and training history.
2. Booking, payments, and messaging integrations.
