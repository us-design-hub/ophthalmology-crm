import { requestSession } from "@/server/auth";
import { errorResponse, json } from "@/server/http";
export async function GET(request: Request) {
  try { return json({ user: (await requestSession(request, undefined, false, true)).user }); }
  catch (error) { return errorResponse(error); }
}
