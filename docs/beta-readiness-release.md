# Beta readiness repair — verification record

## Scope preserved

Existing Supabase SSR authentication, roles, Coach-led versioned intake, manual
workout builder, scheduling, profile photos, public artwork and PWA remain in place.
No existing organization, user, password, membership, workout or imported row was
deleted or reset. The unfinished mathematical-baseline migration remains in its
named Git stash and is excluded from this release.

## Repairs

- Bulk email normalization and duplicate handling; pending invitations are preserved.
- Individual email-bound Coach membership, refresh/resend/revoke and copy-link fallback.
- Honest email delivery status, provider timeout and sanitized failure messages.
- Coach installation-only QR; Client-only reusable gym enrollment.
- Explicit Safari Home Screen guidance, local logout and handoff/cache clearing.
- Owner-confirmed equipment checklist and Client-specific generation diagnostics.
- Immutable raw imports, separate review revisions and strict fixed-source publication.
- Complex/incomplete imports stay in review, enforced in UI, server action and database.
- Intake/goal/experience/restriction/equipment/duration source selection, published gym
  preference and global fallback, with source revision and intake provenance.
- Coach safety review of each intake version; draft review and approval remain required.

## Applied migrations

1. `20261015203006_beta_invitation_access.sql`: disables reusable Coach credentials
   and prevents future reusable Coach grants; preserves memberships. Adds invitation
   refresh without browser-controlled email, role or organization.
2. `20261015203008_reviewed_training_generation.sql`: additive review/safety tables,
   explicit RLS/grants, raw-source immutability, equipment checklist, diagnostics,
   approved-source generation and approval-time compatibility checks.
3. `20261015230233_beta_readiness_query_indexes.sql`: covers the two new composite
   foreign keys reported by the performance advisor.

No draft backfill or automatic publication was performed. The Pitt still has all
124 original draft imports. Its raw-source digest before and after migration is
`dfe40a8d62c14e0040960df1314bb0f3`. The intentional existing-data status change is
disabling its reusable Coach enrollment credential; its Client QR stays active.

## Verification completed before production publication

| Command / check | Result |
| --- | --- |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run test:unit` | 18 passed, 0 failed |
| `node scripts/with-ravoge-public-env.mjs build` | PASS, production build with existing Ravoge public configuration in memory |
| `node scripts/with-ravoge-public-env.mjs test:e2e` | 186 passed, 42 skipped (credentials / explicit stateful opt-in), 0 failed |
| `RAVOGE_VERIFY_PENDING_MIGRATIONS=yes node scripts/verify-beta-database.mjs` | All 17 database files passed in rollback-only transactions before application |
| `npm run test:db` | All 17 database/RLS files passed after application |
| `supabase db lint --linked --level error --fail-on error` | PASS |
| `RAVOGE_BETA_QA=yes node scripts/verify-beta-ui.mjs` | Complete authenticated browser journey passed against the applied schema |
| `RAVOGE_RUN_DISPOSABLE_QA=yes node scripts/verify-operations-ui.mjs` | 1 passed: existing manual workouts/outcomes, scheduling, intake, photos and role access |

The authenticated journey exercises owner equipment and import publication,
complex-import rejection, duplicate bulk recipients, actual clipboard copying,
resend with email disabled, new and existing Coach invitation acceptance,
new and existing Client QR acceptance, Coach assignment, saved Coach-led intake,
published-source generation, invisible draft, approval, Client workout visibility,
six independent Coach sessions, denial of unassigned Client access, logout and
account switching. It checks 390, 768, 1024 and 1440 pixel layouts with screenshots.
Only newly created isolated QA identities and their gym are removed afterward.

Early browser failures were test locator/navigation assumptions, then corrected:
two status messages after import, intentionally read-only invited email, asynchronous
Next navigation and the existing custom 404 wording. A review form visually reset
its goal after save; preserving form values fixed that application issue. The final
journey passed. The expiry fixture was corrected to preserve the existing
`expires_at > created_at` constraint.
The older operational runner logged stream-close messages during server teardown
after its test passed and browser contexts closed; it exited successfully.

Production and Deploy Preview runs must be verified and reported separately;
local acceptance alone is not a production-readiness claim.

## Advisor results

No new exposed table lacks RLS. New privileged RPCs explicitly validate active
roles/assignment and revoke anonymous execution. The two new missing composite
indexes were fixed. Remaining findings predate this release: intentionally
deny-all Owner signup-intent RLS; authorized public/privileged RPC advisory notices;
disabled leaked-password protection; two older missing foreign-key indexes and
unused-index information. These were not silently reconfigured.

## Operational requirements and deliberate limits

- Live invitation delivery has NOT been proven: Netlify has no `RESEND_API_KEY`
  or `RAVOGE_EMAIL_FROM`. Add the server-only Resend key and a verified sender,
  then verify the sender domain and live delivery. No real people received test mail.
- Physical iPad/iPhone Home Screen installation still needs a Safari device test.
  Automated viewport/user-agent checks do not install an app on a physical device.
- The Owner must enter The Pitt's actual equipment and review programming.
  Its existing 124 drafts are not automatically approved.
- EMOM/timed/percentage/per-side protocols remain in review until their protocol
  representation is implemented; they are not flattened into fixed-set targets.
- No new Staff role, alternative authentication system, replacement services,
  mathematical-baseline rollout or unrelated feature was added.

## Every changed file

- `.env.example`
- `README.md`
- `app/auth/actions.ts`
- `app/coach/actions.ts`
- `app/coach/clients/[clientId]/page.tsx`
- `app/owner/actions.ts`
- `app/owner/apps/actions.ts`
- `app/owner/apps/page.tsx`
- `app/owner/equipment/page.tsx`
- `app/owner/team/page.tsx`
- `app/owner/training-library/[itemId]/page.tsx`
- `app/owner/training-library/actions.ts`
- `app/owner/training-library/page.tsx`
- `components/app-access-card.tsx`
- `components/dashboard.module.css`
- `components/equipment-form.tsx`
- `components/install-access-page.tsx`
- `components/invite-form.tsx`
- `components/pwa-install-button.tsx`
- `components/team-invitations.tsx`
- `components/training-library-review.tsx`
- `components/workout-generation-status.tsx`
- `docs/beta-readiness-audit.md`
- `docs/beta-readiness-release.md`
- `lib/invitation-email.ts`
- `lib/invitation-input.ts`
- `lib/organization-enrollment.ts`
- `lib/training-review.ts`
- `lib/workout-readiness.ts`
- `package.json`
- `scripts/verify-beta-database.mjs`
- `scripts/verify-beta-ui.mjs`
- `scripts/with-ravoge-public-env.mjs`
- `supabase/migrations/20261015203006_beta_invitation_access.sql`
- `supabase/migrations/20261015203008_reviewed_training_generation.sql`
- `supabase/migrations/20261015230233_beta_readiness_query_indexes.sql`
- `supabase/tests/beta_readiness_rls.sql`
- `supabase/tests/gate4_intake_prescription_rls.sql`
- `supabase/tests/organization_qr_enrollment_rls.sql`
- `tests/authenticated-flow.spec.ts`
- `tests/beta-readiness.spec.ts`
- `tests/install-access.spec.ts`
- `tests/organization-enrollment.spec.ts`
- `tests/unit/invitation-email.test.ts`
- `tests/unit/invitation-input.test.ts`
- `tests/unit/training-review.test.ts`
