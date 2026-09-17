# Milestone 5: operations and trust

Implemented 15 September 2026. Original client documents were read as scope/reference material and were not modified. These decisions describe the local demo, not client acceptance or production approval.

## Working records and sample previews

| Screen | Source and behavior |
|---|---|
| Pharmacy incoming prescriptions | Actual signed demo prescriptions, with original items, dated addenda, PDF, and limited verification. Existing clinical authorization remains in force. |
| Pharmacy stock | Eight sample medicines matched to exact demo formulary IDs. Batch suggestions do not reserve stock or calculate the quantity needed for a prescription. |
| Billing | 450 synthetic invoices over 90 days, with paid, partially paid, and unpaid examples. Search, status filters, totals, pagination, and invoice review work. |
| Receipt | Authenticated printable sample payment receipt. Shows line items, invoice total, the actual sample payment amount, and outstanding balance. A partially paid invoice never prints as fully paid. |
| Surgery | Six sample cases covering assessment, scheduled, pre-op, theatre, recovery, and discharged. Each retains explicit OD/OS, surgeon, procedure, schedule date, and chronological illustrative stage history. |
| Management | Sample collections derived from the exact same invoice/payment ledger as Billing. Seven-, thirty-, and ninety-day period controls and inspectable chart values work. Visit/wait figures are separate illustrative measurements, not live queue calculations. The displayed surgery pipeline is the snapshot's six current cases, independent of the reporting-period filter. |
| Administration | Current demo account names, designations, statuses, roles, facilities, and configured demo licences are read from the database. Password hashes, session data, secrets, and identifiers are excluded. Account editing is disabled. |
| Audit | Actual read-only application audit, with filters for signatures/addenda, preview reads, and the explicitly seeded break-glass example. The example granted no access and is never labelled a live action. |
| Roadmap | Milestones 0-5 delivered locally; presentation readiness is next. FHIR, HL7, and DICOM remain planned with no interoperability or conformance claim. |

## Data and access

The repeatable `db:seed:operations` script stores one versioned JSON snapshot per tenant in `app.operations_preview`. It requires the named demo database and a demo tenant, takes an advisory transaction lock, and leaves an existing snapshot unchanged. Re-running it also preserves the single seeded example audit entry. Snapshot dates are explicit throughout the UI.

Invoices and surgery records use `SAMPLE-` MRNs and `SMP-` record numbers. They are independent presentation examples, not financial or surgical events attached to the clinical registry. Patient names may resemble the synthetic registry, but no link or encounter completion is implied. Payments are deterministic fixtures, never payment-processor results. The snapshot needs the existing clinical formulary seed first.

Forced row-level security limits snapshot reads to the transaction tenant. The application role has SELECT only on snapshots. Preview APIs expose GET only; POST/PATCH/DELETE return 405. The routes additionally require an authenticated session, demo mode/demo tenant, and resource-specific action permission. Tenant IDs from request query strings do not choose another tenant's snapshot.

| Role | Additional preview access |
|---|---|
| Doctor | Inventory, billing, surgery, management, for the connected demo walkthrough |
| Pharmacist | Inventory plus existing signed-prescription access |
| Inventory officer | Inventory; no prescription access |
| Cashier | Billing/receipts |
| Nurse / optometrist | Surgery |
| Hospital administrator / auditor | All operational previews, staff inspection |
| Security administrator | Staff/security inspection |
| Receptionist | No new operational permissions |

The added preview permissions confer no clinical signing, dispensing, stock adjustment, payment, refund, consent, or surgery-stage mutation rights. Existing live clinic Overview counts stay separate from the all-sample Management page. Demo login choices now include operational staff without bypassing normal password verification.

## Inventory rules

For the presentation only, first-expiry selection sorts non-quarantined batches with positive quantity whose expiry date is today or later. It excludes expired, quarantined, and empty batches; an item without a matching formulary ID or eligible batch shows a manual-review message. It does not substitute products. A stock unit is a generic fixture unit; pack conversion, partial dispensing, lot reservation, prescription quantities, and valuation are not implemented.

Two medicines begin below their reorder threshold and two have eligible batches expiring within 30 days. Examples include an expired batch, an empty batch, and a quarantined batch with an earlier expiry to demonstrate their exclusion. Expiry checks use the current Asia/Karachi date; the snapshot is frozen, so warnings can change as the meeting date moves. Snapshot reseeding/reset belongs to Milestone 6. The earlier eight-drug catalogue remains unchanged; the approximately forty-item clinical catalogue awaits review.

## Receipts and security inspection

Receipt routes recheck the session and billing-preview permission. Invalid or inaccessible receipts return 404; unauthenticated page access redirects to login. Receipt pages are no-store, no-referrer, noindex, and clearly marked SAMPLE ONLY / NOT PROOF OF PAYMENT. Browser printing is functional and can save a PDF; the demo does not manufacture a real payment or fiscal receipt.

Staff inspection distinguishes implemented demo controls from planned hospital SSO/MFA, account recovery/access administration, independent assurance, and witnessed backup restoration. The seeded break-glass row is an illustrative audit entry, not an emergency-access feature. Real preview reads and receipt views create separate audit actions. The audit viewer shows hashes for signature/addendum entries without adding clinical narratives to metadata.

## Handover walkthrough

1. Doctor: sign a demo prescription, open Pharmacy, inspect its signed items and sample batch suggestions.
2. Pharmacy: inspect sample low-stock and near-expiry rows, including excluded batches. Dispensing/stock controls are disabled.
3. Cashier: filter to Part paid, open an invoice, open and print its sample receipt. Payment/refund controls remain disabled.
4. Hospital administrator: open Management; change reporting periods, inspect daily values, then open the surgery pipeline and a case's stage history.
5. Administrator: inspect current demo staff and the security-control statuses.
6. Auditor: filter real signatures/addenda and preview actions, then show the clearly labelled seeded break-glass example.
7. Finish on Build roadmap, where interoperability and presentation readiness are planned.

Hosting, reset tooling, target-device performance acceptance, three consecutive rehearsals, backup recording, handout, and clinical/production approval remain Milestone 6 or production follow-on work.

## Test fixture preparation

The regression database supports `npm run test:setup -- --fresh`. This checks the configured and actual database name are exactly `openeyes_demo_test`, refuses other connected test clients, and rebuilds only the test application schema and migration ledger before seeding. It resolves slot exhaustion caused by repeated test bookings. This test-only preparation is separate from the meeting-reset feature planned for Milestone 6.
