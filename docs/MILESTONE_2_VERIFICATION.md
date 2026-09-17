# Milestone 2 verification

Verified locally on 14 September 2026 with the production Next.js build, workspace PostgreSQL, and Chromium.

## Results

- TypeScript check and production build passed.
- 17 domain/database tests passed: anatomy state, validation, encryption/indexing, permission mapping, actual PostgreSQL tenant isolation, runtime role restrictions, and audit immutability grants.
- 16 browser scenarios passed: patient registration and reload persistence; masked identifiers; role enforcement; origin checks; duplicate review, rejection, and attributed override; concurrent submissions; cross-hospital record denial; disabled accounts; session expiry/logout; login throttling; tablet layouts; and the six anatomy regression scenarios.
- Anatomy camera independence is checked using actual camera position/quaternion, avoiding GPU-dependent pixel equality. Rendering and visual screenshots are checked separately.
- Seed rerun preserved existing preview data. Browser mutations use the separate `openeyes_demo_test` database.
- Registry, login, registration, patient detail, audit, and anatomy screenshots are available under ignored `test-results/`.

## Limits

This verifies a local demo foundation, not deployment or clinical acceptance. Remote CI, backup/restore rehearsals, production identity integration, complete Urdu translation, presentation-device performance, and clinical review remain pending. Patient editing and clinical history are not implemented. Anatomy plans remain unsaved practice state.

The next milestone is appointment/check-in, encounter creation, queue transitions, and persistent bilateral ophthalmic workup.
