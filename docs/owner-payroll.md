# Owner payroll

The Owner navigation includes **Payroll** at `/owner/payroll`. This feature is independent of the pending workout-generation changes.

## Periods and dates

The gym saves a 7-day or 14-day cadence and one known period start date. The weekday selector and anchor date stay in sync. The anchor fixes the alternating-week parity for a two-week cadence. Current period defaults to the saved cycle; previous/next controls navigate the displayed range. Explicit start/end filters accept arbitrary inclusive date ranges, rather than only recent appointments.

The database uses the gym timezone for both boundaries. The end boundary is midnight after the selected final day. Calendar arithmetic therefore handles daylight saving days without assuming 24-hour days. The existing organization/time index supports the range scan.

## Revenue and calculated pay

The report includes all completed booking appointments whose session starts in the selected dates. It lists every Coach membership, including inactive Coaches, even with no sessions, and adds historical training staff with activity. It excludes scheduled, cancelled and no-show bookings. It aggregates in PostgreSQL before returning results, avoiding REST pagination truncation.

Revenue is saved session value, not proof of collected cash. Existing payment status is informational. Refunded sessions are excluded from revenue and placed in review for pay, since the app cannot infer the compensation agreement for refunds.

Coach pay comes from saved `coach_compensation_minor` booking snapshots, separated into percentage commission and hourly amounts. Current configuration is shown and can be changed through the existing Owner compensation form. Changing configuration does not reprice old sessions. Missing pricing, missing compensation and refunded sessions are counted for review; their pay is excluded from the calculated subtotal. Currency totals remain separate. Monetary sums are exact numeric cents in PostgreSQL, returned as text and formatted using BigInt.

The report is gross calculated pay, not a record of an unpaid balance after external transfers. It does not process payments, mark wages paid, withhold deductions or change existing booking financial snapshots.

## Access and failure behavior

Report and settings RPCs derive the organization from the authenticated, selected Owner membership; no request-supplied gym ID is accepted. Checked private workers sit behind public security-invoker wrappers. The settings table has RLS and no direct client write grants. Coach, Client, anonymous and wrong-selected-gym calls are denied. The page never replaces a database failure with a zero-dollar report.

## Validation and release

`tests/unit/payroll.test.ts` executes the actual additive migration in isolated PostgreSQL/WASM with earlier schema and selection-view stand-ins. It covers a 1,005-session aggregate, mixed currencies, saved versus current rates, spring DST boundaries, zero-session Coaches, invalid ranges, and ordinary-role isolation. The action tests verify Owner authorization, input validation and absence of a client-supplied organization ID.

Run `npm run test:unit`, `npm run typecheck`, `npm run lint` and `npm run build`. Apply only the payroll migration, verify authenticated Owner phone/tablet/desktop layouts and date/settings interactions, then deploy with the required production authorization. Do not apply pending AI migrations as part of this release.
