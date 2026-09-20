# Ravoge

Adaptive private training intelligence for gyms.

Ravoge is a private-training platform for independent gyms. This repository currently contains the public marketing site and route foundations for the owner, coach, and client experiences.

## Local development

Requirements: Node.js 22 or later and npm 11 or later.

```bash
npm install
```

Before using Supabase-backed code, create a local environment file:

```powershell
Copy-Item .env.example .env.local
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` with
the public API values for the Ravoge Supabase project (`kqdnljafaiohlijbgfldwe`).
Do not place secret or `service_role` keys in a `NEXT_PUBLIC_` variable. Local
`.env` files are ignored by Git; `.env.example` contains placeholders only.

Then start the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Validation

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run build
npx playwright install chromium
npm run test:e2e
```

## Current scope

- Responsive public landing page
- Owner, coach, and client route foundations
- Explicit setup-pending states that do not collect credentials
- Local, bundled Inter and Space Grotesk variable font files
- Original project-owned photography assets for coach/tablet and client/mobile sections

Authentication, database tables, adaptive workout logic, booking operations, payments, and email are intentionally outside this foundation milestone. See [docs/architecture.md](docs/architecture.md) for the architecture record and boundaries.

## Environment and deployment

The Supabase connection utilities require only the public project URL and
publishable key shown above. Authentication, database changes, and session
refresh middleware remain intentionally unimplemented. Never commit secrets.
Supabase and Netlify projects already exist; confirm their project IDs against
the intended Ravoge environment before any future database change or deployment.
