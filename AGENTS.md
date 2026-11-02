# Ravoge repository instructions

## Project boundary

- Work only on Ravoge in this repository.
- Never access or modify Seatd repositories, projects, credentials, databases, or deployments.
- Confirm the Git repository root and remotes before editing.
- Preserve existing work and configuration; do not replace connected services or create duplicate projects.

## External project safety

- Supabase and Netlify projects already exist.
- Before any database change, read and verify the connected Supabase project ID and project name are for Ravoge. Stop if the identity is absent, ambiguous, or not Ravoge.
- Before any deploy, read and verify the connected Netlify site ID and site name are for Ravoge. Stop if the identity is absent, ambiguous, or not Ravoge.
- Never create a new Supabase or Netlify project unless the user explicitly requests it after being told an existing Ravoge project is already expected.
- Never merge or deploy to production without explicit authorization.

## Secrets and data

- Never commit secrets, API keys, service-role keys, tokens, credentials, `.env` files, or production data.
- Keep privileged credentials server-only.
- Client-facing code must not imply successful authentication when authentication is not wired.

## Transactional email identity

- Coach and Client invitation emails use the Resend API with From `Ravoge <hello@ravoge.com>` and Reply-To `hello@ravoge.com`. Reuse the existing invitation sender; do not fall back to Microsoft SMTP or require SMTP credentials on this path. Unrelated notification behavior is outside this sender repair.
- Reuse the server-only `getEmailSender()` in `lib/email-sender.ts` for every application email adapter. Do not hardcode a separate sender in routes, actions, templates or new notification features.
- This includes invitations, account messages, scheduling, intake, workout assignment/completion, group programming, alerts, support and system messages. Do not add missing notification features merely to implement this rule.
- Keep `RESEND_API_KEY` server-only and protected. Never read, log, copy or expose its value during configuration audits. Leave legacy SMTP variables, including the protected `RAVOGE_SMTP_PASSWORD`, untouched until replacement delivery is proven. Test recipients must never become From or Reply-To.
- Test inboxes are recipients only. Preserve the intended normalized recipient; never fall back to a sender or test inbox.
- Hosted Supabase Auth sends outside the application utility. Independently verify its sender/SMTP settings and received headers; do not claim it inherits application configuration automatically. Preserve saved secrets and existing Auth behavior.

## Required verification

- Run lint, TypeScript checks, and a production build for implementation changes.
- For public UI changes, check phone, tablet, and desktop layouts, image loading, keyboard access, route navigation, and horizontal overflow.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
