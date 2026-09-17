import 'server-only';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { verify } from '@node-rs/argon2';
import { timingSafeEqual } from 'node:crypto';
import type { AuthUser } from '@/lib/access';
import { eventInputSchema,rxInputSchema,reviewSchema,signSchema,addendumSchema,prescriptionWarnings,type ClinicalDetail,type DoctorEvent,type Prescription,type Review } from '@/lib/clinical';
import { canonicalJson,contentHash } from './clinical-hash';
import { privateHash } from './crypto';
import { withTenant } from './db';
import { latestWorkup } from './intake-service';
import { consumeLimit,configuredTenant } from './auth';
import { ApiError } from './http';
import { audit,type AuditContext } from './audit';
import { appOrigin } from './config';
function parse<T>(schema:z.ZodType<T>,input:unknown):T {const result=schema.safeParse(input);if(!result.success)throw new ApiError(400,'clinicalInvalid');return result.data;}
const flags=`(SELECT coalesce(jsonb_agg(jsonb_build_object('type',f.type,'value',f.value)),'[]') FROM app.patient_flag f WHERE f.tenant_id=p.tenant_id AND f.patient_id=p.id AND f.resolved_at IS NULL)`;
const encounterSelect=`SELECT e.id,e.patient_id AS "patientId",p.given_name||' '||p.family_name AS name,p.mrn,p.dob,p.gender,${flags} AS flags,e.facility_id AS "facilityId",f.name AS clinic,e.doctor_id AS "doctorId",u.full_name AS doctor,e.stage,e.version,e.checked_in_at AS "checkedInAt",e.stage_at AS "stageAt",e.closed_at AS "closedAt",e.dilation_ready_at AS "dilationReadyAt",coalesce((SELECT max(w.version) FROM app.workup_revision w WHERE w.encounter_id=e.id AND w.tenant_id=e.tenant_id),0) AS "workupVersion",d.status AS "eventStatus" FROM app.encounter e JOIN app.patient p ON p.id=e.patient_id AND p.tenant_id=e.tenant_id JOIN app.facility f ON f.id=e.facility_id AND f.tenant_id=e.tenant_id JOIN app.user_account u ON u.id=e.doctor_id AND u.tenant_id=e.tenant_id LEFT JOIN app.doctor_event d ON d.encounter_id=e.id AND d.tenant_id=e.tenant_id`;
const signedColumns=`d.id,d.version,d.status,d.author_id AS "authorId",u.full_name AS author,d.signed_at AS "signedAt",d.content_hash AS "contentHash",CASE WHEN d.snapshot_text IS NOT NULL THEN d.snapshot_text::jsonb ELSE NULL END AS snapshot,d.synthetic`;
async function log(db:PoolClient,user:AuthUser,context:AuditContext,action:string,kind:string,id?:string,metadata?:Record<string,unknown>) {await audit(db,{tenantId:user.tenantId,actorId:user.id,action,entityType:kind,entityId:id,metadata,context});}
async function lockedEncounter(db:PoolClient,user:AuthUser,id:string,write=false) {
 const row=(await db.query('SELECT * FROM app.encounter WHERE id=$1 AND facility_id=ANY($2::uuid[]) FOR UPDATE',[id,user.facilityIds])).rows[0];
 if(!row)throw new ApiError(404,'encounterNotFound');
 if(write && (row.doctor_id!==user.id))throw new ApiError(403,'clinicalOwner');
 if(write && (row.closed_at || row.stage!=='consultation'))throw new ApiError(409,'consultationRequired');return row;
}
async function loadDetail(db:PoolClient,user:AuthUser,id:string):Promise<ClinicalDetail> {
 await lockedEncounter(db,user,id);
 const encounter=(await db.query(`${encounterSelect} WHERE e.id=$1`,[id])).rows[0];
 const event=(await db.query(`SELECT ${signedColumns},d.encounter_id AS "encounterId",d.complaint,d.findings,d.diagnoses,d.referral,d.follow_up AS "followUp" FROM app.doctor_event d JOIN app.user_account u ON u.id=d.author_id AND u.tenant_id=d.tenant_id WHERE d.encounter_id=$1`,[id])).rows[0] as DoctorEvent|undefined;
 let prescription:Prescription|null=null;
 if(event){event.plans=(await db.query('SELECT id,eye,anatomy_site AS "anatomySite",intent,notes FROM app.event_plan WHERE event_id=$1 ORDER BY eye,anatomy_site',[event.id])).rows;
  prescription=(await db.query(`SELECT ${signedColumns},$2::uuid AS "encounterId" FROM app.prescription d JOIN app.user_account u ON u.id=d.author_id AND u.tenant_id=d.tenant_id WHERE d.event_id=$1`,[event.id,id])).rows[0]??null;
  if(prescription)prescription.items=await items(db,prescription.id);
 }
 const addenda=event?(await db.query(`SELECT a.id,CASE WHEN a.event_id IS NOT NULL THEN 'event' ELSE 'prescription' END AS kind,a.text,u.full_name AS author,a.at,a.content_hash AS "contentHash" FROM app.clinical_addendum a JOIN app.user_account u ON u.id=a.author_id AND u.tenant_id=a.tenant_id WHERE a.event_id=$1 OR a.prescription_id=$2 ORDER BY a.at,a.id`,[event.id,prescription?.id??null])).rows:[];
 return {encounter,patient:{id:encounter.patientId,name:encounter.name,mrn:encounter.mrn,dob:encounter.dob,gender:encounter.gender,flags:encounter.flags},workup:await latestWorkup(db,id),event:event??null,prescription,addenda};
}
async function items(db:PoolClient,id:string){return(await db.query('SELECT id,quantity,drug_id AS "drugId",name,strength,therapy_group AS "therapyGroup",eye,dose,route,frequency,duration,instructions,instructions_ur AS "instructionsUr" FROM app.prescription_item WHERE prescription_id=$1 ORDER BY position',[id])).rows;}
export async function clinicalList(user:AuthUser,context:AuditContext){return withTenant(user.tenantId,user.id,async db=>{const encounters=(await db.query(`${encounterSelect} WHERE e.closed_at IS NULL AND e.stage<>'pharmacy_billing' AND e.facility_id=ANY($1::uuid[]) ORDER BY (e.doctor_id=$2) DESC,e.checked_in_at`,[user.facilityIds,user.id])).rows;await log(db,user,context,'clinical.list','encounter',undefined,{count:encounters.length});return {encounters};});}
export async function clinicalDetail(user:AuthUser,id:unknown,context:AuditContext){const encounterId=parse(z.uuid(),id);return withTenant(user.tenantId,user.id,async db=>{const result=await loadDetail(db,user,encounterId);await log(db,user,context,'clinical.read','encounter',encounterId);return result;});}
export async function timeline(user:AuthUser,id:unknown,context:AuditContext){const patientId=parse(z.uuid(),id);return withTenant(user.tenantId,user.id,async db=>{
 if(!(await db.query('SELECT id FROM app.patient WHERE id=$1',[patientId])).rowCount)throw new ApiError(404,'patientNotFound');
 const entries=(await db.query(`SELECT e.id,e.checked_in_at AS date,f.name AS clinic,u.full_name AS author,d.id AS "eventId",d.status,coalesce(d.synthetic,false) AS synthetic,coalesce((SELECT max(w.version) FROM app.workup_revision w WHERE w.encounter_id=e.id),0) AS "workupVersion",(SELECT count(*)::int FROM app.clinical_addendum a WHERE a.event_id=d.id OR a.prescription_id IN (SELECT r.id FROM app.prescription r WHERE r.event_id=d.id)) AS "addendumCount" FROM app.encounter e JOIN app.facility f ON f.id=e.facility_id JOIN app.user_account u ON u.id=e.doctor_id LEFT JOIN app.doctor_event d ON d.encounter_id=e.id WHERE e.patient_id=$1 AND e.facility_id=ANY($2::uuid[]) ORDER BY e.checked_in_at DESC LIMIT 100`,[patientId,user.facilityIds])).rows;
 await log(db,user,context,'clinical.timeline','patient',patientId,{count:entries.length});return {entries};});}
export async function formulary(user:AuthUser){return withTenant(user.tenantId,user.id,async db=>({drugs:(await db.query('SELECT id,name,strength,therapy_group AS "therapyGroup" FROM app.formulary WHERE active ORDER BY name,strength')).rows}));}
export async function saveEvent(user:AuthUser,input:unknown,context:AuditContext){const data=parse(eventInputSchema,input);return withTenant(user.tenantId,user.id,async db=>{
 await lockedEncounter(db,user,data.encounterId,true);const prior=(await db.query('SELECT * FROM app.doctor_event WHERE encounter_id=$1 FOR UPDATE',[data.encounterId])).rows[0];
 if(prior?.status==='signed')throw new ApiError(409,'signedLocked');if(prior && prior.author_id!==user.id)throw new ApiError(403,'clinicalOwner');if((prior?.version??0)!==data.version)throw new ApiError(409,'clinicalConflict');
 let id=prior?.id as string|undefined;
 if(!id)id=(await db.query('INSERT INTO app.doctor_event(tenant_id,encounter_id,author_id,complaint,findings,diagnoses,referral,follow_up) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[user.tenantId,data.encounterId,user.id,data.complaint,JSON.stringify(data.findings),JSON.stringify(data.diagnoses),data.referral,data.followUp])).rows[0].id;
 else await db.query('UPDATE app.doctor_event SET complaint=$2,findings=$3,diagnoses=$4,referral=$5,follow_up=$6,version=version+1,updated_at=now() WHERE id=$1',[id,data.complaint,JSON.stringify(data.findings),JSON.stringify(data.diagnoses),data.referral,data.followUp]);
 await db.query('DELETE FROM app.event_plan WHERE event_id=$1',[id]);
 for(const plan of data.plans)await db.query('INSERT INTO app.event_plan(id,tenant_id,event_id,eye,anatomy_site,intent,notes) VALUES($1,$2,$3,$4,$5,$6,$7)',[plan.id,user.tenantId,id,plan.eye,plan.anatomySite,plan.intent,plan.notes]);
 await log(db,user,context,'clinical.draft_saved','doctor_event',id,{version:data.version+1});return loadDetail(db,user,data.encounterId);
 });}
export async function savePrescription(user:AuthUser,input:unknown,context:AuditContext){const data=parse(rxInputSchema,input);return withTenant(user.tenantId,user.id,async db=>{
 if(!data.items.length)throw new ApiError(400,'prescriptionEmpty');
 await lockedEncounter(db,user,data.encounterId,true);const event=(await db.query('SELECT id,author_id FROM app.doctor_event WHERE encounter_id=$1',[data.encounterId])).rows[0];if(!event)throw new ApiError(409,'saveEventFirst');if(event.author_id!==user.id)throw new ApiError(403,'clinicalOwner');
 const prior=(await db.query('SELECT * FROM app.prescription WHERE event_id=$1 FOR UPDATE',[event.id])).rows[0];if(prior?.status==='signed')throw new ApiError(409,'signedLocked');if((prior?.version??0)!==data.version)throw new ApiError(409,'clinicalConflict');
 const resolved=[];for(const item of data.items){const drug=item.drugId?(await db.query('SELECT * FROM app.formulary WHERE id=$1 AND active',[item.drugId])).rows[0]:null;if(item.drugId&&!drug)throw new ApiError(400,'drugUnavailable');resolved.push({...item,name:drug?.name??item.name,strength:drug?.strength??item.strength,therapyGroup:drug?.therapy_group??''});}
 let id=prior?.id as string|undefined;if(!id)id=(await db.query('INSERT INTO app.prescription(tenant_id,event_id,author_id) VALUES($1,$2,$3) RETURNING id',[user.tenantId,event.id,user.id])).rows[0].id;else await db.query('UPDATE app.prescription SET version=version+1,updated_at=now() WHERE id=$1',[id]);
 await db.query('DELETE FROM app.prescription_item WHERE prescription_id=$1',[id]);
 for(const [position,item] of resolved.entries())await db.query('INSERT INTO app.prescription_item(id,tenant_id,prescription_id,position,drug_id,name,strength,therapy_group,eye,dose,route,frequency,duration,instructions,instructions_ur,quantity) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',[item.id,user.tenantId,id,position,item.drugId,item.name,item.strength,item.therapyGroup,item.eye,item.dose,item.route,item.frequency,item.duration,item.instructions,item.instructionsUr,item.quantity??null]);
 await log(db,user,context,'prescription.draft_saved','prescription',id,{version:data.version+1});return loadDetail(db,user,data.encounterId);
 });}
async function locate(db:PoolClient,user:AuthUser,kind:'event'|'prescription',id:string,write:boolean){
 const result=kind==='event'?await db.query('SELECT encounter_id FROM app.doctor_event WHERE id=$1',[id]):await db.query('SELECT e.encounter_id FROM app.prescription p JOIN app.doctor_event e ON e.id=p.event_id AND e.tenant_id=p.tenant_id WHERE p.id=$1',[id]);
 if(!result.rowCount)throw new ApiError(404,'clinicalNotFound');await lockedEncounter(db,user,result.rows[0].encounter_id,write);return result.rows[0].encounter_id as string;
}
async function reviewInTransaction(db:PoolClient,user:AuthUser,kind:'event'|'prescription',id:string,version:number):Promise<Review & {encounterId:string}>{
 const encounterId=await locate(db,user,kind,id,true);const detail=await loadDetail(db,user,encounterId);const record=kind==='event'?detail.event:detail.prescription;
 if(!record)throw new ApiError(404,'clinicalNotFound');if(record.status==='signed')throw new ApiError(409,'signedLocked');if(record.authorId!==user.id)throw new ApiError(403,'clinicalOwner');if(record.version!==version)throw new ApiError(409,'clinicalConflict');
 if(!detail.workup)throw new ApiError(409,'workupRequired');
 const licence=(await db.query('SELECT licence_number FROM app.user_account WHERE id=$1',[user.id])).rows[0].licence_number;
 if(!licence)throw new ApiError(409,'licenceRequired');
 const common={schemaVersion:1,kind,id,version,tenantId:user.tenantId,hospital:user.tenantName,encounterId,patient:detail.patient,prescriber:{id:user.id,name:user.name,licence},synthetic:record.synthetic};
 let snapshot:Record<string,unknown>;let warnings:string[]=[];
 if(kind==='event'){const event=detail.event!;if(!event.complaint||!event.findings.OD||!event.findings.OS||!event.diagnoses.length)throw new ApiError(400,'eventIncomplete');snapshot={...common,complaint:event.complaint,findings:event.findings,diagnoses:event.diagnoses,plans:event.plans,referral:event.referral,followUp:event.followUp,workup:detail.workup};}
 else {if(detail.event?.status!=='signed')throw new ApiError(409,'signEventFirst');if(!detail.prescription!.items.length)throw new ApiError(400,'prescriptionEmpty');snapshot={...common,eventId:detail.event.id,eventHash:detail.event.contentHash,items:detail.prescription!.items};warnings=prescriptionWarnings(detail.prescription!.items,detail.patient.flags);}
 return {snapshot,hash:contentHash(snapshot),warnings,encounterId};
}
export async function review(user:AuthUser,input:unknown,context:AuditContext){const data=parse(reviewSchema,input);return withTenant(user.tenantId,user.id,async db=>{const result=await reviewInTransaction(db,user,data.kind,data.id,data.version);await log(db,user,context,'clinical.reviewed',data.kind,data.id,{version:data.version});return result;});}
async function reauthenticate(user:AuthUser,password:string,context:AuditContext){
 await consumeLimit(`clinical-reauth:${user.tenantId}:${user.id}`,10,900);
 const account=await withTenant(user.tenantId,user.id,async db=>(await db.query('SELECT password_hash,status FROM app.user_account WHERE id=$1',[user.id])).rows[0]);
 if(!account||account.status!=='active'||!(await verify(account.password_hash,password).catch(()=>false))){await withTenant(user.tenantId,user.id,db=>log(db,user,context,'clinical.reauth_failed','session'));throw new ApiError(403,'reauthFailed');}
 await withTenant(user.tenantId,user.id,db=>db.query('DELETE FROM app.rate_limit WHERE key=$1',[privateHash(`clinical-reauth:${user.tenantId}:${user.id}`)]));return account.password_hash as string;
}
async function checkReauth(db:PoolClient,user:AuthUser,proof:string){const row=(await db.query("SELECT password_hash FROM app.user_account WHERE id=$1 AND status='active'",[user.id])).rows[0];if(!row||row.password_hash!==proof)throw new ApiError(403,'reauthFailed');}
export async function sign(user:AuthUser,input:unknown,context:AuditContext){const data=parse(signSchema,input);const proof=await reauthenticate(user,data.password,context);return withTenant(user.tenantId,user.id,async db=>{
 await checkReauth(db,user,proof);const result=await reviewInTransaction(db,user,data.kind,data.id,data.version);
 if(result.hash!==data.reviewHash)throw new ApiError(409,'reviewChanged');if(result.warnings.length&&data.warningReason.length<8)throw new ApiError(400,'warningReasonRequired');
 const table=data.kind==='event'?'doctor_event':'prescription';await db.query(`UPDATE app.${table} SET status='signed',signed_at=now(),signed_by=$2,snapshot_text=$3,content_hash=$4,updated_at=now() WHERE id=$1`,[data.id,user.id,canonicalJson(result.snapshot),result.hash]);
 await log(db,user,context,`${data.kind==='event'?'clinical':'prescription'}.signed`,table,data.id,{contentHash:result.hash,version:data.version,warnings:result.warnings,warningReason:data.warningReason});return loadDetail(db,user,result.encounterId);
 });}
export async function addendum(user:AuthUser,input:unknown,context:AuditContext){const data=parse(addendumSchema,input);const proof=await reauthenticate(user,data.password,context);return withTenant(user.tenantId,user.id,async db=>{
 await checkReauth(db,user,proof);const encounterId=await locate(db,user,data.kind,data.id,false);const detail=await loadDetail(db,user,encounterId);const record=data.kind==='event'?detail.event:detail.prescription;
 if(record?.status!=='signed')throw new ApiError(409,'signBeforeAddendum');if(record.authorId!==user.id)throw new ApiError(403,'clinicalOwner');
 const digest=contentHash({parentId:data.id,parentHash:record.contentHash,kind:data.kind,text:data.text,authorId:user.id});const column=data.kind==='event'?'event_id':'prescription_id';
 const result=await db.query(`INSERT INTO app.clinical_addendum(tenant_id,${column},author_id,text,content_hash) VALUES($1,$2,$3,$4,$5) RETURNING id`,[user.tenantId,data.id,user.id,data.text,digest]);
 await log(db,user,context,'clinical.addendum',data.kind,data.id,{addendumId:result.rows[0].id,contentHash:digest});return loadDetail(db,user,encounterId);
 });}
export async function discardPrescription(user:AuthUser,input:unknown,context:AuditContext){const data=parse(z.object({encounterId:z.uuid(),version:z.number().int().positive()}).strict(),input);return withTenant(user.tenantId,user.id,async db=>{
 await lockedEncounter(db,user,data.encounterId,true);const detail=await loadDetail(db,user,data.encounterId);const rx=detail.prescription;if(!rx)throw new ApiError(404,'clinicalNotFound');if(rx.status==='signed')throw new ApiError(409,'signedLocked');if(rx.authorId!==user.id)throw new ApiError(403,'clinicalOwner');if(rx.version!==data.version)throw new ApiError(409,'clinicalConflict');
 await db.query('DELETE FROM app.prescription_item WHERE prescription_id=$1',[rx.id]);await db.query('DELETE FROM app.prescription WHERE id=$1',[rx.id]);await log(db,user,context,'prescription.draft_discarded','prescription',rx.id,{version:rx.version});return loadDetail(db,user,data.encounterId);
 });}
export async function recordPdfExport(user:AuthUser,id:string,context:AuditContext){return withTenant(user.tenantId,user.id,db=>log(db,user,context,'prescription.pdf_exported','prescription',id));}
export async function complete(user:AuthUser,input:unknown,context:AuditContext){const data=parse(z.object({encounterId:z.uuid(),version:z.number().int().positive()}).strict(),input);return withTenant(user.tenantId,user.id,async db=>{
 const encounter=await lockedEncounter(db,user,data.encounterId,true);if(encounter.version!==data.version)throw new ApiError(409,'clinicalConflict');const detail=await loadDetail(db,user,data.encounterId);if(detail.event?.status!=='signed'||(detail.prescription&&detail.prescription.status!=='signed'))throw new ApiError(409,'signBeforeComplete');
 await db.query("UPDATE app.encounter SET stage='pharmacy_billing',stage_at=now(),version=version+1 WHERE id=$1",[data.encounterId]);await db.query("INSERT INTO app.queue_transition(tenant_id,encounter_id,from_stage,to_stage,encounter_version,actor_id) VALUES($1,$2,'consultation','pharmacy_billing',$3,$4)",[user.tenantId,data.encounterId,data.version+1,user.id]);await log(db,user,context,'clinical.completed','encounter',data.encounterId);return loadDetail(db,user,data.encounterId);
 });}
export async function prescriptionList(user:AuthUser,context:AuditContext){return withTenant(user.tenantId,user.id,async db=>{
 const results=(await db.query(`SELECT r.id,r.signed_at AS "signedAt",r.content_hash AS "contentHash",r.snapshot_text::jsonb->'patient'->>'name' AS name,r.snapshot_text::jsonb->'patient'->>'mrn' AS mrn,r.snapshot_text::jsonb->'prescriber'->>'name' AS prescriber,f.name AS clinic,e.encounter_id AS "encounterId",(SELECT count(*)::int FROM app.clinical_addendum a WHERE a.prescription_id=r.id) AS "addendumCount" FROM app.prescription r JOIN app.doctor_event e ON e.id=r.event_id JOIN app.encounter n ON n.id=e.encounter_id JOIN app.facility f ON f.id=n.facility_id WHERE r.status='signed' AND ($1::boolean OR n.facility_id=ANY($2::uuid[])) ORDER BY r.signed_at DESC LIMIT 100`,[user.roles.includes('pharmacist'),user.facilityIds])).rows;await log(db,user,context,'prescription.list','prescription',undefined,{count:results.length});return {prescriptions:results};});}
export async function signedPrescription(user:AuthUser,id:unknown,context:AuditContext){const prescriptionId=parse(z.uuid(),id);return withTenant(user.tenantId,user.id,async db=>{
 const record=(await db.query(`SELECT r.id,r.signed_at AS "signedAt",r.content_hash AS "contentHash",r.snapshot_text::jsonb AS snapshot FROM app.prescription r JOIN app.doctor_event d ON d.id=r.event_id JOIN app.encounter e ON e.id=d.encounter_id WHERE r.id=$1 AND r.status='signed' AND ($2::boolean OR e.facility_id=ANY($3::uuid[]))`,[prescriptionId,user.roles.includes('pharmacist'),user.facilityIds])).rows[0];if(!record)throw new ApiError(404,'clinicalNotFound');
 const addenda=(await db.query('SELECT a.id,a.text,a.at,a.content_hash AS "contentHash",u.full_name AS author FROM app.clinical_addendum a JOIN app.user_account u ON u.id=a.author_id WHERE a.prescription_id=$1 ORDER BY a.at,a.id',[prescriptionId])).rows;
 await log(db,user,context,'prescription.read','prescription',prescriptionId);return {...record,addenda,verificationUrl:`${appOrigin()}/verify/${record.id}?token=${privateHash(`rx-verify:${user.tenantId}:${record.id}:${record.contentHash}`)}`};
 });}
export async function verifyPrescription(id:unknown,token:unknown){if(!z.uuid().safeParse(id).success||typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return null;const tenant=await configuredTenant();return withTenant(tenant.id,undefined,async db=>{
 const record=(await db.query("SELECT id,signed_at,content_hash FROM app.prescription WHERE id=$1 AND status='signed'",[id])).rows[0];if(!record)return null;
 const expected=privateHash(`rx-verify:${tenant.id}:${id}:${record.content_hash}`);if(!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(token,'hex')))return null;
 const count=(await db.query('SELECT count(*)::int AS count FROM app.clinical_addendum WHERE prescription_id=$1',[id])).rows[0].count;
 return {status:'signed',hospital:tenant.name,signedAt:record.signed_at,contentHash:record.content_hash,addendumCount:count,demo:tenant.is_demo};});}
