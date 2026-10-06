import 'server-only';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import type { AuthUser } from '@/lib/access';
import { investigationInputSchema,type InvestigationResult } from '@/lib/investigations';
import { withTenant } from './db';
import { audit,type AuditContext } from './audit';
import { ApiError } from './http';

function parse<T>(schema:z.ZodType<T>,input:unknown):T{const result=schema.safeParse(input);if(!result.success)throw new ApiError(400,'investigationInvalid');return result.data;}

export async function investigationRows(db:PoolClient,encounterIds:string[]):Promise<InvestigationResult[]>{
 if(!encounterIds.length)return [];
 const rows=(await db.query(`SELECT r.id,r.encounter_id AS "encounterId",r.stage,r.kind,r.eye,r.performed_at AS "performedAt",r.device,r.findings,r.measurements,r.author_id AS "authorId",u.full_name AS author,r.created_at AS "createdAt",
  coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'filename',v.filename,'mime',v.mime,'hash',v.hash,'capturedAt',v.captured_at,'actor',actor.full_name) ORDER BY v.captured_at,v.id) FROM app.investigation_evidence v JOIN app.user_account actor ON actor.id=v.actor_id AND actor.tenant_id=v.tenant_id WHERE v.investigation_id=r.id),'[]') AS evidence
  FROM app.investigation_result r JOIN app.user_account u ON u.id=r.author_id AND u.tenant_id=r.tenant_id
  WHERE r.encounter_id=ANY($1::uuid[]) ORDER BY r.performed_at,r.created_at,r.id`,[encounterIds])).rows;
 return rows as InvestigationResult[];
}

async function accessibleEncounter(db:PoolClient,user:AuthUser,id:string,lock=false){
 const row=(await db.query(`SELECT id,stage,checked_in_at FROM app.encounter WHERE id=$1 AND facility_id=ANY($2::uuid[])${lock?' FOR UPDATE':''}`,[id,user.facilityIds])).rows[0];
 if(!row)throw new ApiError(404,'encounterNotFound');return row;
}

export async function listInvestigations(user:AuthUser,id:unknown,context:AuditContext){
 const encounterId=parse(z.uuid(),id);
 return withTenant(user.tenantId,user.id,async db=>{await accessibleEncounter(db,user,encounterId);const investigations=await investigationRows(db,[encounterId]);await audit(db,{tenantId:user.tenantId,actorId:user.id,action:'investigation.listed',entityType:'encounter',entityId:encounterId,metadata:{count:investigations.length},context});return {investigations};});
}

export async function createInvestigation(user:AuthUser,input:unknown,context:AuditContext){
 const data=parse(investigationInputSchema,input);
 return withTenant(user.tenantId,user.id,async db=>{
  const encounter=await accessibleEncounter(db,user,data.encounterId,true);
  if(encounter.stage!==data.stage)throw new ApiError(409,'investigationStageLocked');
  const performed=new Date(data.performedAt).getTime();if(performed>Date.now()+60000||performed<new Date(encounter.checked_in_at).getTime()-60000)throw new ApiError(400,'measurementTimeInvalid');
  const row=(await db.query(`INSERT INTO app.investigation_result(tenant_id,encounter_id,stage,kind,eye,performed_at,device,findings,measurements,author_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,[user.tenantId,data.encounterId,data.stage,data.kind,data.eye,data.performedAt,data.device,data.findings,JSON.stringify(data.measurements),user.id])).rows[0];
  await audit(db,{tenantId:user.tenantId,actorId:user.id,action:'investigation.recorded',entityType:'investigation',entityId:row.id,metadata:{encounterId:data.encounterId,stage:data.stage,kind:data.kind,eye:data.eye},context});
  return (await investigationRows(db,[data.encounterId])).find(item=>item.id===row.id)!;
 });
}

export async function deleteInvestigation(user:AuthUser,id:unknown,context:AuditContext){
 const investigationId=parse(z.uuid(),id);
 return withTenant(user.tenantId,user.id,async db=>{
  const row=(await db.query(`SELECT r.id,r.encounter_id,r.author_id,e.stage AS encounter_stage,r.stage FROM app.investigation_result r JOIN app.encounter e ON e.id=r.encounter_id AND e.tenant_id=r.tenant_id WHERE r.id=$1 AND e.facility_id=ANY($2::uuid[]) FOR UPDATE OF e`,[investigationId,user.facilityIds])).rows[0];
  if(!row)throw new ApiError(404,'clinicalNotFound');if(row.author_id!==user.id)throw new ApiError(403,'clinicalOwner');if(row.encounter_stage!==row.stage)throw new ApiError(409,'investigationStageLocked');
  await db.query('DELETE FROM app.investigation_result WHERE id=$1',[investigationId]);await audit(db,{tenantId:user.tenantId,actorId:user.id,action:'investigation.removed',entityType:'investigation',entityId:investigationId,metadata:{encounterId:row.encounter_id},context});return {ok:true};
 });
}

export async function hasInvestigation(db:PoolClient,encounterId:string,stage:'testing'|'imaging'){
 return Boolean((await db.query('SELECT 1 FROM app.investigation_result WHERE encounter_id=$1 AND stage=$2 LIMIT 1',[encounterId,stage])).rowCount);
}
