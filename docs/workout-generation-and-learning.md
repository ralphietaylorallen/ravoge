# Workout generation and learning

The Owner and Coach use **Create workout** to select a client, one or more focus areas, and a duration. Immediate sessions collect readiness. Advance preparation does not invent a daily check-in. The intake, restrictions, confirmed equipment and existing authorization checks remain required.

Generation searches the current gym catalog, retrieves applicable exercise guidance from the server's primary-source domain allowlist, and drafts only approved exercise identities. Research requests contain a closed vocabulary of training context, never names or client notes. Citations come from provider retrieval metadata; a model-supplied URL is insufficient. Applicable research is cached for 24 hours and the review screen distinguishes reuse from a fresh search. Research is population guidance, not individual medical clearance.

The provider receives canonical exercise aliases, exact source bindings, source segments and verified research summaries. Source credits are checked against actual catalog movements. Version 2 intake provenance additionally verifies source segments and the existing 90% gym main-work rule. Numeric starting loads are resolved by the existing server-side load engine, not invented by OpenAI. Failed retrieval, invalid output, stale snapshots and database rejection cannot silently assign a deterministic replacement through this generation route. Manual planning remains available.

Coaches can edit exercise selection, sets, repetitions, loads, rest and protocol details; add/remove exercises; and use Move up/Move down to arrange the session. Stable row identities preserve edits when rows move. Save Draft keeps private preparation, Save to Client schedule assigns the chosen day, and Save & open workout opens the saved workout for training. Existing assignment/player code consumes the posted row order as sort order. A scheduled workout does not start merely because it is saved.

## Bayesian completion model

`beta-block-v1` is an explicit Beta power-likelihood model of recorded completion for comparable exercise doses. It is not a Bayesian matrix or a calibrated injury/performance predictor.

Each fully recorded block in the last 90 days contributes one fractional observation: mean set outcome, where complete is 1, modified is 0.5, and missed/failed/pain is 0. Different exercises, formats, target measurements, doses, loads and weight semantics retain separate evidence. Partial blocks and substituted identities do not become successful observations for the original exercise. Reloading recomputes from saved results and cannot duplicate observations.

With block outcomes y, the posterior is alpha = 1 + sum(y), beta = 1 + sum(1 - y). Mean = alpha / (alpha + beta); variance = alpha * beta / ((alpha + beta)^2 * (alpha + beta + 1)). The uniform Beta(1,1) prior and the three-block/80% gates are conservative product policy choices, not clinical thresholds established by trials.

The existing engine first proposes a confirmed load using actual outcomes, effort, pain, assessments and equipment. The Bayesian gate may hold an increase when the most recent comparable dose has fewer than three blocks, mean below 0.8, or pain. It cannot increase the engine's result, invent equipment, ignore reductions, or clear pain. Coaches retain approval and explicit editing control. Client reports and trainer review explain the evidence count and completion estimate.

## Verification

Run `npm run test:unit`, `npm run typecheck`, `npm run lint` and `npm run build`. Unit tests execute the additive learning migration in isolated PostgreSQL/WASM with earlier RPC stand-ins. Production migration verification additionally exercises the existing Owner generation, starting-load, booked preparation and session-report SQL suites in rollback-only savepoints. No test fixture is retained.
