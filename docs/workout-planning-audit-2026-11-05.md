# Bounded workout-planning audit — 5 November 2026

## Status and scope

Focused PR only; do not merge or deploy this audit overnight. Baseline:
`d46407e0f47e4cd7955b646d8778be704d71605f` (production main after Owner cleanup).
Owner/Coach/Client presentation, completed reports, scoring, authentication,
load calculations, migrations and hosted data are unchanged.

**No live OpenAI comparison was possible:** neither the local process nor a local
Next.js environment file contains an OpenAI key. Production secrets were not
retrieved. The user reported **one earlier live end-to-end attempt**; this audit
used **zero additional live attempts**, leaving **three** of the shared four-attempt
allowance. Earlier provider token usage/output was not available. New provider
usage is zero; no claim is made about the earlier attempt's cost or quality.

The examples below are **actual outputs of the existing pipeline with a fixed
mock transport**, not actual OpenAI completions. They demonstrate input wiring,
reference ranking and existing validation. They do not prove better AI judgment.

## Existing pipeline traced

| Stage | Actual input/output and protection retained |
| --- | --- |
| `create-workout-draft.ts` | Authenticated RPC creates a private draft and obtains an optimistic input snapshot. Adds saved age, three recent drafts under the same Coach, and existing recent-session report context. Existing Coach rate guard, discard/error paths and atomic completion remain intact. |
| Database input (read-only source inspection) | Current authorized intake/restrictions, compatible exercises/resources, organization references, readiness and up to five assigned/in-progress/completed sessions, ordered by scheduled date descending. Performance aggregates include recorded/problematic counts, actual reps, load, RPE, time and distance. Historical loads are canonical kilograms, converted to pounds in the model projection. No database was queried or changed by this audit. |
| `exercise-evidence.ts` | New intake uses existing domain-restricted retrieval plus citation-bound summarization and the existing 24-hour process cache. No new research, citation source, stage, timeout or retry loop was added. Both evidence calls are mocked in the offline examples. |
| `workout-intelligence.ts` planner | Existing configured model produces bounded objectives/patterns/methods/progression/intensity; validated intent has a five-minute process cache. Failure remains explicitly `rules_fallback`. Source prose/identity is excluded. |
| Reference retrieval | Searches the already-authorized catalog, excludes incompatible structured groups intact, scores goal/pattern/method/format/duration relevance, and selects at most five references. Structured reference selection respects its existing session-budget rule. References remain alternatives to adapt, not whole sessions to concatenate. |
| `workout-generation.ts` and quality projection | Existing generator receives mapped gym segments, history, readiness, equipment, intake and evidence. Existing strict schema, two-attempt maximum and deadlines remain unchanged. Absolute AI loads remain null. |
| `workout-generation-quality.ts`, `workout-provenance.ts` | Existing equipment, protocol, unilateral, turf, duration, volume, intensity, load-free text and repeat checks remain intact. New intake still needs at least 90% main-work bouts linked to valid gym segments, with verified evidence for allowed substitutions. Raw style examples are not relabeled verified protocols. |
| Save and Coach review | Actual source review IDs, analysis method, provenance audit, evidence and existing structured Coach-review fields continue through `complete_pound_prescription`. Existing deterministic starting loads and Coach approval/assignment remain the authority. No new saved field or automatic assignment was introduced. |
| `session-programming.ts` | Existing executable-target comparison ignores titles, prose and row order. It is unchanged. |

## Demonstrated weaknesses and exact corrections

1. **Recency inversion:** the old `Map(history.flatMap(...))` retained the last
   occurrence of each exercise. Because supplied history is newest first, an
   older success could replace a newer problematic result. A future unperformed
   assignment could also displace useful evidence. Retrieval now keeps the first
   supplied outcome with a recorded or problematic effort. The same existing
   bounded score (−10 to +6 per unique exercise) applies to structured templates
   as well as raw style references; goal and compatibility ranking remain.
2. **Unresolvable planner aliases:** performance and previous drafts used
   `exercise_1`-style keys, but the planner only received a list of compatible
   movement patterns. It could not associate a particular history item with its
   movement or reps/time/distance measurement. The planner now receives a compact
   alias → pattern → measurement map, plus explicit newest-first history ordering.
   It receives no additional identity, source prose or absolute-load authority.

No prompts were rewritten. Existing instructions already address purpose,
coherence, optional conditioning, factual source influence, purposeful variation
and conservative response to missed work. This PR supplies missing context and
corrects ranking rather than claiming stronger wording improves the model.

## Reproducible comparison

Run from the existing Ravoge checkout (baseline commit must be available locally):

```powershell
node --conditions=react-server scripts/audit-workout-planning.mjs
```

The script loads the exact baseline module from Git into an ignored temporary
file, uses the same synthetic input/model/mock reply policy for both versions,
and removes that temporary module afterward. It writes
`.temp/workout-planning-audit/comparison.json`. It makes **no network requests,
account changes, database writes or real evidence searches**. It contains no live
sending mode. The mock chooses the first retrieved gym reference and supplies
fixed goal-specific targets; it does not simulate OpenAI reasoning.

### Profile A: intermediate strength, three days/week, 35-minute budget

Synthetic actual history, newest first: goblet squat average **5 reps at 33.1 lb**
with **two problematic sets**, previously **8 reps at 44.1 lb** with no problematic
sets. Current readiness answers are 4/10; no injury clearance is inferred.

Two equally relevant synthetic gym references are available:

- `source-a`, revision 1, segment `main`: goblet squat → dumbbell hinge → dumbbell row.
- `source-b`, revision 1, segment `main`: box squat → dumbbell hinge → dumbbell row.

| Mock-validated workout | Baseline | Revised |
| --- | --- | --- |
| Reference credited | `source-a` | `source-b` |
| First movement | Goblet squat | Box squat |
| Other movements | Dumbbell hinge; dumbbell row | Dumbbell hinge; dumbbell row |
| Targets, each movement | 3 × 8, 120-second rest, RPE 6 | Identical fixed mock targets |
| Actual validator time estimate | 1,458 seconds (~24.3 minutes) | 1,458 seconds |
| Returned duration | 25 minutes within the 35-minute budget | 25 minutes |
| Main-work gym provenance | 100% | 100% |
| AI absolute loads | Null; Coach/deterministic engine must resolve | Null |

**Objective change:** the ranking now responds to the newest problematic result
instead of older success. The planner can resolve the actual performance aliases
and receives both recorded load/repetition values in their original order.
This does **not** establish that changing to a box squat is the clinically or
programmatically best response, or that OpenAI would choose it. The fixed mock
adapts the first source and leaves targets unchanged. Real progression/regression
quality remains unverified without provider output.

### Profile B: beginner, fat-loss support, two days/week, 25-minute budget

No prior performance; current readiness answers 6/10. Synthetic gym reference
`source-c`, revision 1, segment `main`, supplies goblet squat → dumbbell row →
dumbbell hinge. Baseline and revised outputs are the **same**: each movement
3 × 10, 90-second rest, RPE 6, null absolute load. The existing validator estimates
1,260 seconds / 21 minutes and verifies 100% main-work gym provenance. Neither
output adds a forced conditioning finisher or extra movement-pattern checklist.

This unchanged result is intentional evidence against manufacturing a difference
where the ranking defect is not exercised. Goal relevance of the fixed mock is a
test-fixture choice, not evidence of OpenAI's independent quality.

## Objective checks versus judgment

| Criterion | What was established | What remains unverified |
| --- | --- | --- |
| Goal relevance | Saved goal, experience, time, frequency and readiness remain projected; contrasting fixtures retain the expected source | Real-model purpose selection and coaching quality |
| Gym-reference influence | Existing source IDs/segment validation; all four mocked workouts have 100% main-work provenance | Semantic fidelity of a real model's adaptation explanation |
| Recorded performance | Latest actual outcomes win; older problems do not override a newer success; unperformed plans are ignored; planner aliases resolve | Real-model decisions on reductions, missed work and modifications |
| Sequencing/duration | Fixed mock sequences pass existing timing/protocol validators at 25 and 21 minutes | Whether real sessions feel coherent and adequately fill the requested time |
| Equipment/protocol compatibility | Existing validators remain unchanged and regression checks run | Real-provider failure frequency for complex protocols |
| Meaningful variation | Existing title/order-only repeat rejection retained | Lifetime, cross-Coach diversity and appropriateness across many sessions |

The offline comparison uses **12 mocked Responses calls**: four per baseline
profile and two per revised profile because the existing evidence cache is warm.
That difference is a fixture cache effect, **not a measured cost/latency improvement**.
There were no live provider failures or live fallback outputs to inspect.

## Checks and handoff

- New regression cases first failed against baseline, then passed after correction.
- Focused generation/intelligence/provenance/repeat tests: **31 passed**.
- Local lint, TypeScript and production build pass on the repair.
- Existing mandatory CI remains required on the focused PR; its check results
  are the authority for the final PR status. No required workflow was changed.
- No migration, hosted QA account, production Client write, service configuration,
  dependency change, model change, merge or production deployment is authorized here.

Prioritized follow-up:

1. With a securely configured local OpenAI credential, use only the **three
   remaining live attempts** for a bounded comparison; record actual response
   usage and failures. Do not retrieve production secrets or extend the allowance.
   An ignored `.env.local` or process environment is appropriate; never put the
   key in chat or Git. This offline script intentionally does not consume it.
2. Inspect real-model adaptation to set-level reductions/modifications. Current
   model history is aggregated over at most five scheduled-date-ordered sessions;
   it does not expose every individual set change or exercise substitution.
3. Separately design a larger repeat-history repair. The current production query
   checks only **three recent drafts under the same Coach**. A prompt or this
   ranking fix does not provide lifetime/cross-Coach duplicate prevention. Keep
   useful recurring exercises; assess executable prescription/emphasis changes,
   not cosmetic title/order differences.
4. Judge source fidelity and coherent segment selection on more varied real
   outputs before making broad engine-quality claims. The tiny synthetic sample
   and successful validators do not establish universal workout excellence.

Existing recent-session context explicitly says sauna/plunge is self-reported,
not readiness or clearance, and never independently permits higher load. That
context and interpretation remain unchanged and are regression checked.
