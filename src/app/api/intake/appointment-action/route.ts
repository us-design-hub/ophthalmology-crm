import { requestSession } from '@/server/auth';
import { requestContext } from '@/server/audit';
import { checkOrigin, readJson, json, errorResponse } from '@/server/http';
import { manageAppointment } from '@/server/intake-service';
export async function POST(request:Request){try{checkOrigin(request);const {user}=await requestSession(request,'appointment:manage');return json(await manageAppointment(user,await readJson(request),requestContext(request)));}catch(error){return errorResponse(error);}}
