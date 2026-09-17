import { requestSession, consumeLimit } from "@/server/auth";
import { requestContext } from "@/server/audit";
import { checkOrigin, errorResponse, json, readJson } from "@/server/http";
import { parsePatientInput, reviewPatient } from "@/server/patient-service";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { user } = await requestSession(request, "patient:create");
    await consumeLimit(`patient-create:${user.tenantId}:${user.id}`, 30, 60);
    return json(await reviewPatient(user, parsePatientInput(await readJson(request)), requestContext(request)));
  } catch (error) { return errorResponse(error); }
}
