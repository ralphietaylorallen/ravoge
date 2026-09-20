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

Owner self-registration creates a new organization through a constrained request row and database trigger; it cannot join an existing gym. Coaches and clients require a cryptographically random, expiring invitation whose hash is stored in the database. The invitation fixes the intended gym and role, and a coach-created client invitation creates the corresponding assignment after acceptance. An account has at most one active organization membership during this MVP, avoiding ambiguous dashboard routing while preserving inactive history. RLS rechecks active profile, organization, membership, and assignment state on every request, so deactivation takes effect without waiting for a JWT refresh.

The Data API receives only explicit table and column grants. There are no table grants for `anon`, role columns are not updateable through the API, and all exposed application tables have RLS enabled. Private helper functions use fixed empty search paths and are not exposed as RPC endpoints. The public invitation RPC is executable only by authenticated users, requires an active profile and confirmed matching email, hashes and locks the supplied token, and derives organization and role exclusively from the invitation row.

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
