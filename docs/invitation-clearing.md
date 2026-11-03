# Clear email invitations

Owner → Team allows selection of pending, expired and revoked invitations, with a bulk **Clear email invitations** button and a per-invitation **Clear** action. Confirmation names the selected count. Accepted invitations cannot be selected or cleared.

Clearing uses the existing revocation function, then records `cleared_at` and `cleared_by`. The Team list filters these rows, while Owner audit access retains them. No invitation rows, Auth users, profiles or memberships are deleted. A new invitation to the same address uses the existing creation, email delivery and recipient/role-locked signup flow.

The RPC derives the gym from the authenticated active Owner membership. It locks and validates the complete batch before making changes; foreign, missing or accepted invitations reject the batch atomically. Direct table writes remain restricted. Retries do not alter the original clearing audit timestamp.

## Verification

- `tests/unit/invitation-clearing.test.ts`: Owner enforcement, bounded IDs, deduplication, inline error handling, and a hard refusal of hosted fixture targets.
- `supabase/tests/invitation_clearing_rls.sql`: ordinary authenticated roles, cross-gym denial, accepted-link protection, atomic batches, retained audit, revoked redemption denial, fresh invitations, and unchanged Auth/membership snapshots.
- `tests/invitation-clearing.spec.ts`: ordinary UI creation/acceptance, pending/expired/revoked selection, cancel and count confirmation, single/bulk clearing, durable hiding, audit reads, invalidated links, fresh signup, role protection, keyboard selection, and phone/tablet/desktop overflow checks.
- CI runs database and authenticated browser tests against its isolated local Supabase stack with email disabled. The dedicated fixture harness refuses hosted database targets. Production verification is non-mutating; no real invitations or memberships are changed to test this feature.

The migration is additive and does not modify existing delivery, signup, RLS policies or membership data. Check production migration history before applying it, and apply it exactly once through the existing Ravoge project.
