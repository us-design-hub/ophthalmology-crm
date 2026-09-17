# Usable system implementation

Authorized scope: six connected delivery areas requested by the user, plus removal of the client-facing build roadmap and replacement of the requested footer/disclaimer wording with **Powered by Logic box**. Planning remains in this folder. Existing synthetic records are preserved; a demo reset and backup recording are not requested. Git and Hostinger deployment remain later steps.

## Delivery tracking

- [x] User management and hospital/clinic configuration
- [x] Patient maintenance and complete appointments/queue
- [x] Workup and clinical documentation gaps
- [x] Persistent inventory and pharmacy dispensing
- [x] Encounter-linked billing and cashier reconciliation
- [x] Surgery, operational reports, and live management dashboards
- [x] Remove client-facing roadmap and update branding
- [x] End-to-end authorization, isolation, concurrency, and workflow verification

## Working decisions

- Hospital administrators manage hospital/clinic settings, staff profiles and facility assignment. Security administrators manage credentials, roles, activation and account access. Both can create staff within their permitted role scope. Auditors read without mutation permissions.
- Role/status/password changes revoke affected sessions. The last active administrator cannot be removed; self-disable/self-escalation is blocked. Temporary passwords require change at next login.
- Existing signed content remains immutable. Corrections, stock movements, dispensing, payments, refunds, and surgery transitions retain attribution and audit trails.
- Persistent operational screens have replaced the sample previews. Archived sample snapshot APIs remain read-only. No sample receipt is reclassified as a real transaction.
- New live operational records link to actual registry patient IDs and encounter IDs. All tenant-owned tables use forced RLS and the non-owner runtime role.
- No real payment gateway, external identity provider, messaging provider, or device integration is assumed configured.

This file is an internal implementation record, not a client-facing roadmap.

## Delivered workflows

1. Administration: account creation, temporary password replacement, staff/facility assignment, security access changes, clinic rosters and closures, hospital settings, and session revocation.
2. Intake: audited demographic and encrypted identity corrections, cancellation/rescheduling/no-show, atomic walk-ins, queue priority/departure, and final completion gated by outstanding prescriptions and invoices.
3. Clinical: attributed history amendments, flag resolution, bilateral refraction/logMAR, diagnosis coding fields, prescription quantities, and preserved signature/addendum rules.
4. Pharmacy: persistent batches and stock movements, receipts/transfers/adjustments, thresholds/quarantine, partial dispensing with FEFO and override reasons, and explicit prescription closure.
5. Billing: catalogue prices, encounter invoices, discount controls, partial collection, idempotent payments, real receipts, separately approved refunds and cashier reconciliation.
6. Operations: stored consent documents, laterality checks and surgery progression; facility-scoped CSV/print reports and live database dashboards.

The client-facing roadmap is removed. The requested branding is replaced with Powered by Logic box. Existing frontend styling, translations and reason dialogs are preserved. See README for integration boundaries and USABLE_SYSTEM_VERIFICATION.md for the final checks.
