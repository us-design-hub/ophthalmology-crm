# Milestone 4 verification

Verified locally across 14-15 September 2026 with the optimized Next.js build, PostgreSQL, and Chromium. This records implementation evidence, not client sign-off.

## Completed checks

- Production compilation and TypeScript pass.
- 22 domain tests and eight database tests pass, including canonical signature hashes, strict laterality, warning overlap, actual second-tenant clinical isolation, and immutable signed records.
- All eight new clinical browser scenarios pass: the full doctor/PDF/pharmacy journey; password, ownership, review-hash and signed-content checks; draft concurrency and invalid laterality; prescription/addendum guards and limited verification; real patient history and facility restrictions; changed-allergy review invalidation; unsigned prescription discard; Patient 360 and tablet layout.
- The complete regression run passed 30 of 31 scenarios. Its booking-label failure was isolated to implicit select labels after options loaded. Clinic and doctor selects now have explicit labels; the affected intake journey passed against the rebuilt application, including booking, live queue, nursing workup, reload, and doctor review. All 31 scenarios therefore have passing results, with the repaired scenario verified in a focused rerun.
- Desktop and tablet clinical screenshots were visually reviewed. OD remains before OS, workup is bilateral, and patient context stays above the scrolling record.
- A generated prescription PDF was opened and rendered: one A4 page with demo labels, both eyes, entered directions, Urdu text, fictional prescriber/licence, original hash, and a clickable verification link. The QR is visible. Token verification and invalid-token rejection were tested separately.
- The preview's clinical list, formulary, and signed-prescription endpoints returned 200 after authenticated login. Eight active encounters and eight formulary examples remain available; the initial pharmacy list is empty until a prescription is signed.

## Isolation and limits

Browser mutations ran in `openeyes_demo_test`, separate from the presentation database. The additive preview seed preserves active visits and supplies 246 synthetic historical records. Original client files were not modified.

The clinical catalogue, examples, terminology, licence placeholders, full translation, deployment browser/fonts, performance targets, rehearsal, reset tooling, and production acceptance remain pending. See [clinical decisions](CLINICAL_DECISIONS.md) for exact boundaries.
