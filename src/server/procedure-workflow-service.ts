import 'server-only';

import { z } from 'zod';
import type { PoolClient } from 'pg';
import type { AuthUser } from '@/lib/access';
import { procedureDefinitionSchema, type ProcedureDefinition, type ProcedureField } from '@/lib/administration';
import { withTenant } from './db';
import { audit, type AuditContext } from './audit';
import { ApiError } from './http';
import { parseInput } from './administration-service';

const answerValue=z.union([z.string().max(4000),z.number().finite(),z.boolean()]);
const answers=z.record(z.string().regex(/^[a-z][a-z0-9_]{1,59}$/),answerValue).refine(value=>Object.keys(value).length<=80);
const base={id:z.uuid(),version:z.number().int().nonnegative(),eye:z.enum(['OD','OS']),answers};
const workflowActionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('save_preop'),...base}).strict(),
 z.object({action:z.literal('save_operation'),...base}).strict(),
 z.object({action:z.literal('save_followup'),...base,recordKey:z.string().regex(/^[a-z][a-z0-9_]{1,59}$/)}).strict(),
]);
const workflowActions=new Set(['save_preop','save_operation','save_followup']);

const legacyCataractPreop:ProcedureField[]=[
 {code:'axial_length',label:'Axial length (mm)',type:'number',required:true,min:15,max:40,step:.01},
 {code:'keratometry_k1',label:'Keratometry K1 (D)',type:'number',required:true,min:20,max:70,step:.01},
 {code:'keratometry_k2',label:'Keratometry K2 (D)',type:'number',required:true,min:20,max:70,step:.01},
 {code:'target_refraction',label:'Target refraction (D)',type:'number',required:true,min:-20,max:20,step:.01},
 {code:'iol_model',label:'IOL model',type:'text',required:true,maxLength:120},
 {code:'iol_power',label:'IOL power (D)',type:'number',required:true,min:-10,max:60,step:.01},
 {code:'anaesthesia',label:'Planned anaesthesia',type:'select',required:true,options:['topical','local','general']},
 {code:'notes',label:'Preoperative notes',type:'textarea',required:false,maxLength:2000},
];
const legacyCataractFollowup:ProcedureField[]=[
 {code:'uncorrected_acuity',label:'Unaided visual acuity',type:'text',required:true,maxLength:40},
 {code:'corrected_acuity',label:'Corrected visual acuity',type:'text',required:false,maxLength:40},
 {code:'iop',label:'IOP (mmHg)',type:'number',required:true,min:0,max:80,step:.1},
 {code:'wound',label:'Wound',type:'text',required:true,maxLength:500},
 {code:'cornea',label:'Cornea',type:'text',required:true,maxLength:500},
 {code:'anterior_chamber',label:'Anterior chamber',type:'text',required:true,maxLength:500},
 {code:'iol_position',label:'IOL position',type:'text',required:true,maxLength:500},
 {code:'medications',label:'Medications',type:'textarea',required:true,maxLength:1000},
 {code:'plan',label:'Plan',type:'textarea',required:true,maxLength:1500},
 {code:'next_review',label:'Next review date',type:'date',required:false},
];

export function isProcedureWorkflowAction(input:unknown){return !!input&&typeof input==='object'&&workflowActions.has(String((input as {action?:unknown}).action));}

function fieldsFor(code:string,definition:ProcedureDefinition,kind:'preop'|'operation'|'followup'){
 if(kind==='operation')return definition.operationNoteFields;
 if(kind==='preop')return definition.preoperativeFields.length?definition.preoperativeFields:code==='cataract-phaco-iol'?legacyCataractPreop:[];
 return definition.followupFields.length?definition.followupFields:code==='cataract-phaco-iol'?legacyCataractFollowup:[];
}
function followupSchedule(code:string,definition:ProcedureDefinition){return code==='cataract-phaco-iol'&&!definition.followupSchedule.some(item=>item.code==='other')?[...definition.followupSchedule,{code:'other',label:'Additional follow-up',daysAfter:0,required:false}]:definition.followupSchedule;}

function validateAnswers(value:Record<string,string|number|boolean>,fields:ProcedureField[],checks:string[]=[]){
 const allowed=new Set([...fields.map(field=>field.code),...checks]);
 if(Object.keys(value).some(key=>!allowed.has(key)))throw new ApiError(400,'workflowInvalid');
 for(const check of checks)if(typeof value[check]!=='boolean')throw new ApiError(400,'workflowInvalid');
 for(const field of fields){
  const answer=value[field.code],empty=answer===undefined||answer===null||answer==='';
  if(field.required&&empty)throw new ApiError(400,'workflowInvalid');
  if(empty)continue;
  if(field.type==='number'){
   if(typeof answer!=='number'||!Number.isFinite(answer)||(field.min!==undefined&&answer<field.min)||(field.max!==undefined&&answer>field.max))throw new ApiError(400,'workflowInvalid');
  }else{
   if(typeof answer!=='string')throw new ApiError(400,'workflowInvalid');
   if(field.maxLength!==undefined&&answer.length>field.maxLength)throw new ApiError(400,'workflowInvalid');
   if(field.type==='select'&&!field.options?.includes(answer))throw new ApiError(400,'workflowInvalid');
   if(field.type==='date'&&!/^\d{4}-\d{2}-\d{2}$/.test(answer))throw new ApiError(400,'workflowInvalid');
  }
 }
}

async function currentCase(db:PoolClient,user:AuthUser,id:string){
 const row=(await db.query(`SELECT c.*,p.code AS procedure_code,p.definition
  FROM app.surgery_case c JOIN app.procedure_catalogue p ON p.tenant_id=c.tenant_id AND p.id=c.procedure_catalogue_id
  WHERE c.id=$1 AND c.facility_id=ANY($2::uuid[]) FOR UPDATE OF c`,[id,user.facilityIds])).rows[0];
 if(!row)throw new ApiError(404,'caseNotFound');
 const definition=procedureDefinitionSchema.safeParse(row.definition);
 if(!definition.success)throw new ApiError(503,'procedureWorkflowUnavailable');
 return {...row,definition:definition.data};
}

async function preopComplete(db:PoolClient,caseId:string,definition:ProcedureDefinition){
 const required=definition.preoperativeChecks.length>0||definition.preoperativeFields.some(field=>field.required);
 if(!required)return true;
 const record=(await db.query("SELECT answers FROM app.surgery_workflow_record WHERE case_id=$1 AND kind='preop' AND record_key='preop' ORDER BY version DESC LIMIT 1",[caseId])).rows[0];
 if(!record)return false;
 return definition.preoperativeChecks.every(check=>record.answers[check]===true);
}

export async function procedureWorkflowAction(user:AuthUser,input:unknown,context:AuditContext){
 if(!user.permissions.includes('surgery:write'))throw new ApiError(403,'accessDenied');
 if(!user.roles.includes('doctor'))throw new ApiError(403,'doctorRequired');
 const data=parseInput(workflowActionSchema,input);
 return withTenant(user.tenantId,user.id,async db=>{
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`surgery-workflow:${user.tenantId}`]);
  const surgeryCase=await currentCase(db,user,data.id);
  if(surgeryCase.eye!==data.eye)throw new ApiError(409,'lateralityMismatch');
  const kind=data.action==='save_preop'?'preop':data.action==='save_operation'?'operation':'followup';
  const recordKey=data.action==='save_followup'?data.recordKey:kind;
  if(kind==='preop'&&!['consent','preop'].includes(surgeryCase.stage))throw new ApiError(409,'stageConflict');
  if(kind==='operation'&&surgeryCase.stage!=='scheduled')throw new ApiError(409,'stageConflict');
  if(kind==='followup'&&!['operated','discharged','followup'].includes(surgeryCase.stage))throw new ApiError(409,'stageConflict');
  if(kind==='followup'&&!followupSchedule(surgeryCase.procedure_code,surgeryCase.definition).some(item=>item.code===recordKey))throw new ApiError(400,'workflowInvalid');
  if(kind==='operation'&&!await preopComplete(db,data.id,surgeryCase.definition))throw new ApiError(409,'preopRequired');
  const fields=fieldsFor(surgeryCase.procedure_code,surgeryCase.definition,kind);
  validateAnswers(data.answers,fields,kind==='preop'?surgeryCase.definition.preoperativeChecks:[]);
  const latest=Number((await db.query('SELECT coalesce(max(version),0) AS version FROM app.surgery_workflow_record WHERE case_id=$1 AND kind=$2 AND record_key=$3',[data.id,kind,recordKey])).rows[0].version);
  if(latest!==data.version)throw new ApiError(409,'recordChanged');
  const row=(await db.query(`INSERT INTO app.surgery_workflow_record(tenant_id,case_id,procedure_catalogue_id,kind,record_key,eye,version,answers,definition_snapshot,author_id)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,version,created_at AS "createdAt"`,[user.tenantId,data.id,surgeryCase.procedure_catalogue_id,kind,recordKey,data.eye,latest+1,JSON.stringify(data.answers),JSON.stringify(surgeryCase.definition),user.id])).rows[0];
  await audit(db,{tenantId:user.tenantId,actorId:user.id,action:`surgery.${kind}_saved`,entityType:'surgery_workflow_record',entityId:row.id,metadata:{caseId:data.id,recordKey,version:row.version},context});
  return row;
 });
}
