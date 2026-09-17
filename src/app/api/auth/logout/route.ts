import { logout, requestSession, SESSION_COOKIE, cookieOptions } from "@/server/auth";
import { requestContext } from "@/server/audit";
import { ApiError, checkOrigin, errorResponse, json } from "@/server/http";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    try { await logout(await requestSession(request, undefined, true, true), requestContext(request)); }
    catch (error) { if (!(error instanceof ApiError && error.status === 401)) throw error; }
    const response = json({ ok: true });
    response.cookies.set(SESSION_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
    return response;
  } catch (error) { return errorResponse(error); }
}
