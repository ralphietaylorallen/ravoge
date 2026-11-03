# Owner Team member access removal

Clear email invitations is already deployed in PR #50. Clearing remains separate from accepted membership management and uses the unchanged revocation/audit path.

Owners may remove another Coach or Client from their own gym. Owners, including the acting Owner and the primary/final Owner, are outside this operation. No Auth user, profile, intake, workout, result or accepted invitation is deleted. Other organizations' memberships are untouched.

The removal page shows all future/in-progress scheduled appointments. They must be explicitly resolved through the existing cancellation/scheduling actions first. The final removal RPC rejects any outstanding appointment and verifies the exact confirmed assignment IDs before ending those assignments and setting just this gym membership inactive. No automatic cancellation or reassignment occurs. Membership locks shared with new bookings/assignments prevent creation racing with removal.

The existing RLS and per-request membership checks enforce loss of access for already signed-in users. Direct browser membership-status writes are revoked so they cannot bypass this resolution flow. Training/audit history stays associated with the retained membership and identity. Removed members disappear from active Team sections and the Client directory defaults to Active; historical inactive filtering remains available.

`member_access_removals` retains an Owner-readable, gym-scoped audit with the actual actor, person, role and ended assignment IDs. The assignment audit remains active. There is no permanent personal-data deletion or reactivation UI in this release.

CI uses an isolated local Supabase database and disposable browser identities. Tests cover permission and gym boundaries, Owner protection, explicit appointment/assignment resolution, preserved Auth/workout/history records, other-gym membership preservation, existing-session revocation and responsive controls. Production checks are read-only and do not remove any real member.

Partner/small-group personal training is recorded separately in `partner-training-requirements.md`; no implementation is included.

CI run 129 passed all application/security checks, every isolated database suite, and four authenticated browser tests (group programming, invitation clearing and member removal). The verified additive migration was applied once to Ravoge project `kqdnljafaiohlijbgfld` as `20261103131951_owner_member_access_removal`; the SQL is unchanged from CI. Existing browser-status-write tests now assert denial, while the trusted primary/final Owner trigger checks remain in place.
