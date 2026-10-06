import { z } from 'zod';

export const INVESTIGATION_KINDS = ['visual_field','oct_rnfl','pachymetry','gonioscopy','oct_macula','fundus_photo','fluorescein_angiography'] as const;
export type InvestigationKind = typeof INVESTIGATION_KINDS[number];
export type InvestigationStage = 'testing' | 'imaging';
export type InvestigationEye = 'OD' | 'OS' | 'OU';

export const INVESTIGATION_CATALOGUE: Record<InvestigationKind,{label:string;stage:InvestigationStage;fields:{key:string;label:string;type:'number'|'text'|'boolean';min?:number;max?:number;unit?:string}[]}> = {
 visual_field:{label:'Visual field',stage:'testing',fields:[{key:'meanDeviation',label:'Mean deviation',type:'number',min:-40,max:10,unit:'dB'},{key:'patternStdDeviation',label:'Pattern SD',type:'number',min:0,max:30,unit:'dB'},{key:'visualFieldIndex',label:'VFI',type:'number',min:0,max:100,unit:'%'}]},
 oct_rnfl:{label:'OCT RNFL',stage:'testing',fields:[{key:'averageRnfl',label:'Average RNFL',type:'number',min:0,max:500,unit:'µm'},{key:'superiorRnfl',label:'Superior RNFL',type:'number',min:0,max:500,unit:'µm'},{key:'inferiorRnfl',label:'Inferior RNFL',type:'number',min:0,max:500,unit:'µm'},{key:'signalStrength',label:'Signal strength',type:'number',min:0,max:10}]},
 pachymetry:{label:'Pachymetry',stage:'testing',fields:[{key:'centralCornealThickness',label:'Central corneal thickness',type:'number',min:300,max:800,unit:'µm'}]},
 gonioscopy:{label:'Gonioscopy',stage:'testing',fields:[{key:'angleGrade',label:'Shaffer angle grade (0–4)',type:'number',min:0,max:4}]},
 oct_macula:{label:'OCT macula',stage:'imaging',fields:[{key:'centralSubfieldThickness',label:'Central subfield thickness',type:'number',min:100,max:1000,unit:'µm'},{key:'signalStrength',label:'Signal strength',type:'number',min:0,max:10},{key:'fluid',label:'Intraretinal/subretinal fluid',type:'boolean'}]},
 fundus_photo:{label:'Fundus photography',stage:'imaging',fields:[{key:'field',label:'Field / view',type:'text'}]},
 fluorescein_angiography:{label:'Fluorescein angiography',stage:'imaging',fields:[{key:'leakage',label:'Leakage present',type:'boolean'},{key:'perfusion',label:'Perfusion finding',type:'text'}]},
};

const measurementValue=z.union([z.number().finite(),z.string().trim().max(200),z.boolean()]);
export const investigationInputSchema=z.object({
 encounterId:z.uuid(),stage:z.enum(['testing','imaging']),kind:z.enum(INVESTIGATION_KINDS),eye:z.enum(['OD','OS','OU']),
 performedAt:z.iso.datetime({offset:true}),device:z.string().trim().max(120).default(''),findings:z.string().trim().min(3).max(2000),
 measurements:z.record(z.string().regex(/^[a-z][A-Za-z0-9]{0,63}$/),measurementValue).default({}),
}).strict().superRefine((value,context)=>{
 const definition=INVESTIGATION_CATALOGUE[value.kind];
 if(definition.stage!==value.stage)context.addIssue({code:'custom',path:['kind'],message:'Investigation does not belong to this pathway stage'});
 const allowed=new Map(definition.fields.map(field=>[field.key,field]));
 for(const [key,measurement] of Object.entries(value.measurements)){
  const field=allowed.get(key);if(!field){context.addIssue({code:'custom',path:['measurements',key],message:'Unknown measurement'});continue;}
  if(field.type==='number'&&(typeof measurement!=='number'||(field.min!==undefined&&measurement<field.min)||(field.max!==undefined&&measurement>field.max)))context.addIssue({code:'custom',path:['measurements',key],message:'Measurement is outside its permitted range'});
  if(field.type==='boolean'&&typeof measurement!=='boolean')context.addIssue({code:'custom',path:['measurements',key],message:'Measurement must be true or false'});
  if(field.type==='text'&&typeof measurement!=='string')context.addIssue({code:'custom',path:['measurements',key],message:'Measurement must be text'});
 }
});

export type InvestigationInput=z.infer<typeof investigationInputSchema>;
export type InvestigationEvidence={id:string;filename:string;mime:'image/jpeg'|'image/png'|'application/pdf';hash:string;capturedAt:string;actor:string};
export type InvestigationResult=InvestigationInput&{id:string;authorId:string;author:string;createdAt:string;evidence:InvestigationEvidence[]};

export function investigationLabel(kind:InvestigationKind){return INVESTIGATION_CATALOGUE[kind].label;}
