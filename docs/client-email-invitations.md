# Client email invitations

This is an extension of the working Coach invitation release, starting from main `d7de9e9`. No new invitation, Auth, profile, membership or SMTP system; no migrations or production data backfill.

## Owner and recipient flow

Clients → Invite client → `/owner/clients/invite` renders the existing `InviteForm` bound to `createClientInvitationAction`. Complete-email validation runs before the server request and again on the server. Errors remain inside the form; entered email, Sending, Retry/Resend and secure copy-link fallback use the existing controls.

The existing invitation RPC derives the gym and inviter from the authenticated session. Its role is the server action's fixed `client` value, never an editable field or URL parameter. Recipient, gym and role remain stored in the existing invitation record. Existing token hashing, expiry, rotation, consumed-link handling, RLS, account-type consistency and membership uniqueness remain unchanged.

The shared SMTP utility normalizes the invitation recipient independently of sender configuration, explicitly sets the same single address in the visible To header and SMTP envelope, and validates the SMTP result against it. There is no recipient fallback. Successful diagnostic logs contain only role and verification booleans, not addresses, tokens or credentials.

Client email uses the requested gym-based subject/body and **Create your Ravoge account** button with a plain clickable secure URL below it. Coach email copy and its original button remain unchanged. Signup uses the existing `/signup/client?enrollment=…` route; no account-type selection. Client invitation links to sign-in and back to signup retain this verified context. Owner signup now passes an `enrollment` parameter through the existing role validation too, so changing the URL cannot silently discard a Client token and display an unrelated Owner form.

Signup verifies token/email/role before Supabase Auth account creation. The existing acceptance RPC receives only the opaque token and derives membership role, gym and invitation linkage from the database record. After successful provisioning, Clients go directly to `/client`; there is no mandatory welcome detour. Existing unaffiliated Client identities can sign in and join through the same invitation without another signup. Conflicting Owner/Coach identities are not converted to Clients.

## Verification

- Unit coverage: exact Client template, normalized visible/envelope recipient independent of sender, no fallback on invalid input, Coach copy/SMTP regression, role and recipient mismatch rejected before Auth signup, forged role/gym fields ignored, record-backed acceptance and direct Client-home redirect.
- Disposable authenticated browser coverage: Owner Clients entry, inline incomplete-email error, normalized invitation record, email-locked signup with no role selector, wrong-role URL rejection, new Client signup, correct membership/invitation linkage, one directory entry, Owner/Coach route denial, normal logout/login and existing Client acceptance; phone/iPad/desktop overflow checks. SMTP is deliberately disabled in these QA fixtures and is not delivery evidence. Fixtures are cleaned up by the existing scoped harness.
- Existing Auth/install browser suite and CI's complete disposable database/RLS suites remain release requirements. No production reset, reseed or privileged database insert is used to prove the real recipient workflow.

## Real-inbox proof

Use only the complete external recipient explicitly provided by the user; never use the sender mailbox as a fallback or test recipient. Record provider acceptance and actual recipient inbox receipt separately. Recipient must enter their own password; never paste it into chat or reset existing account credentials for QA.

The provided external inbox already has a Coach identity with no gym membership. The user has no unused external address/confirmed alias available. It can prove delivery, visible headers and the email button, but cannot prove new Client registration without changing its existing identity. Preserve that Coach account and report this external acceptance-test blocker explicitly. Disposable Client journey results are not a substitute for a received-email registration claim.
