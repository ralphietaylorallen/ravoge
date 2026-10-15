# Coach and client test readiness audit

Audit date: October 15, 2026. Repository: `ralphietaylorallen/ravoge`.
Audited production commit: `e51481d8ee5630914ac7bdc6e2f454fcf0cc8910` (PR #22).
Verified Supabase project: Ravoge, `kqdnljafaiohlijbgfld`.
Verified Netlify site: ravoge, `c1bf03e6-2657-40fe-9584-f265ab9c2b94`.

## Existing flow and confirmed gaps

| Step | Existing implementation | Finding / repair |
| --- | --- | --- |
| Owner invitation | Team forms → server action → `create_organization_invitation` | Email, gym and role are database-bound; add bulk validation and invitation lifecycle controls. |
| Email delivery | Resend adapter → delivery status on invitation | Both Resend environment variables absent; four Pitt invitations show `not_configured`. Preserve honest status and copy-link fallback. |
| New coach | `/enroll/coach` → install → signup → authenticated acceptance | Preserve name/password signup and email validation. |
| Existing account | Enrollment handoff → login → authenticated acceptance | Preserve identity and idempotent membership acceptance. |
| Coach iPad | `/coach/install`, manifest, shared PWA | Existing iOS instructions; replace misleading iOS install button with explicit Safari steps. |
| Coach gym access | Verified Auth claims plus active database membership and RLS | Preserve per-person accounts, isolated sessions and role checks. No Staff role exists. |
| Client QR | Owner credential → `/enroll/client` → install/signup/login | Preserve revocable, gym-specific Client enrollment. |
| QR privilege boundary | Reusable Coach credential currently creates Coach membership | Confirmed security gap against current requirements. Disable existing Coach credentials and reject future reusable Coach grants; keep generic Coach install QR. |
| Intake and goals | Coach client profile → versioned intake and baseline RPC | Preserve coach-led workflow, goals, restrictions and existing intake history. |
| Equipment | Owner inventory, availability toggles and photo scanner | Pitt has zero records. Add owner-confirmed checklist and client-specific generation diagnostics. Do not populate real inventory automatically. |
| Imported workouts | CSV/XLSX import preserves row cells in `normalized_content` | Pitt has 124 drafts. Current list shows only 50, with no review/publish workflow. Add paginated review and separate normalized, versioned review records. |
| Generator sources | `generate_initial_prescription_v0` reads `exercise_library` | Does not read imported workouts. Prefer compatible published organization reviews, with existing global fallback. |
| Coach review/assignment | Generated draft → editable review → approval RPC | Preserve coach review; validate equipment and client restrictions again at approval. |
| Client workout | Client-scoped assigned workouts and RLS | Draft prescriptions remain invisible to Clients. Verify generated approval through the Client UI. |

## Data observations

Only counts, schema and workout source text were inspected. No passwords, invitation
tokens or health details were retrieved. The Pitt has one active Owner, Coach and
Client membership. Existing Owner multiplicity remains supported; no accounts are
consolidated or removed.

Imports have Title, Description, Date, Score Type, Divisions, Athlete Notes,
Coaches Notes and Linked Benchmark columns. Descriptions include timed stations,
warmups, EMOM blocks, percentage loads and ambiguous per-side prescriptions.
These cannot all become fixed-set workouts safely through automatic parsing.
Recognizable fixed-set entries may be suggested; ambiguous protocols require
explicit review. No draft is automatically published.

The service worker has no fetch handler or cache and leaves authenticated responses
network-only. The unfinished mathematical-baseline migration was preserved in a
named Git stash on `codex/ravoge-math-baseline-v01`; it is outside this release.

## Release verification

The code and database verification, complete changed-file list, applied migrations,
data-preservation checksum and remaining setup are recorded in
[the release record](beta-readiness-release.md). Production deployment and live
acceptance are reported separately after GitHub checks and deployment finish.
Physical iPad installation requires Safari → Share → Add to Home Screen and cannot
be certified by Chromium emulation alone.
