import { requestSession } from "@/server/auth";
import { requestContext } from "@/server/audit";
import { operationsData, surgeryAction } from "@/server/live-operations-service";
import { ApiError, checkOrigin, readJson, json, errorResponse } from "@/server/http";
type Context = { params: Promise<{ resource: string }> };
export async function GET(request: Request, { params }: Context) {
  try { const { user } = await requestSession(request); return json(await operationsData(user, (await params).resource, requestContext(request))); }
  catch (error) { return errorResponse(error); }
}
export async function POST(request: Request, { params }: Context) {
  try {
    checkOrigin(request);
    const { user } = await requestSession(request);
    if ((await params).resource !== "surgery") throw new ApiError(404, "notFound");
    return json(await surgeryAction(user, await readJson(request), requestContext(request)));
  } catch (error) { return errorResponse(error); }
}
