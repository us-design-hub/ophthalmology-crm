# OpenEyes clinical workspace

OpenEyes connects Odoo-synchronized patient demographics with ophthalmology appointments, clinical queues, bilateral workup, signed clinical documentation, digital prescriptions, surgery tracking, administration, audit, and operational reporting on PostgreSQL. The frontend supports the existing partial Urdu/RTL interface and iPad-sized layouts.

See [Odoo integration](docs/ODOO_INTEGRATION.md), [production readiness](docs/PRODUCTION_READINESS.md), [current implementation](docs/USABLE_SYSTEM_IMPLEMENTATION.md), and [current verification](docs/USABLE_SYSTEM_VERIFICATION.md). Earlier milestone documents describe historical demo boundaries and are superseded by these records. Planning documents remain in the project folder, outside the client interface.

## Start on this machine

Configuration and the preview database have already been created. Keep PostgreSQL running in one terminal:

```sh
npm run db:local:start
```

In another terminal:

```sh
npm run dev
```

The normal development address is **http://127.0.0.1:3000**. The updated preview started during verification is at **http://127.0.0.1:3001**, because an existing process occupied port 3000. Choose a named demo account, then sign in. Reception can find Odoo-synchronized patients, book, and check in patients. Nurses save workup and hand off; doctors review saved measurements. Auditors read the audit trail. Do not start a second database process if it is already running.

For the optimized preview, use `npm run build` then `npm start`.

## First-time setup elsewhere

Requires Node.js 20.9+ and npm. A real PostgreSQL development runtime is included; no system PostgreSQL or Docker installation is needed.

```sh
npm ci
npm run db:local:init
npm run db:local:start
```

Leave PostgreSQL running and use a second terminal:

```sh
npm run db:migrate
npm run db:seed
npm run db:seed:intake
npm run db:seed:clinical
npx playwright install chromium
npm run dev
```

Initialization generates unique secrets in ignored files: `.env.local` for the application and `.env.db.local` for database administration scripts. Never commit or share these files. Initialization refuses to replace existing configuration or encryption keys.

Database files persist under `.data/postgres`, listening on `127.0.0.1:55432`. The app connects as a non-owner database role without superuser or RLS-bypass privileges. A separately managed PostgreSQL server can provide the same schema and runtime role through `DATABASE_URL`.

The idempotent seed creates one fictional hospital, four facilities, nine named accounts, and sixty synthetic patients. Re-running it preserves registrations. The additive intake seed adds three clinic rosters, 24 appointments, eight arrivals, and two saved workups. The clinical seed adds 246 explicitly synthetic historical visits and eight example formulary entries, without changing the active queue. No presentation-database reset is included.

## Working now

- Password authentication, revocable sessions, forced temporary-password changes, and server-enforced role/facility permissions.
- Hospital administrator staff profiles and facility assignments; security administrator credentials, roles, activation and access. Last-administrator and self-access protections are enforced.
- Hospital settings, clinic schedules, closures and doctor rosters.
- Odoo-owned demographics with authenticated, idempotent synchronization, deterministic matching, encrypted identifiers, masked summaries, and attributed history/flag amendments.
- Appointments, rescheduling, cancellations, no-shows, walk-ins, check-in, queue priority, departure, and clinical visit completion.
- Bilateral VA/IOP, refraction, optional logMAR values, immutable workup revisions, and configurable dilation timing.
- Patient 360, Doctor Events, configurable general, cataract, and glaucoma examinations, coded diagnoses, anatomy plans, persistent bilateral drawing sheets, longitudinal comparison, separate event/prescription signatures, handwritten-prescription evidence, addenda, and prescription PDFs with limited QR verification.
- Eye-specific surgery cases with stored consent documents and gated preoperative, scheduled, operated, discharged and follow-up stages.
- Live attendance, queue timing, documentation and surgery dashboards; CSV and printable operational reports.
- Attributed audit records and forced row-level security on tenant-owned data.
- Independent 3D eyes, eleven selectable structures, SVG fallback and a separate session-only anatomy practice screen.

## Boundaries

The local workspace uses synthetic patients. Real operational writes persist. Signed clinical content, drawing sheets, and prescription evidence remain immutable after signing. Evidence files currently use protected PostgreSQL storage; production AWS deployment can move the same hashed objects to S3 without changing the signed evidence metadata.

Odoo connector acceptance, identity-provider/SSO integration, MFA, email recovery, external messaging, device interfaces and FHIR/HL7/DICOM integrations remain separate work. Terminology codes can be recorded but there is no external terminology service. Urdu coverage is partial. Surgery tracking does not implement a full theatre-resource scheduling engine. Reports support CSV and browser printing; prescription PDFs use server-side Chromium.


PDF generation requires a Playwright-compatible Chromium installation and a font supporting Urdu. This Windows workspace uses its existing `.playwright` browser and Nirmala UI. For deployment, install the browser and system dependencies or set `PDF_CHROMIUM_EXECUTABLE`; verify Urdu rendering on that host. PDF rendering blocks external network requests and keeps generated documents in memory.

Demo credential filling requires `APP_MODE=demo`, `SHOW_DEMO_CREDENTIALS=true`, and a tenant marked as demo. It never bypasses password verification. Outside demo mode, credentials are not shown, demo tenants are rejected, and cookie issuance requires HTTPS. `NODE_ENV` controls build optimization, not demo authorization.

## Production release gate

Use a clean, non-demo database for staging and production. Configure the protected values shown in `.env.production.example`, then run these from a controlled deployment job:

```sh
npm run db:provision:production
npm run db:migrate:production
npm run db:bootstrap:production
npm run preflight:production
```

Bootstrap creates one clinic, separate hospital and security administrators with forced password changes, and a non-interactive Odoo identity. It refuses to modify an existing hospital.

The administrative database URL belongs only in the migration/preflight environment. Do not expose it to the web application. The detailed AWS, Odoo, evidence-storage, PDF, identity, and operational gates are in [production readiness](docs/PRODUCTION_READINESS.md).

## Verification

With PostgreSQL running:

```sh
npm test
npm run test:setup -- --fresh
npm run test:db
npm run build
npx playwright install chromium
npm run test:e2e
```

Database and browser tests use **openeyes_demo_test**, not the preview registry. The browser runner starts and stops its own server on port 3100; free that port before a run. An existing workspace `.playwright` directory is used automatically. `test:setup -- --fresh` recreates only the dedicated test schema after checking the database name and refusing active test clients; use it before a full suite so accumulated test bookings cannot exhaust clinic slots. It cannot reset the presentation database.

Tests cover validation, RLS, immutable records, permissions, session revocation, patient identity handling, appointment/queue races, clinical signing, consent/laterality, live reports, and frontend/RTL interactions. Screenshots and traces go to ignored `test-results/`.

## Project map

- `src/app`: pages, route handlers, styles, error boundary.
- `src/components`: login, registry, registration/detail dialogs, audit, anatomy.
- `src/server`: database transactions, sessions, permissions, audit, encryption, patient services.
- `src/lib`: shared domain types, validation, localization, API client.
- `db/migrations`: checksum-verified SQL migrations.
- `scripts`: local PostgreSQL, migrations, seed, isolated test setup/running.
- `tests`: domain, database, and browser checks.

## Technical references

Implementation references: [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), [Next.js authentication](https://nextjs.org/docs/app/guides/authentication), and [embedded-postgres](https://github.com/leinelissen/embedded-postgres). This milestone uses `pg` and explicit SQL migrations rather than an ORM. Production identity-provider integration remains a separate adapter and acceptance task.

React and React Three Fiber stay within the renderer's supported peer range. Exact versions are recorded in `package-lock.json`.
