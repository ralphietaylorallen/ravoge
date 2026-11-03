# Private Owner announcements

Owner → Announcements supports active Clients, active Team (Owners/Coaches), or individually selected members. Review the immutable message and exact recipient count, then confirm Send. Every recipient gets an independent Resend request with one `To`, no CC/BCC, no audience list or Client personalization, and a recipient-specific unsubscribe link. The shared sender remains Ravoge <hello@ravoge.com>, Reply-To hello@ravoge.com. Invitations and their transport are unchanged.

## Consent and isolation

Optional announcements default off. Each active member can opt in/out in their Profile; Owners set their own preference on Announcements. An invitation is not consent. Server RPCs resolve current confirmed addresses and active memberships in the acting Owner's gym. Removed members, pending invitations, duplicate addresses, stale email preferences, and unconfirmed identities are excluded. Access and consent are checked at preview, confirmation, claim, and immediately before sending. Resend suppressions and contact unsubscribes are checked before every send; errors fail closed. Owners cannot opt other people in.

The additive migration enables RLS and explicit grants on all new exposed tables. Browser roles have no direct writes, cannot select claim/unsubscribe secrets, and cannot access other gyms' announcements. Privileged helpers live in `private`, with empty search paths. The sole public definer, `unsubscribe_announcement`, intentionally allows anonymous opt-out using an unguessable 256-bit token. It can only turn off the matching member's consent; it cannot grant access, reveal an identity, or send mail. GET shows confirmation; the separate POST endpoint supports one-click email unsubscribe. Links use no-referrer/noindex metadata. No existing client/history/auth data is backfilled or deleted.

## Durable delivery

Confirmation persists the message and per-recipient queue before starting a Netlify background function. The function uses the initiating Owner's ephemeral verified JWT and publishable Supabase key, never a service-role key. The JWT is not stored or logged. Every RPC rechecks active Owner access. The worker runs only in Netlify production against the verified Ravoge project; missing preview configuration never sends email. It processes sequentially, respects a shared database dispatch lease/cooldown and provider backoff, and continues in bounded background chunks. Expired Owner sessions or provider errors leave work safely saved; the Owner can sign in and resume from the same announcement. Resuming never requeues accepted recipients.

Duplicate clicks reuse the saved preview nonce; confirmation is idempotent. Each recipient has a fixed Resend idempotency key and immutable payload. Ambiguous HTTP outcomes/expired leases are **unconfirmed**, not delivered. Only transient or corrected configuration failures can be explicitly retried after backoff, at most five attempts and within 23 hours of the first attempt (inside Resend's 24-hour idempotency lifetime). Older ambiguous sends require investigation, not automatic resending. Provider acceptance is separate from provider-confirmed delivery; Refresh delivery status retrieves and validates the provider's recipient record, checking up to ten accepted records per click. Recipient inbox receipt is not claimed from API acceptance. Hard bounce/complaint/suppression also turns off that address's local consent.

## Configuration and operations

Reuse the protected `RESEND_API_KEY` in Functions/Production plus the existing `RAVOGE_EMAIL_FROM` and `RAVOGE_EMAIL_REPLY_TO` hello identity. Announcement preflight needs permission to read suppressions and contacts; status refresh needs sent-email read permission. **Check email connection** performs reads only and surfaces sanitized errors. A send-only key will safely block announcements until appropriately scoped credentials are configured. No SMTP fallback, Microsoft changes, DNS changes or new email secrets are introduced.

Authenticated tests run only against CI's isolated Docker Supabase and loopback Next server. Unit transport/worker tests mock every provider call. Production verification is read-only except a single announcement to an explicitly authorized external inbox that is an active opted-in member; never opt members in or mass-send for testing.

Partner/small-group training remains requirements only in `partner-training-requirements.md`.

## Release verification

The main migration was applied once as `20261103144939_private_owner_announcements`; the repository filename records the hosted version without changing its verified SQL. Production grants confirm RLS on all three exposed tables, no anonymous reads/direct browser inserts/deletes, no browser reads of claim/unsubscribe tokens, and no anonymous queue/private-schema access. Hosted advisors identified two composite FK covering indexes, addressed by the separate `announcement_fk_indexes` migration. The intentional anonymous/authenticated opt-out definer warnings and private dispatch table's deny-all/no-policy INFO finding are documented above; existing unrelated advisor findings are outside this release.
