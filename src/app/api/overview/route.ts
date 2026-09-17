import { requestSession, consumeLimit } from "@/server/auth";
import { errorResponse, json } from "@/server/http";
import { overviewData } from "@/server/overview-service";

export async function GET(request: Request) {
  try {
    // Every authenticated role gets an overview; the service decides which
    // slices they may see. Polling must not keep an idle session alive.
    const { user } = await requestSession(request, undefined, false);
    await consumeLimit(`overview:${user.tenantId}:${user.id}`, 120, 60);
    return json(await overviewData(user));
  } catch (error) { return errorResponse(error); }
}
