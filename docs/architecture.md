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

The three application routes currently render clearly labeled setup-pending pages. They do not accept credentials, start sessions, or imply that authentication succeeded.

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

### Data and security boundary

This milestone has no database, authentication, AI, payments, or email integration. Future work must keep server-side credentials off the client, use row-level access controls appropriate to each audience, and ensure clients can never read another client’s data.

Supabase and Netlify projects already exist. Before any future database mutation or deployment:

1. Read the configured project/site ID from the local, non-committed environment or connected CLI.
2. Verify the ID and project name are the intended Ravoge environment.
3. Record the verification in the task or pull request.
4. Never create a replacement project just because access or configuration is missing.

## Image provenance

The hero coach, coach/tablet, and client/mobile images were generated specifically for Ravoge with the built-in image-generation tool. They contain no intentional third-party brands or readable device UI. Interface details remain accessible HTML overlays rather than text baked into photography. Source prompts are recorded in the implementation task history; the final PNG assets live in `public/images/`.

## Next milestones

Likely follow-on work, each requiring separate product and security review:

1. Authentication and account provisioning by role.
2. Gym, coach, client, and membership data model with explicit tenant isolation.
3. Owner, coach, and client application shells.
4. Workout programming and session recording.
5. Progress, booking, payments, and messaging integrations.
