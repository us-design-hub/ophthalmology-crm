# OpenEyes demo scope and acceptance checklist

Status: implementation baseline; client acceptance pending. Milestones 1 through 5 are implemented locally. Checked items below record implementation evidence, not client sign-off.
Prepared: 14 September 2026.

## Purpose

Demonstrate a connected ophthalmology patient journey in a 30-minute meeting, using synthetic data. After demo acceptance, confirm the production scope through discovery and a separate delivery agreement.

This is a new build. The client proposal's references to an existing platform and its implementation schedule are not evidence that reusable software exists.

Source documents, reviewed without modification:

- `OpenEyes_Proposal_Hospital_Name_Visual.docx`: business context and 20 visual references.
- `OpenEyes_Development_Requirements_Spec.md`: proposed full-product requirements.
- `OpenEyes_Client_Demo_Build_Brief.md`: initial demo scope and presentation requirements.

The decisions below resolve inconsistencies for planning. They are proposed defaults, not claims of client approval.

## Scope decisions

| Topic | Demo baseline |
|---|---|
| Hospital identity | Neutral fictional hospital name and placeholder mark until approved branding is supplied. |
| Data | Synthetic patients, identifiers, staff, clinical histories, and financial examples. No real patient data. |
| Working modules | Role access, dashboard, patient search/registration, appointments, queue, workup, Patient 360, Doctor Event, anatomy selection, prescribing, signing/addenda, prescription PDF, audit viewer. |
| Pharmacy | Read actual signed prescriptions from the demo database. Show seeded batch/expiry suggestions. Dispensing and stock mutations disabled. This is a deliberate adjustment to the static pharmacy scope. |
| Billing | Seeded invoice/payment/receipt preview, explicitly labelled sample. No payment or refund processing. |
| Surgery | Read-only seeded stage tracker. No consent capture or stage mutations. |
| Management | Seeded operational/financial charts labelled sample where appropriate. Live dashboard counts derive from working demo records. |
| Administration | Real enforcement of demo roles; read-only staff/security settings previews. MFA preview does not imply MFA is active. |
| Language | English interface; i18n keys throughout. One demonstrable Urdu/RTL screen with a small translated label set. Full Urdu content deferred. |
| Standards | Roadmap page only for FHIR, HL7, and DICOM; no claim of implemented interoperability. |
| Deployment | HTTPS demo environment plus local presentation fallback. Hosting provider, access restriction, and cost remain to be selected. |
| Clinical use | Demo only. Production identity, assurance, operational acceptance, and other proposal readiness gates remain separate work. |

## Presentation scenarios

### Scenario A: new patient intake

1. Sign in as a demo doctor and show today's overview.
2. Switch to the receptionist account.
3. Search for an existing seeded patient to demonstrate a potential duplicate.
4. Register a distinct new synthetic patient.
5. Book today's clinic appointment and check the patient in.
6. Show the patient entering the queue and moving to workup.
7. Switch to the nurse account, save bilateral workup, and show that the saved values remain visible.

The new patient has no prior history. Do not invent past visits for this scenario.

### Scenario B: established patient consultation

1. Open a named demo patient with at least five historical visits and an active encounter.
2. Show prior encounters and current workup in the doctor workspace.
3. Enter findings for both eyes.
4. Rotate the right-eye model, select the optic nerve, and attach OD plus anatomy site to a treatment-plan row.
5. Add a diagnosis and two eye-specific prescription items from the seeded formulary.
6. Review and sign the Doctor Event and prescription using actual reauthentication. Show their statuses separately even if one review flow coordinates both.
7. Attempt an edit to signed content. Show rejection and the addendum route.
8. Add a dated, attributed addendum while retaining the original signed content.
9. Generate and open the prescription PDF.
10. Open pharmacy and show the same signed prescription in its read-only incoming list.

### Scenario C: operations and trust

1. Present the sample billing invoice, payment record, and printable receipt.
2. Show seeded stock warnings, surgery pipeline, and management charts.
3. Open the real audit viewer and locate actions performed during the meeting.
4. If showing a seeded break-glass event, identify it as an example; do not imply that a live emergency-access workflow was demonstrated.
5. Demonstrate the limited Urdu/RTL screen.
6. Close with delivered capabilities, preview boundaries, and the production roadmap.

Suggested meeting allocation: overview 3 minutes, intake 7 minutes, consultation 13 minutes, operations and trust 7 minutes.

## Screen acceptance checklist

Unchecked items are planned requirements, not completed work.

### 1. Demo access and application shell

- [x] Named synthetic accounts provide Receptionist, Nurse/Technician, Doctor, and Auditor demonstration paths.
- [x] Role switching changes the authenticated account and server permissions; choosing a role is not sufficient authorization.
- [x] Hospital name, active user, active role, and demo status are visible.
- [x] Working navigation opens the correct screen; unavailable actions are visibly disabled with an explanation.
- [ ] Demo shortcuts are off by default and prohibited in the production deployment configuration. Deployment mode is distinct from frontend build optimization.
- [ ] Forms, navigation, and patient context are usable at 1366×768 and on the target tablet.

### 2. Dashboard

- [x] Today's appointments, queue, and relevant counts come from the database.
- [x] Newly booked/check-in records update the corresponding counts.
- [x] Financial sample metrics are clearly distinguishable from live encounter metrics.
- [ ] Primary actions lead to registration, appointments, queue, or the selected encounter.

### 3. Patient search and registration

- [x] Search supports name, MRN, phone, and exact identifier matching.
- [x] Potential duplicates appear before record creation; the demo has a deterministic duplicate example.
- [x] Saving a new patient creates a server-generated MRN and persists demographics.
- [x] Identifier storage and search follow the specification's encryption/blind-index approach; displays are masked.
- [x] Phone normalization, required fields, and estimated age/DOB handling work.
- [x] Patient risk flags remain visible when entering clinical screens.

### 4. Appointments and queue

- [x] Book an available clinic/doctor slot and check the patient in without duplicate active encounters.
- [x] Check-in creates the correct queue entry linked to the appointment, encounter, and patient.
- [x] Queue progression persists actor and timestamp and updates another open view within 10 seconds.
- [x] Invalid/repeated transitions do not create duplicate actions.
- [x] Dilation status/timer behavior is explicitly defined before implementation; if included in the demo path, overrides require a recorded reason.
- [x] Walk-ins, no-shows, and early departures have an explicit build/defer decision before expanding beyond the rehearsed path.

### 5. Workup

- [x] OD and OS fields are visible side by side, with patient and encounter context.
- [x] Visual acuity and IOP values save with the eye, measurement metadata, author, and time.
- [x] Supported visual-acuity inputs include the seeded examples without forcing nonnumeric values into numeric conversion.
- [ ] The elevated-value example produces the specified inline flag; presentation examples are reviewed by the client clinical lead.
- [x] Doctor view displays the saved workup without re-entry.
- [x] Refraction and acuity conversion are explicitly scoped before adding them to the demo; the full specification includes them, but the demo prioritizes VA/IOP entry.

### 6. Patient 360

- [x] At least three patients have rich, consistently dated historical records.
- [x] Timeline entries identify visit date, clinical author, event type, and signed status where applicable.
- [x] Opening an entry shows the correct patient record and laterality.
- [x] Newly saved/signed activity appears in the timeline; a new patient has an honest empty-history state.

### 7. Doctor Event and anatomy

- [x] Current patient, encounter, workup, risks, and prior history are accessible without losing context.
- [x] Findings, diagnosis, and treatment retain explicit laterality.
- [x] OD and OS anatomy views rotate/zoom independently and have reset controls.
- [x] The agreed 8–11 structures can be selected and are named visibly; the optic-nerve walkthrough works reliably.
- [x] Selection attaches a stable anatomy-site value and eye to the intended treatment row.
- [x] Internal structure selection is possible through a clear cutaway, visibility control, or labelled selector.
- [x] A selectable 2D fallback produces the same saved eye/site values and works without WebGL.
- [x] Anatomy assets have documented provenance and usable licensing; selection labels are subject to clinical review.

### 8. Signing, addenda, and prescriptions

- [x] Drafts persist and permit authorized editing.
- [x] Signing requires actual credential verification and records author, timestamp, and a hash of a defined content snapshot.
- [x] Signed parent records and their clinical child rows reject mutation server-side.
- [x] Doctor Event and prescription addenda are both represented, dated, attributed, and linked to their originals.
- [x] Prescription items retain drug, strength, dose, route, frequency, duration, instructions, and applicable laterality.
- [x] The PDF matches the signed prescription and includes the required patient/prescriber details and clear demo labelling.
- [x] The QR points to a working, deliberately limited verification view rather than exposing unrestricted patient records.

### 9. Pharmacy, billing, surgery, and management previews

- [x] The newly signed demo prescription appears in the pharmacy incoming list.
- [x] Seeded batches demonstrate first-expiry suggestions, near-expiry examples, and low-stock examples.
- [x] No preview action silently changes stock, dispenses medication, accepts money, or advances surgery stages.
- [x] Sample invoices, payment records, receipts, and charts use consistent amounts and dates.
- [x] Surgery cases show patient, eye, procedure, and stage.
- [x] Preview status and disabled-action explanations remain visible during the walkthrough.

### 10. Audit, localization, and roadmap

- [x] Audit viewer displays real demo access/change/sign/addendum events with actor and timestamp.
- [x] Audit records are append-only for the application account; sensitive payload handling is defined separately from application logs.
- [x] Server permission checks prevent a receptionist from signing or editing clinical records.
- [x] Automated isolation checks use a second test tenant even though the presentation seeds one hospital.
- [ ] The selected Urdu screen changes the agreed labels and layout direction without swapping clinical OD/OS meaning.
- [x] Roadmap labels distinguish planned standards, previews, and delivered functionality.

Milestone 4 evidence and limits: [clinical decisions](CLINICAL_DECISIONS.md) and [verification](MILESTONE_4_VERIFICATION.md). The formulary currently has eight examples; the larger catalogue and clinical review remain pending. Historical records are explicitly synthetic imports.

Milestone 5 boundaries and walkthrough: [operations decisions](OPERATIONS_DECISIONS.md). Working prescriptions and staff reads are explicitly separated from sample financial, stock, surgery, and management records.

## Seed data and rehearsal

- [ ] Repeatable reset/seed process creates one fictional hospital, three clinics, theatre/pharmacy locations, and 12 synthetic staff accounts.
- [x] Approximately 60 synthetic patients and 200+ historical encounters cover the past 18 months.
- [x] Three established demo patients each have at least five visits and coherent current encounters.
- [ ] Today's schedule has 24 appointments distributed across the specified statuses; dates are relative to the seed date in Asia/Karachi.
- [ ] Approximately 40 formulary drugs, example batches, and 90 days of sample financials support the preview screens.
- [ ] Demo reset cannot target a production database.
- [ ] Seed completes from an empty demo database within the brief's 60-second target on the agreed environment.
- [ ] Full walkthrough passes three consecutive rehearsals with no unhandled errors.
- [ ] Loading behavior meets the brief's 1.5-second target on the agreed demo device/network; long-running operations have explicit feedback.
- [ ] HTTPS deployment, local fallback, 2D anatomy fallback, and tablet layout are checked.
- [ ] A five-minute backup recording and one-page delivered-versus-roadmap handout are prepared.

## Build milestones

| Milestone | Deliverable | Exit evidence |
|---|---|---|
| 0. Scope baseline | This checklist, resolved demo boundaries, visual direction | Working and preview modules are explicit; remaining decisions have owners. |
| 1. Anatomy feasibility | Isolated bilateral anatomy interaction and 2D fallback | Select OD optic nerve, attach to plan, switch fallback, retain equivalent values on target hardware. |
| 2. Application foundation | Project setup, schema, migrations, auth/permissions, RLS, i18n, seed, audit foundations | Seeded login works; unauthorized/cross-tenant requests are denied; core relationships validated. |
| 3. Intake journey | Patients, booking, queue, workup | Scenario A completes with persistent data and account switching. |
| 4. Clinical journey | Patient 360, Doctor Event, anatomy integration, signing, addenda, prescription PDF | Scenario B completes; direct attempts to mutate signed content are rejected. |
| 5. Operational previews | Pharmacy read-through, sample billing/surgery/management, audit and roadmap screens | Scenario C completes with clear preview boundaries. |
| 6. Presentation readiness | Deployed demo, reset process, rehearsal, video, handout | All applicable acceptance items pass; exceptions are documented before the meeting. |

The source brief's 10–15 working days is a target pending milestone 1 and a task-level estimate. It is not a committed delivery date. The specification's sprint list does not define sprint duration or staffing.

## Decisions to settle as work progresses

Before visual implementation: confirm whether the screenshot palette/layout is the desired direction or only a functional reference. Default: retain its palette and navigation concept, with denser clinical layouts and neutral branding.

Before committing a demo date: confirm meeting date, available development capacity, review turnaround, target machine, and hosting arrangements.

Before finalizing clinical examples: identify a clinical reviewer for terminology, anatomical labels, sample findings, and prescription examples.

Before production planning: confirm pilot clinic, concurrent users, roles, forms, formulary, diagnosis coding, identifier exceptions, Urdu launch needs, infrastructure, identity provider, printers, migration, integrations, and support expectations.

## Production follow-on

Demo approval accepts the demonstrated experience and direction. It does not approve clinical deployment or automatically include every roadmap module.

Production discovery must complete the data model, including consistent tenant ownership, Doctor Event addenda, item-level dispensing, signed-content rules, catalogues, stock movements, and financial controls. Optical, welfare, advanced inventory, referrals, and FHIR export need explicit scope and acceptance definitions.

External legal/privacy review, independent penetration testing, clinical safety acceptance, witnessed backup restoration, hospital identity acceptance, training, downtime procedures, and operational sign-off remain the readiness responsibilities described in the proposal. Confirm owners and commercial treatment in the production agreement.
