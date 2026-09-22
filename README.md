# Ravoge

Adaptive private training intelligence for gyms.

Ravoge is a private-training platform for independent gyms. This repository contains the public Coming Soon experience and the secure account foundation for owner, coach, and client experiences.

## Local development

Requirements: Node.js 20.9 or later and npm 11 or later.

```bash
npm install
npx netlify link --id c1bf03e6-2657-40fe-9584-f265ab9c2b94
npx netlify dev:exec npm run dev
```

Open `http://localhost:3000`.

## Validation

```bash
npm run lint
npm run typecheck
npm run build
npm run test:db
npx playwright install chromium
npm run test:e2e
```

## Environment

Copy `.env.example` to a gitignored `.env.local`, or use the linked Ravoge Netlify environment through `netlify dev:exec`. Required public values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

The scheduling email integration is server-only and becomes active when these Netlify values are configured:

- `RESEND_API_KEY` — Resend API key, marked secret and never exposed with a `NEXT_PUBLIC_` prefix.
- `RAVOGE_EMAIL_FROM` — verified Ravoge sender identity.
- `RAVOGE_APP_URL` — optional public application origin; production defaults to `https://ravoge.com`.

If the Resend key or sender is absent, bookings still complete and the separate delivery record is marked `skipped`; no provider request is attempted.

Use only the publishable key. Never put a secret or `service_role` key in a `NEXT_PUBLIC_` variable or Git.

Hosted Supabase Auth uses `https://ravoge.com` as its Site URL. The redirect allowlist contains Ravoge production, `www`, Netlify deploy previews, and local development. For the private beta, Confirm Email is disabled so password signup returns an authenticated session immediately and does not depend on Supabase's limited shared SMTP service. Password recovery still requires a working mail provider; re-enable confirmation only after production SMTP is configured and verified. Always run `supabase config diff` before any future `supabase config push`; the repository config intentionally omits hosted SMS credentials and does not manage them.

## Current scope

- Responsive public landing page
- Supabase SSR email/password authentication with cookie-backed sessions
- Signup, login, logout, immediate private-beta sessions, and password recovery flows
- Server-protected owner, coach, and client dashboards
- Multi-owner organization memberships, expiring invitations, primary-owner protection, and coach/client assignments enforced with RLS
- Owner-only coach/client oversight, primary-coach reassignment, and immutable assignment actor auditing
- Installable Coach and Client web-app entry routes with an Owner Apps & Access distribution screen
- Private profile images, Coach/Client profile editing, and structured Coach certifications (pending migration release)
- Timezone-aware gym hours, Coach availability, single-source bookings, calendar exports, and an optional Resend transactional-email adapter
- Coach-created Client invitations with atomic assignment, Owner-wide Client attribution, deterministic operations reports, and exact session-value/compensation snapshots
- Coach client profiles with secure, ordered workout assignment creation
- Client dashboard and workout detail with secure exercise/workout completion
- Local, bundled Inter and Space Grotesk variable font files
- Original project-owned photography assets for coach/tablet and client/mobile sections

Payment collection, payroll, general messaging, and adaptive set intelligence remain outside the current milestone. Revenue values are reporting estimates only. See [docs/architecture.md](docs/architecture.md) for architecture and security boundaries.

Each gym member uses a separate Supabase Auth identity. Owners invite additional owners or coaches from `/owner/team`; the invitation fixes the organization, email, and role in the database. Shared owner credentials are not supported.

Owners can share `/coach/install` and `/client/install` as general access routes from `/owner/apps`. These links are conveniences only and never grant a role. New members use the secure email-bound invitation created from `/owner/team`. Its QR/link contains only a random, expiring opaque token; the server immediately exchanges it for a two-hour `Secure`, `HttpOnly`, `SameSite=Lax` handoff cookie and removes the token from the visible URL. The installed app launches through `/launch`, which atomically accepts a still-valid exact-email invitation or routes to the locked login/signup screen. Passwords, sessions, JWTs, keys, and readable personal data are never embedded in an invitation QR.

Organization calendar dates use the gym's IANA timezone. `America/Denver` is the documented fallback only when a legacy organization has no timezone. Schedule settings are saved through one database transaction so organization details, weekly hours, and session rules cannot partially update.

Pull requests and pushes to `main` run clean installation, lint, typecheck, unit checks, a production build, local migration/database validation, and secret scanning in `.github/workflows/ci.yml`. Local database CI parity requires Docker or Podman; hosted test scripts use transaction rollback and must be run only after verifying the linked project is Ravoge.

## Environment and deployment

Never commit secrets. The existing Ravoge Supabase project is `kqdnljafaiohlijbgfld`; verify its dashboard name is **Ravoge** before database work. The existing Netlify site ID is `c1bf03e6-2657-40fe-9584-f265ab9c2b94`; verify its site name is **ravoge** before deployment.
