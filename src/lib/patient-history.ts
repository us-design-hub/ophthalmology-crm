import { z } from 'zod';

export const HISTORY_CATEGORIES = ['medical','ocular','family','surgical','drug'] as const;
export const HISTORY_LATERALITIES = ['none','OD','OS','OU'] as const;

export const historyEntryInputSchema = z.object({
  action: z.literal('history'),
  category: z.enum(HISTORY_CATEGORIES),
  title: z.string().trim().min(2).max(160),
  status: z.enum(['active','resolved']),
  laterality: z.enum(HISTORY_LATERALITIES),
  onsetDate: z.union([z.iso.date(),z.literal('')]),
  resolvedDate: z.union([z.iso.date(),z.literal('')]),
  text: z.string().trim().min(1).max(3000),
  supersedesId: z.uuid().nullable().default(null),
}).strict().superRefine((value,context)=>{
  if(value.status==='active'&&value.resolvedDate)context.addIssue({code:'custom',path:['resolvedDate'],message:'Active history cannot have a resolution date'});
  if(value.status==='resolved'&&!value.resolvedDate)context.addIssue({code:'custom',path:['resolvedDate'],message:'Resolved history requires a resolution date'});
  if(value.onsetDate&&value.resolvedDate&&value.resolvedDate<value.onsetDate)context.addIssue({code:'custom',path:['resolvedDate'],message:'Resolution cannot precede onset'});
});

export type PatientHistoryEntry = {
  id: string;
  category: typeof HISTORY_CATEGORIES[number];
  title: string;
  status: 'active'|'resolved';
  laterality: typeof HISTORY_LATERALITIES[number];
  onsetDate: string|null;
  resolvedDate: string|null;
  text: string;
  at: string;
  author: string;
  supersedesId: string|null;
};

export type PatientHistoryData = {
  history: PatientHistoryEntry[];
  flags: {id:string;type:string;value:string;resolvedAt:string|null;reason:string|null}[];
};
