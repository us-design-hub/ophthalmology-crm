import { z } from 'zod';
import { ANATOMY_SITES } from './anatomy';
import { CLINICAL_MARKER_TYPES, DRAWING_TEMPLATES, markerAllowedOnTemplate } from './clinical-drawing';
import type { Encounter, Workup } from './intake';

export const laterality = z.enum(['OD', 'OS', 'OU']);
const text = (length: number) => z.string().trim().max(length);

export const planSchema = z.object({
  id: z.uuid(),
  eye: z.enum(['OD', 'OS']),
  anatomySite: z.enum(ANATOMY_SITES),
  intent: z.enum(['observation', 'medical', 'laser', 'surgical']),
  notes: text(500),
}).strict();

const drawingPointSchema = z.tuple([
  z.number().int().min(0).max(1000),
  z.number().int().min(0).max(1000),
]);
const drawingStrokeSchema = z.object({
  id: z.uuid(),
  color: z.enum(['#7f1d1d', '#1d4ed8', '#15803d', '#111827']),
  width: z.number().int().min(2).max(16),
  points: z.array(drawingPointSchema).min(2).max(240),
}).strict();
const drawingMarkerSchema = z.object({
  id: z.uuid(),
  type: z.enum(CLINICAL_MARKER_TYPES),
  x: z.number().int().min(0).max(1000),
  y: z.number().int().min(0).max(500),
  size: z.number().int().min(12).max(120),
  rotation: z.number().int().min(-180).max(180),
  label: text(120),
}).strict();
export const eyeDrawingSchema = z.object({
  template: z.enum(DRAWING_TEMPLATES),
  sectionId: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
  sectionLabel: text(120).min(1),
  strokes: z.array(drawingStrokeSchema).max(40),
  markers: z.array(drawingMarkerSchema).max(60),
}).strict().superRefine((drawing, context) => {
  drawing.markers.forEach((marker, index) => {
    if (!markerAllowedOnTemplate(marker.type, drawing.template)) {
      context.addIssue({ code: 'custom', path: ['markers', index, 'type'], message: 'Marker is not valid for this drawing template' });
    }
  });
});
export const drawingsSchema = z.object({ OD: eyeDrawingSchema, OS: eyeDrawingSchema }).strict();
export type ClinicalDrawings = z.infer<typeof drawingsSchema>;
export const EMPTY_DRAWINGS: ClinicalDrawings = {
  OD: { template: 'fundus', sectionId: 'clinical_drawing', sectionLabel: 'Clinical drawing', strokes: [], markers: [] },
  OS: { template: 'fundus', sectionId: 'clinical_drawing', sectionLabel: 'Clinical drawing', strokes: [], markers: [] },
};

const fieldId = z.string().regex(/^[a-z][a-z0-9_]{1,63}$/);
export const CLINICAL_TEMPLATE_ROLES = ['nurse', 'optometrist', 'doctor'] as const;
const visibilityRuleSchema = z.object({
  fieldId,
  operator: z.enum(['equals', 'not_equals', 'answered']),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
}).strict().superRefine((rule, context) => {
  if (rule.operator !== 'answered' && rule.value === undefined) {
    context.addIssue({ code: 'custom', message: 'Comparison rules require a value' });
  }
  if (rule.operator === 'answered' && rule.value !== undefined) {
    context.addIssue({ code: 'custom', message: 'Answered rules do not accept a value' });
  }
});

export const examinationFieldSchema = z.object({
  id: fieldId,
  label: text(120).min(1),
  type: z.enum(['text', 'textarea', 'number', 'select', 'boolean']),
  laterality: z.enum(['none', 'bilateral']),
  required: z.boolean(),
  maxLength: z.number().int().min(1).max(5000).optional(),
  options: z.array(text(120).min(1)).max(40).optional(),
  unit: text(30).optional(),
  roles: z.array(z.enum(CLINICAL_TEMPLATE_ROLES)).min(1).max(3).optional(),
  visibleWhen: visibilityRuleSchema.optional(),
}).strict().superRefine((field, context) => {
  if (field.type === 'select' && (!field.options || field.options.length === 0)) {
    context.addIssue({ code: 'custom', message: 'Select fields require options' });
  }
  if (field.type !== 'select' && field.options) {
    context.addIssue({ code: 'custom', message: 'Only select fields accept options' });
  }
});

export const examinationTemplateDefinitionSchema = z.object({
  sections: z.array(z.object({
    id: fieldId,
    title: text(120).min(1),
    description: text(300).optional(),
    fields: z.array(examinationFieldSchema).min(1).max(30),
  }).strict()).min(1).max(20),
}).strict().superRefine((definition, context) => {
  const fields = definition.sections.flatMap(section => section.fields);
  const ids = fields.map(field => field.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: 'custom', message: 'Examination field IDs must be unique' });
  }
  fields.forEach((field, index) => {
    if (field.visibleWhen) {
      const sourceIndex = fields.findIndex(candidate => candidate.id === field.visibleWhen?.fieldId);
      if (sourceIndex < 0 || sourceIndex >= index) {
        context.addIssue({ code: 'custom', message: 'Visibility rules must reference an earlier field' });
      } else if (fields[sourceIndex].laterality !== 'none') {
        context.addIssue({ code: 'custom', message: 'Visibility rules require a non-lateral field' });
      } else {
        const source = fields[sourceIndex];
        const dependentRoles = field.roles ?? CLINICAL_TEMPLATE_ROLES;
        if (source.roles && dependentRoles.some(role => !source.roles?.includes(role))) {
          context.addIssue({ code: 'custom', message: 'Visibility controller must be visible to every dependent role' });
        }
        if (field.visibleWhen.operator !== 'answered') {
          const value = field.visibleWhen.value;
          const validType = source.type === 'number' ? typeof value === 'number'
            : source.type === 'boolean' ? typeof value === 'boolean'
            : typeof value === 'string';
          if (!validType) context.addIssue({ code: 'custom', message: 'Visibility value must match the controller field type' });
          if (source.type === 'select' && typeof value === 'string' && !source.options?.includes(value)) {
            context.addIssue({ code: 'custom', message: 'Visibility value must be a controller option' });
          }
        }
      }
    }
  });
});
const examinationScalarSchema = z.union([text(5000), z.number().finite(), z.boolean()]);
export const examinationAnswersSchema = z.record(
  fieldId,
  z.union([
    examinationScalarSchema,
    z.object({ OD: examinationScalarSchema, OS: examinationScalarSchema }).strict(),
  ]),
).refine(answers => Object.keys(answers).length <= 300);

export type ExaminationField = z.infer<typeof examinationFieldSchema>;
export type ExaminationTemplateDefinition = z.infer<typeof examinationTemplateDefinitionSchema>;
export type ExaminationAnswers = z.infer<typeof examinationAnswersSchema>;
export type ExaminationTemplate = {
  id: string;
  code: string;
  version: number;
  name: string;
  specialty: string;
  definition: ExaminationTemplateDefinition;
};

export function isExaminationFieldVisible(
  field: ExaminationField,
  answers: ExaminationAnswers,
  roles?: readonly string[],
) {
  if (roles && field.roles && !field.roles.some(role => roles.includes(role))) return false;
  if (!field.visibleWhen) return true;
  const answer = answers[field.visibleWhen.fieldId];
  const answered = answer !== undefined && answer !== null && answer !== ''
    && (typeof answer !== 'object' || Object.values(answer).some(value => value !== '' && value !== null && value !== undefined));
  if (field.visibleWhen.operator === 'answered') return answered;
  const equal = answer === field.visibleWhen.value;
  return field.visibleWhen.operator === 'equals' ? equal : !equal;
}

export function validateExaminationAnswers(
  template: ExaminationTemplateDefinition,
  answers: ExaminationAnswers,
  roles?: readonly string[],
) {
  const errors: string[] = [];
  const fields = template.sections.flatMap(section => section.fields);
  for (const key of Object.keys(answers)) {
    const field = fields.find(candidate => candidate.id === key);
    if (!field) errors.push(`${key}:unknown`);
    else if (!isExaminationFieldVisible(field, answers, roles)) {
      const value = answers[key];
      const populated = value !== undefined && value !== null && value !== ''
        && (typeof value !== 'object' || Object.values(value).some(item => item !== '' && item !== null && item !== undefined));
      if (populated) errors.push(`${key}:hidden`);
    }
  }
  for (const field of fields) {
    if (!isExaminationFieldVisible(field, answers, roles)) continue;
    const answer = answers[field.id];
    const bilateral = answer !== null && typeof answer === 'object' && !Array.isArray(answer);
    if (field.laterality === 'bilateral' && answer === undefined) {
      if (field.required) errors.push(`${field.id}:required`);
      continue;
    }
    if (field.laterality === 'bilateral' && !bilateral) {
      errors.push(`${field.id}:laterality`);
      continue;
    }
    const values = field.laterality === 'bilateral' && bilateral
      ? [answer.OD, answer.OS]
      : [answer];
    for (const value of values) {
      const empty = value === undefined || value === null || value === '';
      if (field.required && empty) errors.push(`${field.id}:required`);
      if (empty) continue;
      if (field.type === 'number' && typeof value !== 'number') errors.push(`${field.id}:number`);
      if (field.type === 'boolean' && typeof value !== 'boolean') errors.push(`${field.id}:boolean`);
      if (['text', 'textarea', 'select'].includes(field.type) && typeof value !== 'string') {
        errors.push(`${field.id}:text`);
      }
      if (typeof value === 'string' && field.maxLength && value.length > field.maxLength) {
        errors.push(`${field.id}:length`);
      }
      if (field.type === 'select' && typeof value === 'string' && value && !field.options?.includes(value)) {
        errors.push(`${field.id}:option`);
      }
    }
  }
  return errors;
}
export const eventInputSchema = z.object({
  encounterId: z.uuid(),
  version: z.number().int().nonnegative(),
  templateId: z.uuid().optional(),
  answers: examinationAnswersSchema.default({}),
  complaint: text(1500),
  findings: z.object({ OD: text(2000), OS: text(2000) }).strict(),
  diagnoses: z.array(z.object({
    eye: laterality,
    label: text(200).min(1),
    codeSystem: z.enum(['ICD-10', 'SNOMED CT']).optional(),
    code: text(40).optional(),
    primary: z.boolean().optional(),
  }).strict()).max(12),
  plans: z.array(planSchema).max(22),
  referral: text(1000),
  followUp: text(500),
  drawings: drawingsSchema,
}).strict().refine(
  data => new Set(data.plans.map(plan => `${plan.eye}:${plan.anatomySite}`)).size === data.plans.length,
);

export const rxItemSchema = z.object({
  id: z.uuid(),
  drugId: z.uuid().nullable(),
  quantity: z.number().int().min(1).max(10000).nullable().optional(),
  name: text(150).min(1),
  strength: text(80).min(1),
  eye: laterality,
  dose: text(100).min(1),
  route: text(80).min(1),
  frequency: text(100).min(1),
  duration: text(100).min(1),
  instructions: text(500),
  instructionsUr: text(500),
}).strict();
export const rxInputSchema = z.object({
  encounterId: z.uuid(),
  version: z.number().int().nonnegative(),
  items: z.array(rxItemSchema).max(12),
}).strict();
export const reviewSchema = z.object({
  kind: z.enum(['event', 'prescription']),
  id: z.uuid(),
  version: z.number().int().positive(),
}).strict();
export const signSchema = reviewSchema.extend({
  reviewHash: z.string().regex(/^[a-f0-9]{64}$/),
  password: z.string().min(1).max(256),
  warningReason: text(500).default(''),
}).strict();
export const addendumSchema = z.object({
  kind: z.enum(['event', 'prescription']),
  id: z.uuid(),
  text: text(3000).min(8),
  password: z.string().min(1).max(256),
}).strict();

export type EventInput = z.infer<typeof eventInputSchema>;
export type RxItem = z.infer<typeof rxItemSchema>;
export type RxInput = z.infer<typeof rxInputSchema>;
export type Drug = { id: string; name: string; strength: string; therapyGroup: string };
export type SignedFields = {
  id: string;
  version: number;
  status: 'draft' | 'signed';
  authorId: string;
  author: string;
  signedAt: string | null;
  contentHash: string | null;
  snapshot: Record<string, unknown> | null;
  synthetic: boolean;
};
export type DoctorEvent = EventInput & SignedFields;
export type PrescriptionEvidence = {
  id: string;
  filename: string;
  mime: 'image/jpeg' | 'image/png' | 'application/pdf';
  hash: string;
  capturedAt: string;
  actor: string;
};
export type Prescription = RxInput & SignedFields & { evidence: PrescriptionEvidence[] };
export type Addendum = {
  id: string;
  kind: 'event' | 'prescription';
  text: string;
  author: string;
  at: string;
  contentHash: string;
};
export type ClinicalDetail = {
  encounter: Encounter & { closedAt: string | null };
  patient: {
    id: string;
    name: string;
    mrn: string;
    dob: string;
    gender: string;
    flags: { type: string; value: string }[];
  };
  workup: Workup | null;
  template: ExaminationTemplate;
  event: DoctorEvent | null;
  prescription: Prescription | null;
  addenda: Addendum[];
};
export type ClinicalList = {
  encounters: (Encounter & { eventStatus: 'draft' | 'signed' | null; closedAt: string | null })[];
};
export type DrawingHistory = {
  entries: {
    eventId: string;
    encounterId: string;
    signedAt: string;
    clinic: string;
    author: string;
    drawings: ClinicalDrawings;
  }[];
};
export type Timeline = {
  entries: {
    id: string;
    date: string;
    clinic: string;
    author: string;
    eventId: string | null;
    status: string | null;
    synthetic: boolean;
    workupVersion: number;
    addendumCount: number;
  }[];
};
export type Review = { snapshot: Record<string, unknown>; hash: string; warnings: string[] };

export function prescriptionWarnings(
  items: (RxItem & { therapyGroup?: string })[],
  flags: { type: string; value: string }[],
) {
  const warnings: string[] = [];
  if (flags.some(flag => flag.type === 'allergy')) warnings.push('allergyReview');
  if (items.some(item => !item.drugId)) warnings.push('nonFormularyReview');
  if (items.some((item, index) => items.slice(0, index).some(other =>
    (item.eye === other.eye || item.eye === 'OU' || other.eye === 'OU')
    && ((item.therapyGroup && item.therapyGroup === other.therapyGroup)
      || item.name.toLowerCase() === other.name.toLowerCase())
  ))) warnings.push('duplicateTherapyReview');
  return warnings;
}
