import { consumeLimit, requestSession } from "@/server/auth";
import { requestContext } from "@/server/audit";
import { ApiError, checkOrigin, errorResponse, json } from "@/server/http";
import { patientDocumentContent, patientDocumentList, patientFileExportData, uploadPatientDocument } from "@/server/patient-document-service";
import { patientFilePdf } from "@/server/patient-file-export";
import { createZip } from "@/server/zip";

function secureHeaders(type:string,filename:string,inline=false){return {"Content-Type":type,"Content-Disposition":`${inline?"inline":"attachment"}; filename="${filename.replace(/["\r\n]/g,"_")}"`,"Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox","Referrer-Policy":"no-referrer"};}
function detect(content:Buffer){if(content.subarray(0,5).toString()==="%PDF-")return "application/pdf";if(content.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return "image/png";if(content[0]===255&&content[1]===216&&content[2]===255)return "image/jpeg";return null;}

export async function GET(request:Request){try{
 const {user}=await requestSession(request,"document:read");const url=new URL(request.url),id=url.searchParams.get("id"),patientId=url.searchParams.get("patientId"),format=url.searchParams.get("format");
 if(id){const row=await patientDocumentContent(user,id,requestContext(request));return new Response(new Uint8Array(row.content),{headers:secureHeaders(row.mime,row.filename,url.searchParams.get("download")!=="1")});}
 if(!patientId)throw new ApiError(400,"invalidRequest");
 if(format==="pdf"||format==="zip"){
  const data=await patientFileExportData(user,patientId,requestContext(request));const base=`${data.patient.mrn}-patient-file`;
  if(format==="pdf"){const pdf=await patientFilePdf(data,user.name);return new Response(new Uint8Array(pdf),{headers:secureHeaders("application/pdf",`${base}.pdf`)});}
  if(data.documents.length>100||data.documents.reduce((sum,item)=>sum+item.content.length,0)>100*1024*1024)throw new ApiError(413,"archiveTooLarge");
  const manifest=Buffer.from(JSON.stringify({patient:{id:data.patient.id,mrn:data.patient.mrn,name:data.patient.name},generatedAt:new Date().toISOString(),generatedBy:user.name,documents:data.documents.map(({content,...item})=>item)},null,2));
  const archive=createZip([{name:"manifest.json",content:manifest},...data.documents.map((item,index)=>({name:`${String(index+1).padStart(3,"0")}-${item.filename}`,content:item.content}))]);return new Response(new Uint8Array(archive),{headers:secureHeaders("application/zip",`${base}-originals.zip`)});
 }
 return json(await patientDocumentList(user,patientId,requestContext(request)));
}catch(error){return errorResponse(error);}}

export async function POST(request:Request){try{
 checkOrigin(request);const {user}=await requestSession(request,"document:upload");await consumeLimit(`patient-documents:${user.tenantId}:${user.id}`,30,60);
 const reader=request.body?.getReader();if(!reader)throw new ApiError(400,"invalidRequest");const chunks:Uint8Array[]=[];let length=0;
 for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>6*1024*1024){await reader.cancel();throw new ApiError(413,"fileTooLarge");}chunks.push(value);}
 const form=await new Request(request.url,{method:"POST",headers:request.headers,body:Buffer.concat(chunks)}).formData();const file=form.get("file");if(!(file instanceof File)||file.size<1||file.size>5*1024*1024)throw new ApiError(400,"invalidFile");const content=Buffer.from(await file.arrayBuffer()),mime=detect(content);if(!mime)throw new ApiError(400,"invalidFile");
 const result=await uploadPatientDocument(user,{patientId:form.get("patientId"),encounterId:form.get("encounterId"),category:form.get("category"),title:form.get("title"),remarks:form.get("remarks")??"",capturedAt:form.get("capturedAt")},{content,mime,filename:file.name.replace(/[^a-zA-Z0-9._ -]/g,"_").slice(0,160)||"clinical-document"},requestContext(request));return json(result,201);
}catch(error){return errorResponse(error);}}
