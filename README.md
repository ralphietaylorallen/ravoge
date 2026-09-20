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

Use only the publishable key. Never put a secret or `service_role` key in a `NEXT_PUBLIC_` variable or Git.

Hosted Supabase Auth uses `https://ravoge.com` as its Site URL. The redirect allowlist contains Ravoge production, `www`, Netlify deploy previews, and local development. Email confirmation remains enabled. Always run `supabase config diff` before any future `supabase config push`; the repository config intentionally omits hosted SMS credentials and does not manage them.

## Current scope

- Responsive public landing page
- Supabase SSR email/password authentication with cookie-backed sessions
- Signup, login, logout, email confirmation, and password recovery flows
- Server-protected owner, coach, and client dashboards
- Multi-owner organization memberships, expiring invitations, primary-owner protection, and coach/client assignments enforced with RLS
- Coach client profiles with secure, ordered workout assignment creation
- Client dashboard and workout detail with secure exercise/workout completion
- Local, bundled Inter and Space Grotesk variable font files
- Original project-owned photography assets for coach/tablet and client/mobile sections

Adaptive programming, booking, payments, and messaging remain outside the current milestone. See [docs/architecture.md](docs/architecture.md) for architecture and security boundaries.

Each gym member uses a separate Supabase Auth identity. Owners invite additional owners or coaches from `/owner/team`; the invitation fixes the organization, email, and role in the database. Shared owner credentials are not supported.

## Environment and deployment

Never commit secrets. The existing Ravoge Supabase project is `kqdnljafaiohlijbgfld`; verify its dashboard name is **Ravoge** before database work. The existing Netlify site ID is `c1bf03e6-2657-40fe-9584-f265ab9c2b94`; verify its site name is **ravoge** before deployment.
