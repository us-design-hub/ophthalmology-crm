import { requestSession, consumeLimit } from "@/server/auth";
import { requestContext } from "@/server/audit";
import { checkOrigin, errorResponse, json, readJson } from "@/server/http";
import { listPatients } from "@/server/patient-service";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { user } = await requestSession(request, "patient:read");
    await consumeLimit(`patient-read:${user.tenantId}:${user.id}`, 120, 60);
    return json(await listPatients(user, await readJson(request), requestContext(request)));
  } catch (error) { return errorResponse(error); }
}
