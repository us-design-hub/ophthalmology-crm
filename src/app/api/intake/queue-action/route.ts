import { requestSession } from '@/server/auth';
import { requestContext } from '@/server/audit';
import { checkOrigin, readJson, json, errorResponse } from '@/server/http';
import { manageQueue } from '@/server/intake-service';
export async function POST(request:Request){try{checkOrigin(request);const {user}=await requestSession(request,'queue:manage');return json(await manageQueue(user,await readJson(request),requestContext(request)));}catch(error){return errorResponse(error);}}
