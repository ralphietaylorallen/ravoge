# Intake goals, injury history, and verified generation — preview draft

Status: **not ready for merge or production**. Base: main `f416c89854fb7904ebfd35a23ca3fd3700c542c1` (the merged cinematic UI).

## Isolation blocker

The user approved an isolated Supabase preview branch. The verified Ravoge project is `kqdnljafaiohlijbgfld`, name `Ravoge`. It currently has no preview branches. Branch creation was rejected with HTTP 402: branching requires Pro or higher. No branch was created, no billing was changed, no production migration was applied, and no real gym accounts or records were changed.

The PR deliberately includes `[skip netlify]` in its title and commit message. GitHub CI can test migrations in its disposable local database without publishing a preview connected to production. Remove the title marker and push a new commit **only after** a separately verified Ravoge preview database is configured for this branch. Never replace all-context/production environment values with preview values.

## Implementation

- Existing intake is extended, not replaced: single goal first, independent body-map history second, movement review and original measured assessments afterward.
- Goal-specific targets live in a new immutable intake version; incompatible active targets are removed without altering earlier records. Unknown measurements remain null.
- Individual spots save through the authenticated Coach server action and database RPC. Direct writes are not granted. Every save/removal appends history. Owner oversight and Client self-read reuse the existing organization/assignment helpers.
- Anatomical left/right is from the Client perspective. A labeled region selector supplements touch targets. The native modal supplies focus containment/Escape; explicit focus restoration and a fixed dialog footer preserve Save access.
- Spot changes invalidate unassigned drafts and injury safety-review digests. They do not rewrite assigned or in-progress workouts. Conservative region-based exclusions persist for a saved surgical history even at zero pain; this is not a diagnosis or rehabilitation plan.
- New intake versions require real OpenAI generation and retrieved evidence. The previous-intake legacy paths retain their prior fallback behavior; the new path never substitutes a canned workout on retrieval/generation failure.
- Public research receives only a closed cohort vocabulary: goal, adult age band, experience, region names, surgery/unknown-restriction flags. Saved notes, names, email, dates, IDs and clinical narratives are never sent to public search. The private generation request receives saved intake details and assessments; canonical measured kilograms are converted to pounds before that request.
- Responses API `web_search` is domain-filtered to ACSM, NSCA, AAOS OrthoInfo, PubMed/PMC, NICE and US health guidance. Only returned URL-citation metadata creates source IDs/links. A second structured extraction records recommendations, applicability and limitations. Unsupported dates remain unknown. Sources are stored with the draft; a bounded 24-hour process cache reuses cohort evidence. Cold instances can repeat retrieval; this is not a persistent shared evidence-cache service.
- Main-work bouts (including rounds) determine the 90/10 ratio; warm-up/cooldown do not pad it. Canonical source cell/row segment IDs and adaptations establish gym provenance. Global catalog overlap alone is not provenance. External substitutions require a specific reason, verified evidence IDs, compatible equipment and an active load rule. Approval checks the ratio again after Coach edits. New independent exercises use the preserved manual builder or a fresh generation review.
- Existing deterministic starting loads, equipment rounding, workout protocols/timers, execution, results and learning remain the underlying systems. Raw imports and Owner enabling controls are unchanged.

## Migration

`supabase/migrations/20261023203912_intake_goals_injury_history.sql`

Additive spot/history tables with RLS and RPC-only writes; injury-review digests; the mobility goal; nullable unknown training years; source-segment provenance and generation/approval wrappers. No data reset, source publication, account backfill, or real-user changes. **Unapplied** pending isolated verification. CI must run all existing SQL suites plus `intake_injury_spots_rls.sql` before any hosted apply.

## Verification and remaining gates

- `npm run lint`, `npm run typecheck`, `npm run test:unit` (84 passed, zero failed) and `npm run build` passed locally.
- Initial draft CI run `40025531935` passed application, secret scanning, migration application, local database lint and all **26 SQL suites**, including ordinary-role injury-history access tests. The subsequently expanded saved-intake/provenance SQL assertions require a fresh CI run; this is not a hosted preview migration apply.
- `npm run test:e2e -- --workers=1 --global-timeout=180000`, using the repository's explicit noncredential CI environment placeholders: **202 passed, 58 explicit fixture/credential-dependent skips, zero failures, 1.4 minutes**. This is public/unauthenticated regression coverage, not proof of the new authenticated intake.
- A plain Playwright run cannot start without Supabase environment configuration. Public-only checks use the repository CI placeholders, never as real credentials. Authenticated fixtures must use the isolated preview database and real server-only OpenAI configuration.
- Required before ready: database migration/lint/all RLS suites; authenticated first-page and multi-spot tests (reload/login, edit, Cancel, failed save and removal); phone/iPad/desktop visual/focus/overflow checks; real evidence retrieval and an inspectable generated draft; restriction/library-gap/ratio/evidence rejection tests; Coach edit/approval and Client completion/next-workout learning.
- Existing end-to-end intake selectors were updated for the new first two steps. New-intake generation assertions require an actual OpenAI result, not a deterministic fallback.
- `tests/intake-history.spec.ts` adds isolated-only ordinary-browser coverage for goal replacement, all first-page questions, modal Save visibility/focus/Escape at phone/iPad/desktop widths, independent surgery/unknown spots, cancel, a failed network save retaining values, reload and logout/login persistence. It requires `INTAKE_PREVIEW_CLIENT_ID`, `INTAKE_PREVIEW_COACH_EMAIL` and `INTAKE_PREVIEW_COACH_PASSWORD` for synthetic `.example.test` fixtures, and explicitly rejects the production database/site. **Not executed** while isolation is unavailable.
- No live sources or generated workout have been claimed verified in this draft. No Netlify preview is claimed working. No production merge/deploy is authorized for this feature.

## Changed files

```
app/coach/actions.ts
app/coach/intake-actions.ts
app/coach/clients/[clientId]/page.tsx
app/coach/clients/[clientId]/prescriptions/[prescriptionId]/page.tsx
components/dashboard.module.css
components/intake-form.tsx
components/intake-goals.tsx
components/intake-goals.module.css
components/injury-map.tsx
components/injury-map.module.css
lib/intake-history.ts
lib/exercise-evidence.ts
lib/workout-provenance.ts
lib/create-workout-draft.ts
lib/workout-generation.ts
lib/workout-generation-quality.ts
lib/workout-intelligence.ts
supabase/migrations/20261023203912_intake_goals_injury_history.sql
supabase/tests/intake_injury_spots_rls.sql
tests/helpers/intake.ts
tests/beta-readiness.spec.ts
tests/gym-references.spec.ts
tests/operations-ui.spec.ts
tests/intake-history.spec.ts
tests/unit/intake-history.test.ts
tests/unit/workout-provenance.test.ts
docs/intake-goals-body-map-preview.md
```

## Official implementation references

- [OpenAI Responses web search: domain filters, source metadata, citations](https://developers.openai.com/api/docs/guides/tools-web-search)
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Supabase RLS and explicit grants](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Netlify skipping previews per PR title](https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/)
