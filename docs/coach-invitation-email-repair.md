# Coach invitation email repair — 2026-10-27

## Observed baseline

The focused branch starts at main `d049485`, not the older intake branch. Main already contains today's Microsoft 365 SMTP switch (`124a7bc`), removal of the misleading app mailto shortcut (`2f91eb7`), real Apps invitation form (`c9f8c86`) and preferred secret credential (`d049485`). Before that switch the application adapter required Resend configuration; configuring Supabase Auth SMTP alone did not configure application invitation emails.

Verified production: Netlify site `ravoge` / `c1bf03e6-2657-40fe-9584-f265ab9c2b94`, main commit `d049485f1f37910007cc28045e7041585bf9b66f`, ready deploy `6ae0dfea46df5ac4e974f475`. Ravoge Supabase project `kqdnljafaiohlijbgfld` is active. Both application and Auth SMTP configuration use Microsoft 365. Auth configuration was inspected read-only, excluding password values: enabled, smtp.office365.com, port 587, Ravoge sender and intended mailbox.

An authorized real Owner submitted the requested production invitation through Apps & access. The UI reported provider acceptance. The SMTP request-log search returned no matching failures. **Acceptance is not inbox delivery; no current SMTP rejection has been proven.** Do not claim a provider, DNS, tenant-policy or password failure without evidence.

## Focused changes

- Keep the existing invitation RPCs, hashed single-use tokens, email/role/organization binding, memberships, Auth, profile flow and RLS. No migrations, data backfills or account-password changes.
- Reuse an existing pending invitation row through its existing refresh RPC, rotating the link rather than revoking the row and creating another one. Server-side recipient/org lookup plus a one-minute resend cooldown using recorded attempts. This application cooldown is not a new distributed database rate limiter.
- Preserve entered email, pending state, retry and copy-link fallback; remove the remaining mailto shortcut that could be mistaken for application delivery.
- Keep Microsoft 365 SMTP. Require TLS 1.2+ / STARTTLS and explicit acceptance of the intended recipient before reporting sent. Use only server-only `RAVOGE_SMTP_PASSWORD`, preserve exact password bytes and redact raw SMTP errors. No SMTP credential or token is logged by the adapter.
- Black/gold invitation with the real existing shared wolf asset (no black-hole asset exists in the repository), dynamic inviter/gym, Create your account button, plain secure URL and separate installation guidance. The button uses the existing email-bound signup route; no new enrollment system.
- Pin the existing Nodemailer dependency to 10.2.1 (Node >=20, compatible with the existing Node 24 workflow) after auditing its old mail-parser advisories. No unrelated framework upgrade.

## Verification and release gates

Local lint/typecheck/build and SMTP unit checks are required. The disposable authenticated browser suite covers disabled-email fallback, retained recipient, pending row reuse, token rotation/rejection, email-locked signup, keyboard submission and 390/820/1440px overflow. It does **not** prove inbox delivery. Existing Auth/install browser tests and CI's disposable database/RLS suites remain required.

Before claiming delivery: inspect the real recipient inbox, visible From and message; open its actual button, have the recipient create their own password/profile, verify Coach membership in the intended gym and independent login. Never change an existing person's role/password for QA. Auth/password-reset delivery needs a separate inbox test.

Security follow-up: a legacy non-secret SMTP_PASS variable was returned unmasked by Netlify during this audit and exposed in diagnostic output. Its value is not in this repository. Rotate the mailbox password, update Netlify's server-only RAVOGE_SMTP_PASSWORD and Supabase Auth SMTP securely, then remove the obsolete SMTP_PASS variable and rebuild. Do not paste credentials into chat. Until rotation is confirmed, do not describe this release as security-complete.
