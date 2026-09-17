# Anatomy prototype implementation notes

## Decisions

The initial app uses Next.js App Router, TypeScript, React, Three.js, and React Three Fiber. Reusable CSS tokens establish the prototype's forest-green, burgundy, warm-white palette. Tailwind/shadcn integration is deferred; the recommended styling stack in the specification is not required for proving anatomy interaction. No backend/ORM choice is implied by this milestone.

Use original procedural geometry to avoid introducing uncertain third-party model licences. Start with a cutaway so internal anatomy can be reached. Whole-eye mode remains available; labelled structure buttons expose all sites even when a surface occludes a target.

OD and OS always retain explicit semantic identifiers. The two eye viewports stay ordered OD then OS, including in RTL. A language change affects labels and surrounding layout, not clinical meaning.

Selection state belongs to the workspace, not the renderer. Unmounting a canvas, selecting the SVG fallback, changing language, or navigating between prototype pages cannot silently swap or discard selected eye/site values.

Plan rows are practice state only. Duplicate eye/site pairs are suppressed; the same site in different eyes creates separate rows. Multiple sites on the same eye are permitted. Intent defaults to observation solely as a prototype form value, not a clinical recommendation. No prescription or treatment advice is generated.

## Graphics and accessibility

- Each 3D canvas owns its camera and orbit controls.
- WebGL2 availability is checked; renderer errors and context loss switch both viewers to the 2D workflow.
- 3D rendering is demand-driven with capped device-pixel ratio to limit idle and high-density display work.
- Model geometry is local code, without network asset fetches or remote fonts.
- Every structure is available through a labelled HTML button with selected state. The 2D regions also support Enter/Space activation.
- Cutaway is a view option, not part of clinical selection data.

## Geometry provenance and review

`src/components/anatomy/eye-scene.tsx` and `eye-diagram.tsx` contain original simplified shapes written for this project. No external eye model, photograph, texture, or hospital branding was used.

Third-party rendering libraries and interface icons retain their respective package licences in `node_modules`; this note makes no claim to ownership of those libraries.

The prototype is intended to validate interaction, not anatomical precision. Clinical review should verify structure labels, relative placement, cutaway behavior, macula/optic-disc distinction, surrounding muscle/adnexa representation, and how laterality/site values enter the eventual treatment record.

## Remaining milestone boundaries

Milestone 2 adds authentication, clinical roles, PostgreSQL, and saved patient registration separately from this prototype. Anatomy still has no connected patient context, and its practice plan rows are not saved clinical plans. See `FOUNDATION_DECISIONS.md` for the current foundation boundaries.

Independent camera, fallback, and layout tests supplement rather than replace review on the actual presentation machine and network. Performance acceptance targets in the demo brief remain pending measurement on that environment.
