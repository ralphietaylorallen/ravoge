# Ravoge

Adaptive private training intelligence for gyms.

Ravoge is a private-training platform for independent gyms. This repository currently contains the public marketing site and route foundations for the owner, coach, and client experiences.

## Local development

Requirements: Node.js 20.9 or later and npm 11 or later.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Validation

```bash
npm run lint
npm run typecheck
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

No environment variables are required for the current site. Never commit secrets. Supabase and Netlify projects already exist; confirm their project IDs against the intended Ravoge environment before any future database change or deployment.
