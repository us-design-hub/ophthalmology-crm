# Odoo patient synchronization

OpenEyes receives patient demographic changes at `POST /api/integrations/odoo/patients`. Odoo remains the source of truth for names, identifiers, contact details, date of birth, address, and preferred language. Clinical records, appointments, workups, drawings, prescriptions, and audit history remain in OpenEyes.

## Authentication and configuration

Send `Authorization: Bearer <ODOO_WEBHOOK_SECRET>` and `Content-Type: application/json`. Configure these server-side environment variables:

- `ODOO_WEBHOOK_SECRET`: a long random value stored in Odoo and the application host.
- `ODOO_SERVICE_ACCOUNT_EMAIL`: an active, least-privileged OpenEyes account used to attribute sync writes in the audit log.
- `ODOO_DEFAULT_FACILITY_ID`: the UUID of the active clinic that owns newly imported records.

The route is server-to-server. None of these values belong in browser code or a `NEXT_PUBLIC_` variable.

## Payload

```json
{
  "externalId": "odoo-res-partner-1842",
  "externalUpdatedAt": "2026-09-28T14:30:00Z",
  "givenName": "Amina",
  "familyName": "Khan",
  "dob": "1988-04-19",
  "dobEstimated": false,
  "gender": "female",
  "phone": "+923001234567",
  "identifierType": "cnic",
  "identifier": "4210112345678",
  "city": "Karachi",
  "address": "Example address",
  "preferredLanguage": "en",
  "nextOfKinName": "Ali Khan",
  "nextOfKinPhone": "+923009876543"
}
```

`externalId` must be stable for the life of the Odoo contact. `externalUpdatedAt` should be the Odoo record's UTC update timestamp. Supported identifiers are `cnic`, `passport`, and `guardian_cnic`; guardian CNIC is limited to minors. Phone numbers are normalized to E.164.

## Responses and matching

A successful request returns the OpenEyes patient ID, MRN, and one of these statuses:

- `created`: no safe match existed, so OpenEyes created a patient and the Odoo mapping.
- `linked`: one existing patient matched exactly, was refreshed from Odoo, and received the mapping.
- `updated`: the known Odoo patient was changed.
- `unchanged`: the payload was already processed or was older than the stored Odoo update.

Matching prefers an exact personal identifier. If that is absent, it uses the exact combination of phone, name, and date of birth. Ambiguous matches return HTTP `409` for manual data correction; the integration never guesses. Invalid payloads return `400`, invalid credentials return `401`, and missing integration configuration returns `503`.

## Retry behavior

Odoo may retry on network errors and 5xx responses. Replaying the same payload is safe. Do not retry `400`, `401`, or `409` indefinitely. Store the response and surface these errors to an administrator. The current endpoint limit is 600 requests per minute per deployed application.

Before enabling the webhook, apply migration `012_odoo_clinical_scope.sql`, configure the three environment variables, deploy, and send one synthetic patient. Confirm the patient shows an **Odoo** source label and that `patient.odoo_created` or `patient.odoo_linked` appears in the audit log.
