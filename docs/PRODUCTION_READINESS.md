# Production readiness

This repository supports a demo runtime and a production runtime. A production launch must use a clean database and a non-demo tenant. Do not convert the hosted Supabase demo project: it contains fictional patients, synthetic encounters, shared demonstration accounts, and demonstration audit history.

## Release gate

Run the production preflight from a controlled deployment workstation or CI job that has both the restricted runtime connection and the administrative migration connection:

```sh
npm run preflight:production
```

The check fails unless:

- `APP_MODE=production`, `APP_ORIGIN` uses HTTPS, and `HOSPITAL_CODE` resolves to a non-demo tenant.
- the application connects as the restricted `openeyes_app` database role.
- encryption, search-index, and session secrets are independent 32-byte values.
- every checked-in database migration is present with its original checksum.
- active hospital and security administrators exist.
- the Odoo service account and default clinic are active.
- demo credentials are disabled and retired pharmacy, cashier, and inventory roles have no active users.

Keep `DATABASE_ADMIN_URL` in CI or a protected operator environment. The application runtime needs only `DATABASE_URL`.

## Work required before real patient data

1. Provision separate staging and production environments on AWS. Use a private PostgreSQL database, encrypted backups with point-in-time recovery, a managed secret store, TLS at the load balancer, WAF rules, centralized logs, alarms, and a tested restore procedure.
2. Provision the restricted runtime role with `npm run db:provision:production`, then apply migrations with `npm run db:migrate:production`. Set the one-time bootstrap variables, run `npm run db:bootstrap:production`, copy the printed clinic UUID into `ODOO_DEFAULT_FACILITY_ID`, remove the temporary passwords from the operator environment, and run the production preflight.
3. Configure the Odoo webhook secret, service identity, and default clinic. Validate create, update, duplicate, retry, and outage behavior in staging before enabling the production webhook.
4. Replace PostgreSQL binary evidence storage with private S3 objects encrypted by KMS. Preserve the existing SHA-256 evidence hashes and immutable metadata, use short-lived authenticated downloads, and define retention and legal-hold rules.
5. Package a supported Chromium runtime for prescription PDFs or move rendering to an isolated document service. Verify Urdu fonts and PDF output on the actual AWS image.
6. Add hospital-approved MFA or SSO, recovery, access review, and break-glass procedures. Remove all shared credentials.
7. Complete clinical acceptance on iPads, security testing, performance/load testing, monitoring drills, backup restoration, privacy review, and staff training before cutover.

## Environment separation

Use separate databases, keys, Odoo secrets, storage buckets, and domains for demo, staging, and production. Never copy the demo database into production. Production keys need a documented rotation and escrow procedure because changing identifier encryption or index keys without migration makes existing identifiers unusable.

Set `TRUST_PROXY=true` only when the application is behind a trusted proxy that replaces client-supplied forwarding headers. Otherwise leave it false. The AWS load balancer and application network rules must be configured together before enabling it.

The application already rejects a demo tenant in production mode, hides demo account helpers, requires HTTPS cookies, enforces tenant row-level security, and validates the restricted database role. The preflight turns those assumptions into a repeatable release gate.
