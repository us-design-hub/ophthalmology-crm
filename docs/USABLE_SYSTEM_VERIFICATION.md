# Usable system verification

Date: 2026-09-16. This record supersedes the read-only operations boundaries in the earlier milestone verification documents.

## Environment and isolation

- Next.js 16.3.5 production build on local Node.js/PostgreSQL 18.
- Database and browser verification uses the dedicated `openeyes_demo_test` database and an owned server on port 3100.
- Preview data is preserved. Migrations 001-011 are applied to the preview database; the one-time live-operations seed adds opening stock and service prices without creating payments or replacing patient records.

## Results

- Production build and TypeScript: passed.
- Unit tests: 26 passed.
- Database checks: 10 passed, including non-owner execution, tenant isolation, immutable signed content and append-only operational ledgers.
- Full browser suite: 44 passed (7.1 minutes). A subsequent display-only separator correction in pharmacy/billing was checked by rebuilding the application.

## Coverage

The browser suite covers registration, encrypted identifiers and masked display, patient corrections, administration and forced password changes, revocation, clinic closures, appointment changes, walk-ins and queue completion, clinical signing/PDF/addenda, refraction, pharmacy quantities and stock, idempotent payments, refund separation and cash variance, surgery consent and eye checks, report permissions, live dashboards and tablet/RTL layout.

Screenshots, Playwright traces and generated PDF samples are stored under ignored `test-results/`. Tests exercise synthetic records, not clinical correctness or external provider integrations. See README for the remaining integration and deployment boundaries.

## Preview smoke check

The updated preview uses `http://127.0.0.1:3001`; an existing process on port 3000 did not respond and was left untouched. Login returned HTTP 200 with Powered by Logic box. Authenticated preview checks returned 12 staff and five facilities, eight medicines with eight opening-stock batches, and five service prices. No artificial invoices or payments were added to the preview. Sessions created by these checks were logged out.
