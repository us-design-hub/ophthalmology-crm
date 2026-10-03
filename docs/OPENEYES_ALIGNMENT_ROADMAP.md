# OpenEyes-aligned product roadmap

This roadmap tracks the work required to deliver the ophthalmology workflows the hospital values in OpenEyes while retaining this application's Next.js, TypeScript, PostgreSQL, and AWS-oriented architecture.

## Status legend

- [x] Implemented and covered by the current application
- [~] Implemented foundation, but more work is required for OpenEyes-equivalent depth
- [ ] Not implemented
- [-] Excluded from the agreed product scope

## Current baseline

### Platform, identity, and governance

- [x] Tenant and facility isolation with PostgreSQL row-level security
- [x] Role and facility-based authorization
- [x] Staff administration, account activation, password changes, and session revocation
- [x] Encrypted patient identifiers and masked registry display
- [x] Audit log for security, patient, workflow, and clinical actions
- [x] Immutable signed Doctor Events, prescriptions, evidence, and dated addenda
- [x] Production-mode configuration checks and restricted database runtime role
- [~] Production environment separation and deployment automation
- [ ] Hospital SSO or MFA
- [ ] Emergency break-glass access with reason, expiry, alerting, and audit review
- [ ] Formal periodic access review workflow

### Patient administration and intake

- [x] Patient registry, search, registration, demographic correction, and duplicate checks
- [x] Stable MRN and encrypted identity correction history
- [x] Appointment booking, cancellation, rescheduling, and no-show handling
- [x] Walk-in registration and arrival
- [x] Check-in, full live queue, focused ophthalmic workup queue, dilation, consultation handoff, and direct clinical completion
- [x] Bilateral visual acuity, IOP, refraction, and logMAR workup
- [x] Patient 360/history timeline backed by saved encounters
- [~] Configurable clinic pathways and worklists
- [ ] Patient merge workflow for duplicate records received from an external system

### Clinical record

- [x] Encounter-linked Doctor Event
- [x] Complaint, bilateral findings, diagnoses, plan, referral, and follow-up
- [x] Draft/version conflict protection, review, signing, and addenda
- [x] Role access for doctors, nurses/technicians, and optometrists
- [~] Longitudinal typed-event model comparable to OpenEyes episodes and events
- [x] Versioned examination templates with specialty, clinic, and visit-type assignment
- [x] Required, optional, ordered, role-visible, and conditionally visible examination fields
- [ ] Structured ophthalmic history and systemic/ocular disorder sections
- [~] Initial structured anterior-segment, cornea, lens, fundus, optic-disc, gonioscopy, and motility fields are implemented; clinical refinement remains
- [~] Cataract assessment template is published; retina, glaucoma, cornea, paediatric, and optometry templates remain
- [ ] Outcome, next-step, recall, and management-plan configuration

### Anatomy and clinical drawing

- [x] Interactive bilateral 3D eye anatomy practice workspace
- [x] Accessible 2D fallback and explicit OD/OS semantics
- [x] Persistent bilateral drawing sheets inside Doctor Events
- [x] Apple Pencil-compatible pointer drawing through the browser
- [~] Drawing templates and freehand evidence stored with the signed event
- [~] Initial structured markers cover tears, haemorrhages, exudates, laser areas, grafts, lenses, and tubes; clinical review and catalogue expansion remain
- [x] Marker parameters, anatomical position, laterality, size, rotation, and clinical labels
- [x] Combined structured annotation and freehand overlay
- [x] Drawing comparison across visits
- [ ] Clinician-approved template and marker catalogue

### Prescriptions

- [x] Encounter-linked digital prescription drafts
- [x] Dose, route, frequency, duration, laterality, quantity, and instructions
- [x] Password reauthentication and immutable signing
- [x] Handwritten prescription image/PDF evidence with immutable hashes
- [x] Prescription PDF, QR verification, signed-prescription list, and addenda
- [x] Basic formulary, duplicate-therapy, and allergy warning workflow
- [~] Clinician-approved production formulary
- [ ] Medication favourites and specialty prescription sets
- [ ] Tapering-dose schedules
- [ ] Configurable secondary signatory/countersign policy where required
- [-] Pharmacy dispensing and stock management

### Surgery and consent

- [x] Encounter-linked surgery case with explicit OD/OS
- [x] Sequential surgery stages, scheduling, history, and cancellation
- [x] Uploaded consent evidence with witness and laterality checks
- [~] Basic surgery lifecycle and theatre association
- [~] Procedure catalogue foundation with the active cataract phaco/IOL procedure; administration UI remains
- [~] Structured cataract biometry, IOL planning, clearance, and dilation checks; configurable checklist templates remain
- [x] Cataract-specific operation note with technique, IOL, anaesthesia, complications, and postoperative instructions
- [~] Cataract complications and anaesthesia are structured; device catalogue and theatre personnel remain
- [x] Cataract postoperative instructions and structured day-one, week-one, month-one, and additional follow-up records
- [ ] Structured consent signatories, withdrawal, confirmation, and version history
- [ ] Theatre list and surgical worklist views
- [-] Surgery pricing, estimates, invoicing, and cashier workflow

### Odoo and interoperability

- [x] Authenticated inbound Odoo patient synchronization endpoint
- [x] Stable external identity mapping, safe matching, idempotency, and stale-update protection
- [x] Odoo remains the demographic source of truth while this system owns clinical records
- [~] Production Odoo configuration and staging validation
- [ ] Appointment synchronization from Odoo
- [ ] Patient merge, archive, and deactivation messages
- [ ] Retry queue, dead-letter handling, and integration status dashboard
- [ ] Configurable external-to-internal value mappings
- [ ] Outbound clinical status/events required by the hospital
- [ ] FHIR/HL7 interfaces after the actual receiving systems and use cases are confirmed
- [-] QuickBooks clinical workflow; finance remains in the external finance system

### Reporting and production operations

- [x] Clinical operational CSV and printable reports
- [x] Audit viewer and facility-scoped clinical and surgery dashboards
- [x] Retired pharmacy, cashier, billing, inventory preview routes, permissions, navigation, and runtime database access
- [x] Automated domain, database, and browser test foundations
- [~] Production prescription PDF runtime and Urdu font validation
- [ ] Private S3/KMS evidence and document storage
- [ ] Background job service for synchronization, documents, reports, and notifications
- [ ] Redis-backed cache, rate limits, and job coordination where load testing demonstrates a need
- [ ] AWS staging and production environments
- [ ] Central logs, metrics, alerts, WAF, backup restoration, and disaster-recovery drills
- [ ] iPad usability, concurrency, performance, and load acceptance

## Delivery sequence

### Phase 1 - Configurable ophthalmic examination foundation

Technical implementation is complete. Hospital workflow acceptance is the deployment checkpoint for this phase.

- [x] Define versioned examination templates, sections, fields, options, and validation
- [x] Add per-field role visibility
- [x] Preserve existing Doctor Events by mapping their current data into an initial general-ophthalmology template
- [x] Render structured Doctor Event sections from the assigned template
- [x] Include the exact template version and structured answers in the signed snapshot
- [x] Add administration for draft versioning and clinic/specialty/visit-type assignment while protecting published versions
- [x] Deliver and assign the General Ophthalmology v2 baseline with a documented hospital review checklist

Initial sections:

1. Presenting complaint and history
2. Ocular and systemic history
3. Visual acuity, IOP, and refraction review
4. Anterior segment by eye
5. Lens and cataract findings by eye
6. Fundus and optic-disc findings by eye
7. Diagnoses, management plan, outcome, and follow-up

### Phase 2 - Structured ophthalmic drawing

Technical implementation is complete. Hospital approval of the marker catalogue is the deployment checkpoint for this phase.

- [x] Define the marker data model separately from rendered pixels
- [x] Add an initial marker catalogue; hospital clinical review remains required
- [x] Support touch, Apple Pencil, undo/redo, zoom, pan, and freehand overlay
- [x] Bind drawings to examination sections and signed event snapshots
- [x] Display prior-visit signed drawings for read-only comparison

### Phase 3 - Odoo operational integration

- [ ] Validate the existing patient endpoint against an Odoo staging instance
- [ ] Add appointments, cancellations, patient merges, and deactivations
- [ ] Add retry, replay protection, failure review, and synchronization status
- [ ] Reconcile migrated patients before enabling production writes

### Phase 4 - Specialty templates and longitudinal record

- [~] Cataract assessment is published; retina, glaucoma, cornea, optometry, and general follow-up templates remain
- [x] Present a chronological timeline of typed clinical events, drawings, investigations, prescriptions, consent, and surgery
- [x] Promote signed diagnoses into longitudinal active/resolved problem episodes with attributed status history
- [ ] Add configurable clinic pathways and worklists
- [ ] Add comparison views for measurements and drawings across visits

### Phase 5 - Surgery depth

- [~] Cataract catalogue entry and operation note are complete; catalogue administration remains
- [~] Cataract preoperative checks, intraoperative note, postoperative instructions, and follow-ups are complete; theatre list remains
- [ ] Add further procedure templates based on hospital volume
- [ ] Expand consent into structured signatories and versioned confirmation

### Phase 6 - Production platform

- [ ] Deploy isolated AWS staging
- [ ] Move binary evidence to private object storage
- [ ] Add workers, monitoring, backup restoration, SSO/MFA, and break-glass access
- [ ] Complete security, performance, iPad, clinical workflow, and disaster-recovery acceptance
- [ ] Deploy production and execute controlled data/integration cutover

## Definition of OpenEyes-equivalent scope

The target is equivalent hospital workflow coverage and ophthalmology depth, with a simpler tablet experience and modern integrations. Completion means the hospital can configure and run its required ophthalmology clinics without depending on demo fixtures or the retired pharmacy, cashier, billing, and inventory functions. It does not require duplicating every historical OpenEyes module before launch; modules are delivered according to hospital-approved specialty priority.
