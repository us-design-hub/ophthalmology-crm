# Glaucoma specialty workflow review

The Glaucoma clinic now receives the published `Glaucoma assessment` examination template automatically for new, follow-up, and general visits. Existing signed records remain linked to their original template version.

## Implemented workflow

- Bilateral glaucoma diagnosis context, gonioscopy, optic-nerve findings, cup-to-disc ratio, disc haemorrhage, stage, pressure assessment, and progression status
- Target IOP and central corneal thickness with server-enforced clinical bounds
- Visual-field and OCT RNFL/GCC status with per-eye summaries
- Medication adherence, treatment changes, laser or surgery planning, follow-up interval, investigation plan, and safety-netting
- Role-specific nursing and optometry handoff fields
- Optic-disc drawing binding and longitudinal glaucoma comparison in Patient 360

## Hospital clinical review checkpoint

Before production use, the hospital's glaucoma lead should review:

- Diagnosis, staging, gonioscopy, progression, visual-field, and OCT option lists
- Required fields and which disciplines may edit each field
- Target IOP and pachymetry ranges and units
- Recall intervals, escalation wording, and investigation choices
- Whether additional fields are required for local laser and surgical pathways
- The optic-disc marker catalogue and drawing labels

Approved changes should be delivered as a new published template version. Published version 1 is immutable so signed encounters retain the exact structure used at the time of care.
