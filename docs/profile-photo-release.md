# Secure profile-photo repair

## Preserved foundation

The workspace was clean when this request resumed. The previous beta repair was
already merged in PR #23 (`dc69b88`), not an unfinished 24-file diff. This scoped
follow-up extends that main commit without recreating authentication, intake,
manual workouts, scheduling, invitations, imports or the public landing page.
Existing stashes and historical branches remain untouched. No Seatd access.

## Implementation and boundaries

- Reuses `profiles.avatar_path`, `avatar_updated_at`, the shared photo form, and
  the existing **private** `profile-images` bucket (5 MiB stored-object limit).
- Active same-organization Owners/Coaches may manage Client photos. Owners may
  manage Coach photos; Coaches cannot manage other Coaches. Existing Coach and
  Client self-service, including unaffiliated onboarding, is retained.
- Photo-only access does **not** grant unassigned Coaches access to general
  Client profiles, intake, health information or workouts. Existing route and
  record authorization remains unchanged.
- The entire image is a chooser button; explicit camera/library actions,
  native modal crop/zoom/position preview, Cancel/Replace/Remove, upload progress,
  double-submit prevention and clear retry feedback use the existing design.
- JPEG/PNG/WebP are decoded locally. HEIC/HEIF first use native decoding, then
  lazy-load the pinned `heic-to/csp` decoder on the device if necessary. No source
  photo is sent to an image-conversion service. Decoder licensing/source notice:
  `/licenses/heic-to.txt`.
- Source limit: 20 MiB / 50 megapixels. Browser prepares a square crop; the server
  independently validates actual JPEG/PNG/WebP bytes (5 MiB / 40 megapixel input),
  corrects orientation and strips EXIF/ICC/location metadata. Permanent assets
  are optimized 1024px main and 160px thumbnail WebP images, without server upscaling.
- Unique paired paths: `<organization>/<user>/avatar/v2-<uuid>.webp` and
  `v2-<uuid>-thumb.webp`. Existing legacy paths remain supported. The database
  stores only the main path, never a signed URL or image binary.
- Same-origin authenticated API, current membership-based Storage RLS and
  explicitly authorized RPCs; no editable-metadata authorization or service key.
  Signatures expire after 15 minutes. Signed URLs are temporary bearer capabilities,
  not instant-revocation mechanisms; already cached responses can persist.
- Upload both immutable objects, verify signing, then compare-and-swap the profile
  pointer under a row lock, then remove old objects. Referenced objects cannot be
  directly overwritten/deleted through Storage policies. Failure before commit
  preserves the old pointer; uncertain commit responses are rechecked. Old-file
  cleanup failure is reported separately, never misreported as a failed save.
- Native camera capture and Safari photo-library selection still require a physical
  iPhone/iPad check. Chromium viewport/file-chooser tests cannot prove hardware UX.

## Migration and data

`20261018203238_secure_profile_photo_management.sql` was generated with the pinned
Supabase CLI, reviewed, exercised with all 18 RLS suites in rollback-only transactions,
then applied to verified **Ravoge** project `kqdnljafaiohlijbgfld`.

It extends the existing path constraint and Storage policy helpers, adds a partial
avatar-path index, a narrow edit-context RPC and an authorized compare-and-swap RPC.
No new profile system, bucket, table, reset, reseed, backfill, photo replacement,
raw-import modification, automatic publication or real-account/password change.
Disposable browser QA uses newly generated test gyms/identities and cleans up only
those exact fixtures through authenticated Storage APIs and scoped database cleanup.

## Dependencies and advisors

Pinned `heic-to` 1.6.6. Existing Next.js/ESLint config patched 16.3.5 → 16.3.8,
Sharp 0.35.4 → 0.35.5 and compatible transitive source-map-js → 1.2.2 after the
initial audit found runtime security advisories. Lockfile committed.
`npm audit --omit=dev`: zero vulnerabilities. Full audit retains five development
dependency findings rooted in unpatched `braces` through Next's ESLint plugin;
no forced framework downgrade or audit suppression was performed.

Supabase advisors were reviewed before/after migration. The two new authenticated
SECURITY DEFINER RPC notices are intentional: both check active membership/target,
use an empty search path, and revoke anonymous execution. No new anonymous RPC.
Existing warnings remain: intentional deny-all private signup-intent RLS, existing
privileged RPC notices, disabled leaked-password protection, two older unindexed
foreign keys and unused-index information. No unrelated Auth settings changed.

References: [authenticated RPC advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
[password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection),
[foreign-key advisor](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys),
[development advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

## Verification record

| Command/check | Result before release |
| --- | --- |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run test:unit` | 26 passed, 0 failed |
| `node scripts/with-ravoge-public-env.mjs build` | PASS (runs `npm run build`, public configuration in memory only) |
| `node scripts/with-ravoge-public-env.mjs test:e2e` | 190 passed, 46 opt-in/credential/platform skips, 0 failed; stateful flows exercised separately below |
| Pending migration rollback harness with `RAVOGE_PENDING_MIGRATIONS=20261018203238_secure_profile_photo_management.sql` | All 18 SQL suites passed before application |
| `npm run test:db` | All 18 SQL/RLS suites passed after application |
| `supabase db lint --linked --level error --fail-on error` | PASS |
| `RAVOGE_RUN_DISPOSABLE_QA=yes RAVOGE_PHOTO_QA=yes RAVOGE_PHOTO_HEIC_FIXTURE=.temp/libheif-example.heic node scripts/verify-operations-ui.mjs` | 2 passed: real authenticated upload/replacement/removal/Storage API isolation, HEIC+HEIF conversion, failure retention, refresh/login persistence, thumbnails, keyboard focus and 390/768/1024/1440px overflow checks |
| `RAVOGE_RUN_DISPOSABLE_QA=yes node scripts/verify-operations-ui.mjs` | 1 passed: existing manual workout execution/outcomes, intake, scheduling, photos, role access and responsive controls |
| `RAVOGE_BETA_QA=yes node scripts/verify-beta-ui.mjs` | 1 passed: secure invitations/enrollment, six independent Coaches, intake → published-source generation → review/approval/assignment → Client visibility, logout/account switching |
| Hosted preview and production | Must pass and be reported separately before release is described as verified |

Early photo test failures: a cached signed URL was incorrectly treated as proof of
object retention (fixed to probe fresh authenticated Storage access); visual QA
found compact-image distortion and tablet overflow (application CSS corrected).
No security assertion was weakened. The older scheduling photo assertion was
updated for the expressly requested same-gym Coach permission, adding explicit
other-Coach and cross-gym denials. General profile/intake isolation stays asserted.

## Every changed file

- `app/api/profile-photo/route.ts`
- `app/client/profile/page.tsx`
- `app/client/schedule/page.tsx`
- `app/coach/clients/[clientId]/page.tsx`
- `app/coach/page.tsx`
- `app/coach/profile/page.tsx`
- `app/coach/schedule/page.tsx`
- `app/owner/clients/[clientId]/page.tsx`
- `app/owner/clients/page.tsx`
- `app/owner/coaches/[coachId]/page.tsx`
- `app/owner/reports/page.tsx`
- `app/owner/schedule/page.tsx`
- `app/owner/team/page.tsx`
- `app/profile/actions.ts`
- `components/dashboard.module.css`
- `components/profile-forms.tsx`
- `components/profile-photo-editor.tsx`
- `docs/profile-photo-release.md`
- `lib/profile-images.ts`
- `lib/profile-photo-processing.ts`
- `lib/profile-photo-storage.ts`
- `package.json`
- `package-lock.json`
- `public/licenses/heic-to.txt`
- `scripts/verify-beta-database.mjs`
- `scripts/verify-operations-ui.mjs`
- `supabase/migrations/20261018203238_secure_profile_photo_management.sql`
- `supabase/tests/managed_profile_photos_rls.sql`
- `supabase/tests/scheduling_assignment_intake_v1_rls.sql`
- `tests/profile-photos.spec.ts`
- `tests/unit/profile-photo.test.ts`
