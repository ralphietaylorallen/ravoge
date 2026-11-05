# Authorized Coach and Client views

One Supabase Auth identity retains its email/password, profile and original gym
membership. Coach access remains `role=coach, status=active`. The nullable
`client_access_status` on that same membership adds independently active/inactive
Client access. Existing membership IDs, `(organization_id,user_id)` uniqueness,
foreign keys, historical data and invitation roles remain intact. No backfill is
needed and no users or memberships are converted.

`get_my_authorized_memberships` derives identity from `auth.uid()` and returns
only that person's active roles in active gyms with an active profile. Login
opens `/access` for multiple choices; single-role login retains its destination.
Coach/Client headers link to Switch view. Owner navigation stays unchanged.

The HTTP-only `ravoge_view` cookie is a preference, not authorization. Each
server request matches it against current database access. Supabase requests
include untrusted gym/view headers; database actor lookups independently match
them against active membership. Invalid/revoked choices require choosing again.
Logout/login clears the preference. Direct RLS checks use **all actual active
permissions**, not the chosen interface: switching to Client is not revoking a
valid Coach role. A Client-only identity cannot acquire Coach permissions by
editing headers, URLs, forms or cookies.

The public read-only `organization_member_roles` view uses `security_invoker`
and underlying membership RLS. It lets existing directories/bookings see a
Coach's Client access. Internal, non-exposed role projections support existing
checked database functions. The additive migration explicitly lists the read
bindings being updated; no calculations, payload validation, training writes or
function grants are replaced. Physical membership locks are retained. Identity
creation, invitation acceptance and ownership lifecycle functions keep their
original table and role restrictions.

Create my Client profile locks and rechecks **only the caller's own active Coach
membership** in the requested gym. It idempotently activates Client access,
without creating an Auth user, changing `account_type`, or assigning a Coach.
The existing Client welcome/profile and coach-led intake paths are reused. An
active Coach can explicitly reactivate their own Client access with this action;
an inactive Coach cannot. Clients cannot create Coach/Owner access.

Owner removal identifies the role explicitly. Affected bookings and assignments
are limited to that role and still require resolution/confirmation. Removing
Coach access preserves Client access and vice versa. The legacy RPC signatures
delegate to removal of the original role for deployed-client compatibility.
Historical results, other gyms and authentication identities remain unchanged.

## Verification and rollout

`authorized_account_modes_rls.sql` runs only with the repository's isolated
local/CI database suite. It tests authenticated Client denial, spoofed gym/role,
idempotence, assignment integrity, both revocation orders and historical/Auth
preservation. `account-modes.spec.ts` uses the existing CI fixture runner with a
new local-only flag; it tests real password login, chooser/switching, Client
self-activation, single-role denial, Owner login, keyboard and responsive bounds.
Existing invitation and Owner suites continue unchanged except their action
boundary mocks include the new view preference and explicit removal role.

Apply the single migration only after isolated DB and required CI pass, then
deploy matching application code. Check migration history before applying it.
No hosted test accounts, real memberships, emails or production fixtures are
created for this release. Real-account switching needs an authorized dual-role
session; do not claim that live interaction was tested if one is unavailable.
