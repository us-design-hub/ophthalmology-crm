import { requestSession, cookieOptions, SESSION_COOKIE } from '@/server/auth';
import { changeOwnPassword } from '@/server/administration-service';
import { requestContext } from '@/server/audit';
import { checkOrigin, errorResponse, json, readJson } from '@/server/http';
export async function POST(request:Request){try{checkOrigin(request);const session=await requestSession(request,undefined,true,true);const response=json(await changeOwnPassword(session,await readJson(request),requestContext(request)));response.cookies.set(SESSION_COOKIE,'',{...cookieOptions(),maxAge:0});return response;}catch(error){return errorResponse(error);}}
