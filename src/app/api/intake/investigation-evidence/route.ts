import { createHash } from 'node:crypto';
import { z } from 'zod';
import { consumeLimit,requestSession } from '@/server/auth';
import { audit,requestContext } from '@/server/audit';
import { withTenant } from '@/server/db';
import { ApiError,checkOrigin,errorResponse,json } from '@/server/http';

const uuid=z.uuid();
async function editableInvestigation(db:import('pg').PoolClient,user:{id:string;facilityIds:string[]},id:string){
 const row=(await db.query(`SELECT r.id,r.encounter_id,r.author_id,r.stage,e.stage AS encounter_stage FROM app.investigation_result r JOIN app.encounter e ON e.id=r.encounter_id AND e.tenant_id=r.tenant_id WHERE r.id=$1 AND e.facility_id=ANY($2::uuid[]) FOR UPDATE OF e`,[id,user.facilityIds])).rows[0];
 if(!row)throw new ApiError(404,'clinicalNotFound');if(row.author_id!==user.id)throw new ApiError(403,'clinicalOwner');if(row.stage!==row.encounter_stage)throw new ApiError(409,'investigationStageLocked');return row;
}

export async function POST(request:Request){try{
 checkOrigin(request);const {user}=await requestSession(request,'workup:write');await consumeLimit(`investigation-evidence:${user.tenantId}:${user.id}`,20,60);
 const reader=request.body?.getReader();if(!reader)throw new ApiError(400,'invalidRequest');const chunks:Uint8Array[]=[];let length=0;
 for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>6*1024*1024){await reader.cancel();throw new ApiError(413,'fileTooLarge');}chunks.push(value);}
 const form=await new Request(request.url,{method:'POST',headers:request.headers,body:Buffer.concat(chunks)}).formData();const investigationId=form.get('investigationId');if(!uuid.safeParse(investigationId).success)throw new ApiError(400,'validationFailed');
 const file=form.get('file');if(!(file instanceof File)||file.size<1||file.size>5242880)throw new ApiError(400,'invalidFile');const content=Buffer.from(await file.arrayBuffer());
 const mime=content.subarray(0,5).toString()==='%PDF-'?'application/pdf':content.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':content[0]===255&&content[1]===216&&content[2]===255?'image/jpeg':null;if(!mime)throw new ApiError(400,'invalidFile');
 const result=await withTenant(user.tenantId,user.id,async db=>{const parent=await editableInvestigation(db,user,investigationId as string);if(Number((await db.query('SELECT count(*) FROM app.investigation_evidence WHERE investigation_id=$1',[investigationId])).rows[0].count)>=5)throw new ApiError(409,'evidenceLimit');
  const hash=createHash('sha256').update(content).digest('hex');let row;try{row=(await db.query(`INSERT INTO app.investigation_evidence(tenant_id,investigation_id,content,mime,filename,hash,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,filename,mime,hash,captured_at AS "capturedAt"`,[user.tenantId,investigationId,content,mime,file.name.replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,160)||'investigation-evidence',hash,user.id])).rows[0];}catch(error){if((error as {code?:string}).code==='23505')throw new ApiError(409,'evidenceDuplicate');throw error;}
  await audit(db,{tenantId:user.tenantId,actorId:user.id,action:'investigation.evidence_uploaded',entityType:'investigation',entityId:investigationId as string,metadata:{encounterId:parent.encounter_id,evidenceId:row.id,hash,mime},context:requestContext(request)});return {...row,actor:user.name};});return json(result,201);
}catch(error){return errorResponse(error);}}

export async function GET(request:Request){try{
 const {user}=await requestSession(request,'clinical:read');const id=new URL(request.url).searchParams.get('id');if(!uuid.safeParse(id).success)throw new ApiError(404,'clinicalNotFound');
 const row=await withTenant(user.tenantId,user.id,async db=>{const found=(await db.query(`SELECT v.content,v.mime,v.filename,v.investigation_id,r.encounter_id FROM app.investigation_evidence v JOIN app.investigation_result r ON r.id=v.investigation_id AND r.tenant_id=v.tenant_id JOIN app.encounter e ON e.id=r.encounter_id AND e.tenant_id=r.tenant_id WHERE v.id=$1 AND e.facility_id=ANY($2::uuid[])`,[id,user.facilityIds])).rows[0];if(!found)throw new ApiError(404,'clinicalNotFound');await audit(db,{tenantId:user.tenantId,actorId:user.id,action:'investigation.evidence_viewed',entityType:'investigation',entityId:found.investigation_id,metadata:{encounterId:found.encounter_id,evidenceId:id},context:requestContext(request)});return found;});
 return new Response(row.content,{headers:{'Content-Type':row.mime,'Content-Disposition':`inline; filename="${row.filename}"`,'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Referrer-Policy':'no-referrer'}});
}catch(error){return errorResponse(error);}}

export async function DELETE(request:Request){try{
 checkOrigin(request);const {user}=await requestSession(request,'workup:write');const id=new URL(request.url).searchParams.get('id');if(!uuid.safeParse(id).success)throw new ApiError(404,'clinicalNotFound');
 await withTenant(user.tenantId,user.id,async db=>{const evidence=(await db.query('SELECT investigation_id,hash FROM app.investigation_evidence WHERE id=$1',[id])).rows[0];if(!evidence)throw new ApiError(404,'clinicalNotFound');const parent=await editableInvestigation(db,user,evidence.investigation_id);await db.query('DELETE FROM app.investigation_evidence WHERE id=$1',[id]);await audit(db,{tenantId:user.tenantId,actorId:user.id,action:'investigation.evidence_removed',entityType:'investigation',entityId:evidence.investigation_id,metadata:{encounterId:parent.encounter_id,evidenceId:id,hash:evidence.hash},context:requestContext(request)});});return json({ok:true});
}catch(error){return errorResponse(error);}}
