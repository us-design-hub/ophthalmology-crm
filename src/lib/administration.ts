import { z } from 'zod';
import { ASSIGNABLE_ROLES, type Role } from './access';
import { examinationTemplateDefinitionSchema, type ExaminationTemplateDefinition } from './clinical';
import { PATHWAY_STEPS } from './intake';

const text = (max: number) => z.string().trim().max(max);
export const passwordSchema = z.string().min(12).max(256);
const uuidList = z.array(z.uuid()).max(100).refine(values => new Set(values).size === values.length);
export const staffSchema = z.object({ id: z.uuid().optional(), version: z.number().int().nonnegative(), name: text(120).min(1), email: z.email().max(160).transform(value => value.toLowerCase()), designation: text(120).min(1), licence: text(100), licenceExpiry: z.iso.date().nullable(), facilityIds: uuidList, roles: z.array(z.enum(ASSIGNABLE_ROLES)).min(1).max(10).refine(values => new Set(values).size === values.length), temporaryPassword: passwordSchema.optional(), currentPassword: z.string().min(1).max(256) }).strict();
export const accessSchema = z.object({ id:z.uuid(), version:z.number().int().positive(), status:z.enum(['active','disabled']), roles:z.array(z.enum(ASSIGNABLE_ROLES)).min(1).max(10), reason:text(500).min(8), currentPassword:z.string().min(1).max(256), temporaryPassword:passwordSchema.optional() }).strict();
export const settingsSchema = z.object({version:z.number().int().positive(), name:text(120).min(1), mrnPrefix:z.string().trim().regex(/^[A-Z0-9]{2,10}$/), address:text(300), phone:text(40), email:z.union([z.email().max(160),z.literal('')]), clinicalIdleMinutes:z.number().int().min(5).max(60), adminIdleMinutes:z.number().int().min(5).max(60), dilationMinutes:z.number().int().min(1).max(60)}).strict();
const pathwaySchema = z.array(z.enum(PATHWAY_STEPS)).min(1).max(PATHWAY_STEPS.length).refine(values=>values[0]==='workup'&&new Set(values).size===values.length);
export const facilitySchema = z.object({id:z.uuid().optional(), version:z.number().int().nonnegative(), name:text(100).min(1), type:z.enum(['clinic','theatre']), specialty:text(80).min(3), active:z.boolean(), startMinute:z.number().int().min(0).max(1439), endMinute:z.number().int().min(1).max(1440), slotMinutes:z.number().int().min(5).max(60), weekdays:z.array(z.number().int().min(0).max(6)).min(1).max(7), closedDates:z.array(z.iso.date()).max(366), doctorIds:uuidList, pathwaySteps:pathwaySchema, pathwayTargetMinutes:z.number().int().min(5).max(240)}).strict().refine(value=>value.endMinute>value.startMinute && (value.endMinute-value.startMinute)%value.slotMinutes===0);

export const VISIT_TYPES = ['general','new','follow_up','emergency','post_op'] as const;
export const templateActionSchema = z.discriminatedUnion('action', [
  z.object({action:z.literal('createVersion'),sourceId:z.uuid()}).strict(),
  z.object({action:z.literal('saveDraft'),id:z.uuid(),revision:z.number().int().positive(),name:text(120).min(3),specialty:text(80).min(3),definition:examinationTemplateDefinitionSchema}).strict(),
  z.object({action:z.literal('publish'),id:z.uuid(),revision:z.number().int().positive()}).strict(),
  z.object({action:z.literal('assign'),templateId:z.uuid(),facilityId:z.uuid().nullable(),specialty:text(80).min(3),visitType:z.enum(VISIT_TYPES)}).strict(),
]);

export const outcomeActionSchema = z.object({
  id:z.uuid().optional(),
  version:z.number().int().nonnegative(),
  code:z.string().trim().regex(/^[a-z][a-z0-9_]{1,59}$/),
  label:text(120).min(2),
  active:z.boolean(),
  requiresRecall:z.boolean(),
  requiresNotes:z.boolean(),
  displayOrder:z.number().int().min(0).max(1000),
}).strict();

export const PREOPERATIVE_CHECKS = ['biometry_verified','medical_clearance','pupil_dilation'] as const;
export const procedureFieldSchema = z.object({
  code:z.string().trim().regex(/^[a-z][a-z0-9_]{1,59}$/),
  label:text(120).min(2),
  type:z.enum(['text','textarea','number','select','date']),
  required:z.boolean(),
  options:z.array(text(100).min(1)).min(1).max(30).optional(),
  min:z.number().finite().optional(),
  max:z.number().finite().optional(),
  step:z.number().positive().optional(),
  maxLength:z.number().int().min(1).max(4000).optional(),
}).strict().superRefine((field,context)=>{
  if(field.type==='select'&&!field.options)context.addIssue({code:'custom',message:'Select fields require options',path:['options']});
  if(field.type!=='select'&&field.options)context.addIssue({code:'custom',message:'Only select fields may define options',path:['options']});
  if(field.min!==undefined&&field.max!==undefined&&field.min>field.max)context.addIssue({code:'custom',message:'Minimum cannot exceed maximum',path:['min']});
});
const followupScheduleSchema = z.object({code:z.string().trim().regex(/^[a-z][a-z0-9_]{1,59}$/),label:text(120).min(2),daysAfter:z.number().int().min(0).max(3650),required:z.boolean()}).strict();
export const procedureDefinitionSchema = z.object({
  allowedEyes:z.array(z.enum(['OD','OS'])).min(1).max(2).refine(values=>new Set(values).size===values.length),
  preoperativeChecks:z.array(z.enum(PREOPERATIVE_CHECKS)).max(PREOPERATIVE_CHECKS.length).refine(values=>new Set(values).size===values.length),
  preoperativeFields:z.array(procedureFieldSchema).max(40).refine(fields=>new Set(fields.map(field=>field.code)).size===fields.length).default([]),
  operationNoteFields:z.array(procedureFieldSchema).max(40).refine(fields=>new Set(fields.map(field=>field.code)).size===fields.length),
  followupSchedule:z.array(followupScheduleSchema).max(20).refine(items=>new Set(items.map(item=>item.code)).size===items.length),
  followupFields:z.array(procedureFieldSchema).max(40).refine(fields=>new Set(fields.map(field=>field.code)).size===fields.length).default([]),
}).strict();
export const procedureActionSchema = z.discriminatedUnion('action',[
  z.object({action:z.literal('createDraft'),code:z.string().trim().regex(/^[a-z][a-z0-9_-]{2,79}$/),name:text(160).min(3),specialty:text(80).min(3),definition:procedureDefinitionSchema}).strict(),
  z.object({action:z.literal('createVersion'),sourceId:z.uuid()}).strict(),
  z.object({action:z.literal('saveDraft'),id:z.uuid(),revision:z.number().int().positive(),name:text(160).min(3),specialty:text(80).min(3),definition:procedureDefinitionSchema}).strict(),
  z.object({action:z.literal('publish'),id:z.uuid(),revision:z.number().int().positive()}).strict(),
  z.object({action:z.literal('retire'),id:z.uuid(),revision:z.number().int().positive(),reason:text(500).min(8)}).strict(),
]);

export type StaffRecord = {id:string;version:number;name:string;email:string;designation:string;licence:string|null;licenceExpiry:string|null;status:'active'|'disabled';mustChangePassword:boolean;roles:Role[];facilityIds:string[]};
export type FacilityRecord = z.infer<typeof facilitySchema> & {id:string};
export type HospitalSettings = z.infer<typeof settingsSchema>;
export type ExaminationTemplateRecord = {id:string;code:string;version:number;revision:number;name:string;specialty:string;status:'draft'|'published'|'retired';isDefault:boolean;definition:ExaminationTemplateDefinition;updatedAt:string};
export type ExaminationTemplateAssignment = {id:string;templateId:string;facilityId:string|null;specialty:string;visitType:typeof VISIT_TYPES[number];active:boolean};
export type ProcedureDefinition = z.infer<typeof procedureDefinitionSchema>;
export type ProcedureField = z.infer<typeof procedureFieldSchema>;
export type ProcedureCatalogueRecord = {id:string;code:string;version:number;revision:number;name:string;specialty:string;status:'draft'|'published'|'retired';active:boolean;definition:ProcedureDefinition;createdAt:string;publishedAt:string|null;updatedAt:string};
export type ClinicalOutcomeRecord = {id:string;code:string;label:string;active:boolean;requiresRecall:boolean;requiresNotes:boolean;displayOrder:number;version:number};
export type AdministrationData = {staff:StaffRecord[];facilities:FacilityRecord[];hospital:HospitalSettings;templates:ExaminationTemplateRecord[];templateAssignments:ExaminationTemplateAssignment[];procedureCatalogue:ProcedureCatalogueRecord[];clinicalOutcomes:ClinicalOutcomeRecord[]};
