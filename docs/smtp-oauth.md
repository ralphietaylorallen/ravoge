# Microsoft OAuth for invitation SMTP

Invitations continue through the existing Nodemailer adapter, records and delivery-status RPC. Production uses `RAVOGE_SMTP_AUTH=oauth2`, certificate-based client credentials, STARTTLS on smtp.office365.com:587, and XOAUTH2 as `dane@ravoge.com`. Security Defaults stays enabled. From and Reply-To remain the shared `info@ravoge.com` identity. The existing protected mailbox password is preserved and is never read in OAuth mode; failed OAuth never falls back to a password.

## Microsoft administration

Use the existing **ravoge com** Microsoft tenant. Register a single-tenant Ravoge SMTP application and upload its public certificate. Keep the private key exclusively in protected server-side configuration. Grant no Graph mail-reading permissions and no tenant-wide Exchange API permission. Use [Exchange SMTP application RBAC](https://learn.microsoft.com/en-us/exchange/client-developer/legacy-protocols/smtp-app-rbac-onboarding) with `Application SMTP.SendAsApp`, restricted to the `dane@ravoge.com` mailbox. Verify both the allowed mailbox and an out-of-scope mailbox before release. Mailbox SMTP AUTH must remain enabled; do not disable Security Defaults or enable SMTP AUTH tenant-wide.

Exchange setup requires an authenticated Exchange administrator and the enterprise application's object ID (not the app-registration object ID). Use `New-ServicePrincipal`, a mailbox-specific `New-ManagementScope`, and `New-ManagementRoleAssignment`. Check existing objects before creating them. Do not grant `FullAccess` or tenant-wide `SMTP.SendAsApp` in addition to RBAC. Verify alias sending separately; OAuth authentication does not itself enable sending from an alias.

## Netlify server configuration

On the existing Ravoge site, set these variables for production **Functions** only, using protected secret storage for the private key:

- `RAVOGE_SMTP_AUTH=oauth2`
- `RAVOGE_SMTP_OAUTH_TENANT_ID`: verified Ravoge Microsoft tenant GUID.
- `RAVOGE_SMTP_OAUTH_CLIENT_ID`: Ravoge SMTP application GUID.
- `RAVOGE_SMTP_OAUTH_CERT_SHA256`: certificate SHA-256 thumbprint (64 hexadecimal characters).
- `RAVOGE_SMTP_OAUTH_PRIVATE_KEY`: matching RSA private key in PEM format (literal newlines or escaped `\n`).

Keep all existing host, port, mailbox username, From and Reply-To variables. Do not retrieve or overwrite `RAVOGE_SMTP_PASSWORD`. Never prefix OAuth variables with `NEXT_PUBLIC_`, put them in Git, log them, or copy tokens into browser storage. Deploy after configuration changes. Access tokens are obtained server-side with a five-minute PS256 certificate assertion, cached only in server memory, refreshed before expiry, and never stored in invitation records. Token failures retain the secure copy-link fallback and record delivery failure accurately.

Rotate the app certificate before its Microsoft expiry: upload a replacement public certificate, securely replace the matching private key/thumbprint in Netlify, redeploy and prove SMTP acceptance plus invitation `sent`; then retire the old certificate. No mailbox-password rotation is involved.

## Release proof

Send a real invitation from a fresh production Owner form to an explicitly approved external recipient. Confirm SMTP accepts the intended envelope recipient and the database records `sent`, then inspect received From, To and Reply-To. A successful token request, build or SMTP connection alone is insufficient proof. Hosted Supabase Auth SMTP and booking email are separate systems and are unchanged by this repair.
