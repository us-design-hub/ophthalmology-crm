import { requestSession, consumeLimit } from "@/server/auth";
import { requestContext } from "@/server/audit";
import { checkOrigin, readJson, errorResponse, json } from "@/server/http";
import { getPatient, editPatient } from "@/server/patient-service";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requestSession(request, "patient:read");
    await consumeLimit(`patient-read:${user.tenantId}:${user.id}`, 120, 60);
    return json({ patient: await getPatient(user, (await params).id, requestContext(request)) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{checkOrigin(request);const {user}=await requestSession(request,'patient:edit');return json(await editPatient(user,(await params).id,await readJson(request),requestContext(request)));}catch(error){return errorResponse(error);}}
