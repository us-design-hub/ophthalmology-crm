# Milestone 3 verification

Verified locally on 14 September 2026 (15 September in Asia/Karachi) using the production Next.js build, workspace PostgreSQL, and Chromium.

## Results

- Production build and TypeScript passed.
- 23 domain/database checks passed, including clinic slot/date rules, bilateral measurement validation, permitted queue progression, immutable workup grants, and actual second-hospital appointment/encounter/workup isolation.
- 23 browser scenarios passed: the existing 16 foundation/anatomy scenarios plus seven intake scenarios.
- The complete intake scenario books from a patient record, checks in, verifies a second queue view updates within ten seconds, moves to workup, saves distinct OD/OS values as a nurse, hands off, reloads, and reviews the same saved values as a doctor.
- API scenarios verify slot/check-in races, duplicate daily bookings, existing active-encounter rejection, future-date check-in denial, facility and role restrictions, CSRF checks, stale workup versions, author restrictions, post-handoff write denial, and both elapsed-timer and early-override dilation release.
- Workup revisions and the attributed override audit event were checked directly in PostgreSQL.
- Desktop and tablet screenshots were reviewed. Queue columns now scroll within the available height. Dialogs retain the patient name and risk flags above the scrolling workup; OD stays before OS.
- The additive intake seed was rerun and preserved existing data. Browser mutations ran in `openeyes_demo_test`, separate from the preview.

## Test adjustments and limits

An initial run exposed stale test navigation to the old overview anatomy button and a tablet test that opened a waiting patient without saved measurements. Tests now use the Doctor Event navigation and a consultation patient respectively. The multi-account intake walkthrough has a two-minute overall allowance; individual assertions keep their normal bounds. The registration walkthrough allowance is one minute. These overall test budgets are not claims about meeting-device performance.

Clinical review of sample values, the source brief's 1.5-second device/network target, hosted HTTPS deployment, remote CI, reset/rehearsal, backups/restoration, and production acceptance remain pending. The build ends at consultation handoff; Doctor Events, anatomy integration, signed content, prescribing, and encounter completion are the next milestone.

See `INTAKE_DECISIONS.md` for the scheduling, access, dilation, measurement, and deferred-work boundaries.
