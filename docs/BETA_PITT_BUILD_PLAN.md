# Ravoge beta — The Pitt MT

The Pitt MT is the canonical beta gym. Dane is the owner; Mike and Neil are coaches. Names document the launch context only—no real client data or seeded production memberships belong in the repository.

## First vertical workflow

1. An owner configures the gym’s available equipment.
2. An authorized coach completes a structured intake for an assigned client.
3. Ravoge deterministically calculates a versioned, uncertainty-aware client state.
4. Ravoge generates an equipment- and constraint-safe first workout recommendation.
5. The coach reviews and edits the recommendation, then approves it as the client’s assigned workout.
6. The original recommendation, final prescription, state version, and coach edits remain auditable.

## Architecture boundaries

- Supabase Auth is identity; organization memberships and active assignments are authorization.
- Intake, health notes, client state, prescriptions, equipment, and training-library records live in dedicated RLS-protected tables—not membership records.
- Browser IDs and role intent are untrusted. Database functions derive the caller and gym from `auth.uid()` and active records.
- V0 state and prescription rules are explicit, deterministic, versioned, and conservative. No LLM participates.
- The exercise catalog is intentionally small. Equipment requirements and contraindication tags are structured for later expansion.
- Workout sets keep prescription, outcome, difficulty, and failure reason as separate concepts for the next adaptive gate.
- Historical training imports will stage source files, parse into normalized candidates, require owner review, then publish to programs/workouts/blocks/exercises. Gate 4 creates only the secure product/schema shell.

## Deferred

Live set-response adaptation, Pitt-specific custom assessments, coach-defined field builders, scheduling capacity, document parsing, emails, payments, and large exercise catalogs remain separate gates.
