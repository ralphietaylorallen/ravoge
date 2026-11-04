# Client visual review

This release changes presentation only. Existing route URLs, form actions, field
names, validation, database queries, authorization and result calculations remain
unchanged. No migration or configuration change is required.

## Screen coverage

Rendered the existing source pages with synthetic read fixtures in a temporary,
localhost-only Next.js preview. The fixture adapter refuses database writes and
has no credentials. No production Client records were used or changed. These
fixtures are ignored local artifacts and are not application routes or releases.

Actual screenshots were captured and visually reviewed at 390 × 844 (phone) and
820 × 1180 (iPad portrait):

| Screen | States reviewed |
| --- | --- |
| Workouts | Assigned, upcoming, completed, empty, no assigned Coach, long name/title |
| My day | Populated, empty, date selector, expanded Add/Edit activity, read error, inline save error, synthetic saved feedback |
| Booking | Available and Full slots, selected slot, no Coach, unavailable calendar, reschedule |
| Schedule | Upcoming and past sessions, calendar links, attached reschedule/cancel controls, intake question scales |
| Profile | Populated/empty fields, editing, keyboard focus, announcement preference, initials/photo controls |
| Workout | Assigned, in progress, completed, cancelled, legacy exercise list, expanded set/results, readiness, finish/reflection, recovery Add/Edit |
| Welcome | Gym/Coach summary, installation steps, continuation link |
| Onboarding | Unaffiliated profile editor and access explanation |
| Installation | Normal and invalid invitation, instructions, install/continue controls |
| Client signup | Account form and invalid invitation recovery |
| Loading/error | Existing loading and route error components |

Also reviewed booking/rescheduling at 1024 × 768 (iPad landscape) and the six main
authenticated screens at 1440 × 1000. Document width did not exceed viewport width
in the captured screen/state matrix; observed branding images loaded. The final
Profile action was checked at page end above the fixed phone navigation. Keyboard
focus was checked in the profile form.

## Presentation changes

- Consistent page headings, readable labels, card spacing, Coach summaries and
  responsive form controls; short navigation labels and distinct day/workout icons.
- Reschedule/cancel controls stay inside the session card they affect; calendar
  links describe their action.
- Completed/cancelled workouts retain results and recovery while hiding the
  already-disabled completion editor. Active workout controls retain their actions.
- Unconfigured check-ins display the existing unavailable message without empty
  question placeholders or an unusable submit button.
- Shared loading/error branding is no longer styled as an outlined action.

## Explicit limitations

- The browser file chooser timed out. Photo crop, upload progress and photo-specific
  success/failure states were not visually inspected; photo upload logic is unchanged.
- Native camera, iOS keyboard and Safari Add to Home Screen require a physical
  phone/iPad check. Browser viewport checks are not a native-device test.
- Not every transient pending/success/error response of every form was visually
  reproduced. Shared inline error/success feedback and loading components were
  inspected; persistent behavior is covered separately by isolated regression tests.
- The local fixture review does not prove live authenticated Client account behavior.
  No production passwords, roles or data were changed to obtain a Client session.

Screenshots are retained locally under `.temp/client-visual-shots/` and excluded
from Git. CI results and the Netlify preview belong to the release PR.
