import { requestSession,consumeLimit } from '@/server/auth';
import { requestContext } from '@/server/audit';
import { ApiError,checkOrigin,errorResponse,json,readJson } from '@/server/http';
import * as clinical from '@/server/clinical-service';
import { prescriptionPdf } from '@/server/prescription-pdf';
type Context={params:Promise<{resource:string}>};
export async function GET(request:Request,context:Context){try{
 const {resource}=await context.params;if(!['list','detail','timeline','formulary','prescriptions','prescription','pdf'].includes(resource))throw new ApiError(404,'invalidRequest');
 const {user}=await requestSession(request,['prescriptions','prescription','pdf'].includes(resource)?'prescription:read':'clinical:read',false);await consumeLimit(`clinical-read:${user.tenantId}:${user.id}`,120,60);
 const query=new URL(request.url).searchParams,audit=requestContext(request);
 if(resource==='list')return json(await clinical.clinicalList(user,audit));
 if(resource==='detail')return json(await clinical.clinicalDetail(user,query.get('encounterId'),audit));
 if(resource==='timeline')return json(await clinical.timeline(user,query.get('patientId'),audit));
 if(resource==='formulary')return json(await clinical.formulary(user));
 if(resource==='prescriptions')return json(await clinical.prescriptionList(user,audit));
 const record=await clinical.signedPrescription(user,query.get('id'),audit);if(resource==='prescription')return json(record);
 await consumeLimit(`pdf:${user.tenantId}:${user.id}`,10,60);const pdf=await prescriptionPdf(record);await clinical.recordPdfExport(user,record.id,audit);
 return new Response(new Uint8Array(pdf),{headers:{'Content-Type':'application/pdf','Content-Disposition':`inline; filename="OpenEyes-prescription-${record.id}.pdf"`,'Cache-Control':'no-store, private','Vary':'Cookie','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
}catch(error){return errorResponse(error);}}
export async function POST(request:Request,context:Context){try{
 checkOrigin(request);const {resource}=await context.params;if(!['event','prescription','review','sign','addendum','complete','discard-prescription'].includes(resource))throw new ApiError(404,'invalidRequest');
 const {user}=await requestSession(request,['sign','addendum'].includes(resource)?'clinical:sign':'clinical:write');await consumeLimit(`clinical-write:${user.tenantId}:${user.id}`,60,60);
 const body=await readJson(request),audit=requestContext(request);
 if(resource==='discard-prescription')return json(await clinical.discardPrescription(user,body,audit));
 if(resource==='event')return json(await clinical.saveEvent(user,body,audit));if(resource==='prescription')return json(await clinical.savePrescription(user,body,audit));if(resource==='review')return json(await clinical.review(user,body,audit));if(resource==='sign')return json(await clinical.sign(user,body,audit));if(resource==='addendum')return json(await clinical.addendum(user,body,audit),201);return json(await clinical.complete(user,body,audit));
}catch(error){return errorResponse(error);}}
