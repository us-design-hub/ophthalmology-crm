# Milestone 3: connected patient intake

This milestone implements the booked-patient path in scenario A. Source requirement files are unchanged. These implementation defaults are for the demo; clinical and scheduling policy acceptance is still pending.

## Workflow and access

Reception books an existing or newly registered patient, checks in today's appointment, and starts workup. Check-in atomically marks the appointment, creates its encounter, and appends the initial waiting transition. The encounter is the queue entry; no separate disconnected queue record exists.

Nurses and optometrists can start workup, save bilateral measurements, and hand off. Doctors can read saved workup in their assigned clinics. Reception and hospital administrators cannot read or write measurements. Auditors cannot open the intake datasets. Clinical detail requests and all mutations check assigned facilities; existing sessions re-read current grants.

The hospital master patient index remains hospital-wide. The queue, schedule, workup, and dashboard are restricted to the current user's assigned clinics. Demo clinical/reception staff are assigned all three demo clinics; pharmacy and nonclinical accounts are not added to those rosters.

## Schedule

Each clinic has a configured start/end and slot duration, plus an explicit active-doctor roster. Demo clinics operate 09:00–17:00 every day, in 15-minute slots. Bookings cover today through 90 days ahead; same-day past slots are deliberately permitted for rehearsal. All dates and measurement times use Asia/Karachi.

Doctor slots are unique across clinics. A patient has at most one appointment per day for this demonstration. Unique constraints plus booking locks protect competing requests. Booking outside clinic hours, off the slot grid, or outside the assigned roster fails on the server.

Check-in is available only on the appointment date. One appointment creates at most one encounter; each patient can have only one active encounter across the hospital. Repeated/competing check-ins return a conflict rather than another queue entry. Walk-ins, cancellations, rescheduling, no-shows, and early-departure workflows are deferred.

## Queue and dilation

Implemented progression: `waiting → workup → consultation`, optionally `workup → dilation → consultation`. Consultation here means ready for the doctor; this milestone does not complete the consultation or encounter. Pharmacy/billing and encounter completion are part of later milestones.

Every transition records actor, time, prior/new stage, encounter version, and any reason. Stale versions, repeated moves, skipped stages, and backward moves fail. A saved workup is required before dilation or consultation handoff.

Dilation starts a server-side 20-minute timer. Early release needs a reason of at least eight characters; the transition and audit event retain it. The UI countdown is informative; the server clock controls eligibility. Dilation does not record or imply medication administration.

Queue and dashboard polling runs every five seconds after the preceding response. Queue includes all unfinished arrivals, including prior days, so an unfinished encounter is not hidden at midnight. Network errors show a stale warning and disable queue mutations until refreshed. Polling does not renew idle sessions. The queue requires authentication and is not a public waiting-room display.

## Bilateral workup

OD and OS remain side by side and in that order. Each eye records uncorrected, pinhole, and best-corrected VA, IOP, method, and measurement timestamp. Snellen strings and CF/HM/PL/NPL remain textual values; not-tested is explicit. Refraction and Snellen/logMAR conversion are deferred.

Both IOP values and measurement metadata are required on save. The demo accepts IOP from 1–80 mmHg; values above 21 produce the requested nonblocking highlight. Measurement time must be from check-in through now, with one minute of tolerance for minute-resolution input. These are demo data-entry rules, not approved clinical thresholds or advice.

Each save inserts a new immutable revision with OD/OS children and the author/time. A prior author can revise their own workup only while the encounter is in the workup stage. Other clinicians can read it but cannot overwrite it. Version checks prevent lost updates. Handoff locks further editing. A later clinical correction/addendum workflow remains separate work.

Risk flags remain visible in booking, appointment rows, queue cards, and workup. Full identifiers and raw workup values are not put into audit metadata. Read/write/transition events appear in the existing audit viewer; attributed workup and queue history are also visible in the encounter dialog.

## Seed and boundaries

`npm run db:seed:intake` adds demo rosters and, when the appointment table for the demo tenant is empty, 24 appointments dated relative to execution in PKT. Eight are checked in: four waiting, two in workup, two ready for consultation with saved bilateral examples. Two OD pressure values are elevated examples. This intentionally defers the source brief's completed/no-show examples until those workflows exist.

Re-running this seed preserves appointments and measurements. It does not reset a meeting or automatically create another daily schedule. Subsequent days can be booked through the UI. The migration and seed also run against the dedicated test database through `npm run test:setup`.

Anatomy remains an independent practice workspace. The next milestone connects patient history, Doctor Events, anatomy plans, signing/addenda, and prescriptions to encounters.
