export const DRAWING_TEMPLATES = ['fundus', 'anterior', 'blank'] as const;
export type DrawingTemplate = (typeof DRAWING_TEMPLATES)[number];

export const CLINICAL_MARKER_TYPES = [
  'retinal_tear',
  'retinal_haemorrhage',
  'hard_exudate',
  'laser_spot',
  'optic_disc_cupping',
  'corneal_scar',
  'corneal_graft',
  'intraocular_lens',
  'drainage_tube',
] as const;

export type ClinicalMarkerType = (typeof CLINICAL_MARKER_TYPES)[number];
export type DrawingSection = { id: string; title: string };

export type ClinicalMarkerDefinition = {
  type: ClinicalMarkerType;
  label: string;
  shortLabel: string;
  color: string;
  templates: readonly DrawingTemplate[];
};

export const CLINICAL_MARKER_CATALOGUE: readonly ClinicalMarkerDefinition[] = [
  { type: 'retinal_tear', label: 'Retinal tear', shortLabel: 'Tear', color: '#b91c1c', templates: ['fundus', 'blank'] },
  { type: 'retinal_haemorrhage', label: 'Retinal haemorrhage', shortLabel: 'Haemorrhage', color: '#7f1d1d', templates: ['fundus', 'blank'] },
  { type: 'hard_exudate', label: 'Hard exudate', shortLabel: 'Exudate', color: '#ca8a04', templates: ['fundus', 'blank'] },
  { type: 'laser_spot', label: 'Laser treatment area', shortLabel: 'Laser', color: '#ea580c', templates: ['fundus', 'blank'] },
  { type: 'optic_disc_cupping', label: 'Optic disc cupping', shortLabel: 'Cupping', color: '#7c3aed', templates: ['fundus', 'blank'] },
  { type: 'corneal_scar', label: 'Corneal scar', shortLabel: 'Scar', color: '#64748b', templates: ['anterior', 'blank'] },
  { type: 'corneal_graft', label: 'Corneal graft', shortLabel: 'Graft', color: '#0284c7', templates: ['anterior', 'blank'] },
  { type: 'intraocular_lens', label: 'Intraocular lens', shortLabel: 'IOL', color: '#2563eb', templates: ['anterior', 'blank'] },
  { type: 'drainage_tube', label: 'Glaucoma drainage tube', shortLabel: 'Tube', color: '#0f766e', templates: ['anterior', 'blank'] },
] as const;

const catalogueByType = new Map(CLINICAL_MARKER_CATALOGUE.map(marker => [marker.type, marker]));

export function clinicalMarkerDefinition(type: ClinicalMarkerType) {
  return catalogueByType.get(type)!;
}

export function clinicalMarkersForTemplate(template: DrawingTemplate) {
  return CLINICAL_MARKER_CATALOGUE.filter(marker => marker.templates.includes(template));
}

export function markerAllowedOnTemplate(type: ClinicalMarkerType, template: DrawingTemplate) {
  return clinicalMarkerDefinition(type).templates.includes(template);
}

export function suggestedDrawingSection(sections: readonly DrawingSection[], template: DrawingTemplate) {
  if (!sections.length) return { id: 'clinical_drawing', title: 'Clinical drawing' };
  const pattern = template === 'anterior'
    ? /anterior|cornea|lens/i
    : template === 'fundus'
      ? /posterior|fundus|retina|optic/i
      : /examination|finding/i;
  return sections.find(section => pattern.test(`${section.id} ${section.title}`)) ?? sections[0];
}
