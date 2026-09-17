# Milestone 5 verification

Verified locally on 15 September 2026 using the optimized Next.js build, PostgreSQL, and Chromium. Client acceptance and presentation readiness remain separate.

## Evidence

- Production build and TypeScript passed.
- 26 domain tests passed, including invoice/payment reconciliation, deterministic fixtures, first-expiry exclusions, chronological surgery stages, and preview permission boundaries.
- Nine database tests passed. A real second tenant's preview row is hidden from the first tenant. Missing tenant context hides snapshots. Runtime INSERT, UPDATE, and DELETE on snapshots are denied.
- All six new operations browser scenarios passed: pharmacy batches and mutation denial; invoice/payment/receipt consistency; role and receipt authorization; reporting periods, tablet charts, surgery histories and laterality; actual staff inspection and planned integrations; and audit filters distinguishing real activity from the seeded example.
- The existing clinical walkthrough was extended to open its newly signed prescription in Pharmacy and display exact-formulary sample batch suggestions. It passed.
- The clean full browser run passed 36 of 37 scenarios. The remaining intake walkthrough exceeded its time allowance after a prolonged execution gap and reached the login page through normal session expiry. The focused rerun passed the complete booking, check-in, workup, reload, and doctor-review journey. All 37 scenarios therefore have passing results; the timed-out scenario was verified separately.
- The sample partial-payment receipt was printed to a one-page A4 PDF and visually inspected. It showed a 2,500 invoice, 1,250 payment, 1,250 outstanding, matching invoice/receipt identifiers, and prominent SAMPLE ONLY / NOT PROOF OF PAYMENT labels. Print controls are excluded from print output.
- Desktop management, billing, staff, and surgery screens were visually reviewed. The 820-pixel tablet management layout had no horizontal page overflow. Additional main-preview smoke checks reported no browser page errors.
- Operations seeding was repeated and preserved the existing snapshot. The main preview retains 450 sample invoices, eight stock examples, six surgery cases, and one labelled example audit entry.

## Regression fixture correction

The first browser run passed all new operational scenarios but three older intake API tests exhausted a doctor's slots after accumulated prior test runs. Added `npm run test:setup -- --fresh` to recreate only the dedicated `openeyes_demo_test` schema after explicit database-name and active-client checks. The clean run passed those three scenarios. The presentation database was not reset. This is test preparation, not the Milestone 6 meeting-reset feature.

## Limits

The stock examples still cover the eight-drug demo catalogue, not the proposed approximately forty-item reviewed formulary. Expiry status is evaluated against the current Karachi date while fixture dates stay frozen. Sample invoices and surgery cases are not linked to actual clinical encounters. The browser print dialog produces sample receipts; it does not process a payment. SSO/MFA, emergency access, account editing, dispensing, stock mutation, refunds, consent, surgery progression, hosted deployment, target-device performance acceptance, and client clinical sign-off remain outside this milestone.

See [operations decisions and walkthrough](OPERATIONS_DECISIONS.md) and [the acceptance checklist](DEMO_SCOPE_AND_ACCEPTANCE.md).
