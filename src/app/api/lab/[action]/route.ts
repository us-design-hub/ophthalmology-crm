import { requestSession } from "@/server/auth";
import { requestContext } from "@/server/audit";
import { ApiError, checkOrigin, errorResponse, json, readJson } from "@/server/http";
import { labWorklist, markLabNotDone, orderLab, recordLabResult } from "@/server/lab-service";

// GET worklist (lab assistant); POST result, not-done (lab assistant) or order (clinical staff).
export async function GET(request: Request, context: { params: Promise<{ action: string }> }) {
  try {
    if ((await context.params).action !== "worklist") throw new ApiError(404, "invalidRequest");
    // Polling does not keep an unattended session alive.
    const { user } = await requestSession(request, "lab:write", false);
    return json(await labWorklist(user, requestContext(request)));
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  try {
    checkOrigin(request);
    const action = (await context.params).action;
    const { user } = await requestSession(request, "intake:read");
    const input = await readJson(request), audit = requestContext(request);
    if (action === "result") return json(await recordLabResult(user, input, audit));
    if (action === "not-done") return json(await markLabNotDone(user, input, audit));
    if (action === "order") return json(await orderLab(user, input, audit), 201);
    throw new ApiError(404, "invalidRequest");
  } catch (error) { return errorResponse(error); }
}
