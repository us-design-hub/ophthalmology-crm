import { createHash } from "node:crypto";
import { z } from "zod";
import { consumeLimit, requestSession } from "@/server/auth";
import { audit, requestContext } from "@/server/audit";
import { withTenant } from "@/server/db";
import { ApiError, checkOrigin, errorResponse, json } from "@/server/http";

const uuid=z.uuid();
async function draftPrescription(db:import('pg').PoolClient,user:{id:string;facilityIds:string[]},id:string){
 const row=(await db.query(`SELECT r.id,r.status,r.author_id FROM app.prescription r JOIN app.doctor_event d ON d.id=r.event_id AND d.tenant_id=r.tenant_id JOIN app.encounter e ON e.id=d.encounter_id AND e.tenant_id=d.tenant_id WHERE r.id=$1 AND e.facility_id=ANY($2::uuid[]) FOR UPDATE OF r`,[id,user.facilityIds])).rows[0];
 if(!row)throw new ApiError(404,'clinicalNotFound');
 if(row.author_id!==user.id)throw new ApiError(403,'clinicalOwner');
 if(row.status!=='draft')throw new ApiError(409,'signedLocked');
 return row;
}

export async function POST(request:Request){try{
 checkOrigin(request);const {user}=await requestSession(request,'clinical:write');await consumeLimit(`prescription-evidence:${user.tenantId}:${user.id}`,20,60);
 const reader=request.body?.getReader();if(!reader)throw new ApiError(400,'invalidRequest');const chunks:Uint8Array[]=[];let length=0;
 for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>6*1024*1024){await reader.cancel();throw new ApiError(413,'fileTooLarge');}chunks.push(value);}
 const form=await new Request(request.url,{method:'POST',headers:request.headers,body:Buffer.concat(chunks)}).formData();const prescriptionId=form.get('prescriptionId');if(!uuid.safeParse(prescriptionId).success)throw new ApiError(400,'validationFailed');
 const file=form.get('file');if(!(file instanceof File)||file.size<1||file.size>5242880)throw new ApiError(400,'invalidFile');const content=Buffer.from(await file.arrayBuffer());
 const mime=content.subarray(0,5).toString()==='%PDF-'?'application/pdf':content.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':content[0]===255&&content[1]===216&&content[2]===255?'image/jpeg':null;if(!mime)throw new ApiError(400,'invalidFile');
 const result=await withTenant(user.tenantId,user.id,async db=>{await draftPrescription(db,user,prescriptionId as string);if(Number((await db.query('SELECT count(*) FROM app.prescription_evidence WHERE prescription_id=$1',[prescriptionId])).rows[0].count)>=5)throw new ApiError(409,'evidenceLimit');
  const hash=createHash('sha256').update(content).digest('hex');let row;try{row=(await db.query(`INSERT INTO app.prescription_evidence(tenant_id,prescription_id,content,mime,filename,hash,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,filename,mime,hash,captured_at AS "capturedAt"`,[user.tenantId,prescriptionId,content,mime,file.name.replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,160)||'prescription-evidence',hash,user.id])).rows[0];}catch(error){if((error as {code?:string}).code==='23505')throw new ApiError(409,'evidenceDuplicate');throw error;}
  await audit(db,{tenantId:user.tenantId,actorId:user.id,action:'prescription.evidence_uploaded',entityType:'prescription',entityId:prescriptionId as string,metadata:{evidenceId:row.id,hash,mime},context:requestContext(request)});return {...row,actor:user.name};});return json(result,201);
}catch(error){return errorResponse(error);}}

export async function GET(request:Request){try{
 const {user}=await requestSession(request,'prescription:read');const id=new URL(request.url).searchParams.get('id');if(!uuid.safeParse(id).success)throw new ApiError(404,'clinicalNotFound');
 const row=await withTenant(user.tenantId,user.id,async db=>{const found=(await db.query(`SELECT x.content,x.mime,x.filename,x.prescription_id FROM app.prescription_evidence x JOIN app.prescription r ON r.id=x.prescription_id JOIN app.doctor_event d ON d.id=r.event_id JOIN app.encounter e ON e.id=d.encounter_id WHERE x.id=$1 AND e.facility_id=ANY($2::uuid[])`,[id,user.facilityIds])).rows[0];if(!found)throw new ApiError(404,'clinicalNotFound');await audit(db,{tenantId:user.tenantId,actorId:user.id,action:'prescription.evidence_viewed',entityType:'prescription',entityId:found.prescription_id,metadata:{evidenceId:id},context:requestContext(request)});return found;});
 return new Response(row.content,{headers:{'Content-Type':row.mime,'Content-Disposition':`inline; filename="${row.filename}"`,'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Referrer-Policy':'no-referrer'}});
}catch(error){return errorResponse(error);}}

export async function DELETE(request:Request){try{
 checkOrigin(request);const {user}=await requestSession(request,'clinical:write');const id=new URL(request.url).searchParams.get('id');if(!uuid.safeParse(id).success)throw new ApiError(404,'clinicalNotFound');
 await withTenant(user.tenantId,user.id,async db=>{const evidence=(await db.query('SELECT prescription_id,hash FROM app.prescription_evidence WHERE id=$1',[id])).rows[0];if(!evidence)throw new ApiError(404,'clinicalNotFound');await draftPrescription(db,user,evidence.prescription_id);await db.query('DELETE FROM app.prescription_evidence WHERE id=$1',[id]);await audit(db,{tenantId:user.tenantId,actorId:user.id,action:'prescription.evidence_removed',entityType:'prescription',entityId:evidence.prescription_id,metadata:{evidenceId:id,hash:evidence.hash},context:requestContext(request)});});return json({ok:true});
}catch(error){return errorResponse(error);}}
