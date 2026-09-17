import {requestSession} from '@/server/auth';
import {requestContext} from '@/server/audit';
import {patientHistory,updateHistory} from '@/server/patient-history-service';
import {checkOrigin,readJson,json,errorResponse} from '@/server/http';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Context){try{const {user}=await requestSession(request,'clinical:read');return json(await patientHistory(user,(await params).id,requestContext(request)));}catch(e){return errorResponse(e);}}
export async function POST(request:Request,{params}:Context){try{checkOrigin(request);const {user}=await requestSession(request,'history:write');return json(await updateHistory(user,(await params).id,await readJson(request),requestContext(request)));}catch(e){return errorResponse(e);}}
