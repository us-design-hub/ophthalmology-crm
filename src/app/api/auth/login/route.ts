import { z } from "zod";
import { login, SESSION_COOKIE, cookieOptions } from "@/server/auth";
import { requestContext } from "@/server/audit";
import { ApiError, checkOrigin, errorResponse, json, readJson } from "@/server/http";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const input = z.object({ email: z.email().max(160), password: z.string().min(1).max(256) }).strict().safeParse(await readJson(request));
    if (!input.success) throw new ApiError(400, "invalidCredentials");
    const { user, token } = await login(input.data.email, input.data.password, requestContext(request));
    const response = json({ user });
    response.cookies.set(SESSION_COOKIE, token, cookieOptions());
    return response;
  } catch (error) { return errorResponse(error); }
}
