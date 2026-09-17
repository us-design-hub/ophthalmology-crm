# Milestone 1 verification

Date: 14 September 2026.

Implemented the anatomy prototype and application shell. Full demo acceptance remains pending; patient and clinical record workflows are not implemented in this milestone.

## Verified

- Optimized Next.js build completed, including TypeScript checking and static page generation.
- Five domain tests passed: independent eye selection, separate bilateral rows, duplicate prevention with note preservation, empty-selection handling, and invalid input rejection.
- Six distinct browser scenarios passed across the initial five-scenario run and the focused follow-up run:
  1. Eye/site/note state survives view and prototype-page changes; clearing supports cancellation and confirmation.
  2. Both WebGL models render; OD zoom/orbit leaves the OS image unchanged.
  3. Directly clicking the OD optic nerve selects the correct site; graphics context loss falls back to SVG without losing that selection.
  4. Devices without WebGL2 automatically use the selectable 2D diagram and can add plan rows.
  5. All eleven OD structures can be selected with keyboard controls and added without affecting OS.
  6. Tablet/RTL display preserves OD/OS order and selection; tablet and narrow-mobile layouts have no page-width overflow.
- Desktop and tablet/RTL screenshots were inspected.
- Local preview started on `http://127.0.0.1:3000` using the optimized build.

## Test environment

Windows, Node.js 20.20.1, Chromium Headless Shell with software graphics. Exact dependency versions are recorded in `package-lock.json`.

## Still to validate

- Anatomical geometry and terminology with the client clinical reviewer.
- Rendering, interaction latency, and usability on the actual presentation machine.
- The client's preferred branding and visual direction.
- All persistence, authentication, authorization, audit, registration, queue, signing, print, and deployment-readiness requirements in the full demo checklist.

The prototype does not contain a patient database or real patient records. None of these checks establishes production or clinical readiness.
