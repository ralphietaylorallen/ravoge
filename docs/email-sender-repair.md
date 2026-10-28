# Transactional email sender repair

The licensed Microsoft 365 login and public sender are separate identities.
`RAVOGE_SMTP_USER` authenticates as the licensed primary mailbox. The shared,
server-only sender configuration uses `Ravoge <info@ravoge.com>` and replies to
`info@ravoge.com`. It rejects another visible sender instead of silently using
the SMTP login. Recipient selection, invitation records, expiry, role locking,
and Auth callbacks are unchanged.

## Existing delivery paths

| Messages | Existing delivery path | Sender configuration |
| --- | --- | --- |
| Owner, Coach, Client invitations, retries and bulk invitations | `lib/invitation-email.ts`, Microsoft 365 SMTP | Shared server-only sender; canonical `RAVOGE_SMTP_*` settings; required STARTTLS, TLS 1.2 minimum, port 587 |
| Password recovery, signup confirmation and other Auth messages | Supabase Auth custom SMTP | Separate hosted Auth configuration; changing Netlify variables does not update it |
| Booking, rescheduling and cancellation notifications | `lib/booking-email.ts`, existing Resend adapter | Shared sender; recipient/calendar content unchanged; missing credentials still skip without blocking booking |
| Workout completion outbox | Hosted database has completion-email claim/finalize RPCs | No active dispatcher exists in this checkout or the project's listed Edge Functions; this repair does not add one |
| Intake notifications | No separate sender identified in current application | Existing intake/scheduling behavior preserved; no new notification system |

## Configuration

Canonical non-secret Netlify keys are `RAVOGE_SMTP_USER`,
`RAVOGE_SMTP_HOST`, `RAVOGE_SMTP_PORT`, `RAVOGE_EMAIL_FROM`, and
`RAVOGE_EMAIL_REPLY_TO`. The existing protected `RAVOGE_SMTP_PASSWORD`
must remain untouched. Do not copy it into documentation, local test fixtures,
logs, or another variable. Legacy `SMTP_*` variables are no longer read by the
application and were retained rather than deleting pre-existing configuration.

Supabase custom SMTP must independently use the licensed primary login, sender
name Ravoge, sender address info@ravoge.com, smtp.office365.com and port 587.
Preserve its saved password; do not pull or log the full hosted Auth config.
Supabase Auth is not routed through the application sender utility, and its
received headers must be checked independently.

Microsoft must permit sending as the alias. A 5.7.60/SendAsDenied rejection
requires GoDaddy/Microsoft 365 administration, not a different From address.
SMTP acceptance alone does not prove the received From header: inspect an
external inbox and confirm replies reach the licensed mailbox through the alias.

## Verification and boundaries

Unit coverage exercises the actual SMTP utility with a mocked transport and the
existing Resend adapter with mocked HTTP: primary login vs alias sender,
Reply-To, exact normalized recipient/envelope, TLS, missing configuration,
alias/auth failures, and sanitized diagnostics. Authenticated disposable browser
tests cover Coach and Client invitations, role-locked signup, retries, existing
accounts and email-disabled copy-link fallback. These tests are not proof of
real delivery.

Production verification must separately record Coach invitation, Client
invitation and password-reset delivery and received From/Reply-To/To headers.
An already-active member may correctly be rejected before invitation creation;
never remove their membership or weaken the guard to manufacture a test.
No database migration, password change, role change or production data repair
is part of this release.
