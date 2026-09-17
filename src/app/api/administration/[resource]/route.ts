import { requestSession } from '@/server/auth';
import { requestContext } from '@/server/audit';
import { administrationData, saveStaff, changeAccess, saveHospital, saveFacility } from '@/server/administration-service';
import { ApiError, checkOrigin, errorResponse, json, readJson } from '@/server/http';
type Context = {params:Promise<{resource:string}>};
export async function GET(request:Request,{params}:Context){try{const {user}=await requestSession(request,'admin:read');if((await params).resource!=='overview')throw new ApiError(404,'notFound');return json(await administrationData(user,requestContext(request)));}catch(error){return errorResponse(error);}}
export async function POST(request:Request,{params}:Context){try{checkOrigin(request);const {user}=await requestSession(request,'admin:read');const handlers={staff:saveStaff,access:changeAccess,hospital:saveHospital,facility:saveFacility};const resource=(await params).resource;if(!(resource in handlers))throw new ApiError(404,'notFound');return json(await handlers[resource as keyof typeof handlers](user,await readJson(request),requestContext(request)));}catch(error){return errorResponse(error);}}
