import { requestSession } from "@/server/auth";
import { checkOrigin, errorResponse, json } from "@/server/http";
import { holdMrn, releaseMrn } from "@/server/patient-service";
// POST takes or renews this receptionist's MR number; DELETE hands it back.
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { user } = await requestSession(request, "patient:create");
    return json(await holdMrn(user));
  } catch (error) { return errorResponse(error); }
}
export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const { user } = await requestSession(request, "patient:create");
    return json(await releaseMrn(user));
  } catch (error) { return errorResponse(error); }
}
