import { requestSession, consumeLimit } from "@/server/auth";
import { requestContext } from "@/server/audit";
import { checkOrigin, errorResponse, json, readJson } from "@/server/http";
import { createPatient, listPatients, parsePatientInput } from "@/server/patient-service";
export async function GET(request: Request) {
  try {
    const { user } = await requestSession(request, "patient:read");
    await consumeLimit(`patient-read:${user.tenantId}:${user.id}`, 120, 60);
    return json(await listPatients(user, { page: Number(new URL(request.url).searchParams.get("page") ?? 1) }, requestContext(request)));
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { user } = await requestSession(request, "patient:create");
    await consumeLimit(`patient-create:${user.tenantId}:${user.id}`, 30, 60);
    const patient = await createPatient(user, parsePatientInput(await readJson(request)), requestContext(request));
    return json({ patient }, 201);
  } catch (error) { return errorResponse(error); }
}
