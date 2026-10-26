# Alnoor prototype mapping

The Alnoor prototype is a browser-only workflow reference. This application keeps its useful clinical flow in the existing tenant-isolated, audited PostgreSQL architecture.

## Included

- Native patient registration and duplicate review: name, father/husband/guardian, gender, exact or estimated DOB, CNIC/passport/guardian CNIC, primary and alternate contact, relation, address, city, referral source, programme, language, next of kin, allergies, risk flags, medical conditions, previous surgery and current medication.
- Appointments, walk-ins, check-in and stage-based live queue.
- Technician workup: complaint, duration, glasses status, bilateral unaided/pinhole/corrected/near/glasses vision, IOP and method, keratometry, refraction, logMAR, measurement time and notes.
- Senior technician review: bilateral sphere/cylinder/axis/add/BCVA, binocular PD, colour vision, cover test, recommendation, referral reason, approval or attributed return.
- Doctor consultation: specialty templates, complaint, bilateral examination, diagnoses, plans, referrals, follow-up, anatomy-linked drawings, signing and addenda.
- Laboratory and diagnostic-machine worklists using structured testing/imaging results and immutable evidence attachments.
- Surgery worklist, readiness, consent, theatre workflow, operation note and postoperative follow-up.
- Signed prescription review for pharmacy, including original handwritten evidence, hashes, addenda and printable output. Pharmacy cannot prescribe, alter, dispense, price or manage stock.
- Patient 360, visit comparison, longitudinal problem list, timeline, printable summaries and operational reports.
- Named receptionist, technician, senior technician, optometrist, doctor, laboratory assistant, machine operator, OT coordinator, pharmacy review, hospital administrator, security administrator and auditor roles.

## Deliberately excluded

- Billing, invoices, service prices, discounts, refunds and payment collection.
- Pharmacy dispensing and inventory management.
- Revenue dashboards and financial KPIs.
- Panel/company receivables and payment calculations.
- Prototype plaintext passwords, localStorage records, simulated buttons and browser-only security.

## Workflow equivalences

- The prototype's separate registration and visit-token controls map to registration plus appointment/walk-in check-in, which creates the active encounter and queue position.
- Its BP/sugar and other pre-consultation checks belong in configured testing checkpoints and the signed doctor record rather than a financial or cashier station.
- Its glasses output is captured in the optometry examination template and signed clinical record; refraction measurements remain in the bilateral workup.
- Its report handover maps to immutable signed documents, printable summaries, CSV/print reports and the audited patient timeline.
