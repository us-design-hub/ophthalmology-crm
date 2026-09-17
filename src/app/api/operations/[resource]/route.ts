import {requestSession} from '@/server/auth';
import {requestContext} from '@/server/audit';
import {operationsData,inventoryAction,dispensingAction,billingAction,surgeryAction} from '@/server/live-operations-service';
import {ApiError,checkOrigin,readJson,json,errorResponse} from '@/server/http';
type Context={params:Promise<{resource:string}>};
export async function GET(request:Request,{params}:Context){try{const {user}=await requestSession(request);return json(await operationsData(user,(await params).resource,requestContext(request)));}catch(e){return errorResponse(e);}}
export async function POST(request:Request,{params}:Context){try{checkOrigin(request);const {user}=await requestSession(request);const functions={inventory:inventoryAction,dispensing:dispensingAction,billing:billingAction,surgery:surgeryAction};const resource=(await params).resource;if(!(resource in functions))throw new ApiError(404,'notFound');return json(await functions[resource as keyof typeof functions](user,await readJson(request),requestContext(request)));}catch(e){return errorResponse(e);}}
