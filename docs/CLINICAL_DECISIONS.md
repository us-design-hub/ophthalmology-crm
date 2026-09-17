# Milestone 4 clinical decisions

Implemented locally on 14 September 2026. These are demo implementation choices, not client clinical approval. Original client documents remain unchanged.

## Clinical records and access

Patient 360 displays actual encounter history. The additive seed supplies 246 explicitly synthetic imported historical visits across the original 60 patients; Fatima, Nasreen, and Javed have six each. Historical appointments and signatures are demonstration fixtures, not claims of prior credential verification. Registry creation dates represent import into this demo. Newly registered patients receive no fabricated history.

Doctors edit only their own assigned, open consultation encounters in authorized clinics. Nurse/technician clinical access is read-only. Pharmacists see signed prescriptions for the hospital, without access to Doctor Events. Reception cannot access clinical content. Tenant isolation applies to clinical parents, child rows, formulary, and addenda.

Doctor Events retain complaint, bilateral findings, explicitly eye-labelled diagnoses, anatomy-site/eye plans, referral, follow-up, and workup context. The existing eleven procedural anatomy structures and selectable 2D fallback attach the same stable site identifiers. The separate Anatomy practice page remains unsaved practice.

## Signing and amendments

Event and prescription drafts save independently with optimistic version checks. Signing requires review of a canonical JSON snapshot and verification of the current user's password. A changed version, patient flag, or other signed context invalidates a stale review. Failed password attempts are throttled and audited. The event is signed before its prescription.

Snapshots include patient/hospital/prescriber context and clinical content; prescription snapshots also bind the signed event hash. SHA-256 uses sorted object keys, preserved array order, and UTF-8. Database checks verify the stored snapshot hash. Database guards reject changes/deletion to signed parents and their child rows. Addenda are separate, dated, attributed, hashed, append-only records, created by the original author following reauthentication; they remain possible after encounter closure.

Signing, saving, addenda, discarded drafts, exports, and completion create audit events. Audit metadata does not copy clinical narratives. Hashes establish content consistency in this demo; this is not a qualified digital-signature service.

An encounter completes after the event and any prescription are signed. An unsigned prescription can be explicitly discarded with confirmation, allowing completion without medication. Completion removes the encounter from the active queue. Signed prescriptions cannot be discarded. An addendum does not cancel a prescription, replace medication, or implement dispensing reconciliation.

## Prescribing and PDF

Eight generic formulary examples support demonstration; the proposed approximately 40-item catalogue remains pending clinical review. There are no default doses. Each item records strength, dose, route, frequency, duration, instructions, and OD/OS/OU. English and Urdu instructions are preserved.

Warnings flag free-text allergies for reconciliation, non-formulary items, and duplicate drugs/therapy groups where eyes overlap. A warning requires a recorded review reason before signing. This is a basic demo check, not a comprehensive drug-interaction, contraindication, or allergy-matching engine. All clinical examples and placeholder licence numbers require client review.

The PDF prints frozen signed prescription content, original hash, fictional prescriber/licence, patient details, entered directions, and current prescription addenda. Doctor Event addenda remain in the clinical record. A QR/link opens token-protected limited verification with hospital, signature time, hash, and addendum count; it exposes no patient or medication details. Verification is a demo status check. Invalid tokens return 404; PDF and prescription content require authenticated authorization.

PDFs are generated in memory using Chromium, escaped HTML, disabled scripts, and blocked network requests. Generation has a time limit and one in-flight render per process. Deployment must provide compatible Chromium and Urdu fonts; current visual verification is on this Windows machine. Public verification requires a correctly configured external app origin when hosted.

## Remaining scope

Pharmacy is a real signed-prescription inbox with no dispensing or stock mutations. Batch/expiry suggestions, billing, surgery, management previews, reset tooling, deployment, rehearsal, and presentation material follow in later milestones. No claim is made about production readiness, hosting performance targets, full translation, or client acceptance.
