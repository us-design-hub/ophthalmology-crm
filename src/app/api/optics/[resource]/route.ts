import { requestSession, consumeLimit } from "@/server/auth";
import { requestContext } from "@/server/audit";
import { ApiError, checkOrigin, errorResponse, json, readJson } from "@/server/http";
import * as optics from "@/server/optics-service";

type Context = { params: Promise<{ resource: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const { resource } = await context.params;
    if (!["worklist", "encounter"].includes(resource)) throw new ApiError(404, "invalidRequest");
    const { user } = await requestSession(request, resource === "worklist" ? "optics:read" : "patient:read", false);
    await consumeLimit(`optics-read:${user.tenantId}:${user.id}`, 120, 60);
    if (resource === "worklist") return json(await optics.worklist(user, requestContext(request)));
    return json(await optics.encounterReferrals(user, new URL(request.url).searchParams.get("encounterId"), requestContext(request)));
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const { resource } = await context.params;
    if (resource !== "required") throw new ApiError(404, "invalidRequest");
    const { user } = await requestSession(request, "optics:order");
    await consumeLimit(`optics-write:${user.tenantId}:${user.id}`, 60, 60);
    return json(await optics.markRequired(user, await readJson(request, 16_384), requestContext(request)));
  } catch (error) { return errorResponse(error); }
}
