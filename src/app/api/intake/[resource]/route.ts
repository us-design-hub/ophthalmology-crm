import { requestSession, consumeLimit } from "@/server/auth";
import { requestContext } from "@/server/audit";
import { ApiError, checkOrigin, errorResponse, json, readJson } from "@/server/http";
import * as intake from "@/server/intake-service";
type Context = { params: Promise<{ resource: string }> };
export async function GET(request: Request, context: Context) {
 try {
  const { resource } = await context.params;
  if (!["clinics", "slots", "appointments", "queue", "workup", "overview"].includes(resource)) throw new ApiError(404, "invalidRequest");
  // Polling does not keep an unattended clinical session alive.
  const { user } = await requestSession(request, resource === "workup" ? "workup:read" : "intake:read", false);
  await consumeLimit(`intake-read:${user.tenantId}:${user.id}`, 180, 60);
  const query = new URL(request.url).searchParams; const audit = requestContext(request);
  if (resource === "clinics") return json(await intake.clinics(user));
  if (resource === "slots") return json(await intake.availableSlots(user, { date: query.get("date"), facilityId: query.get("facilityId"), doctorId: query.get("doctorId") }));
  if (resource === "appointments") return json(await intake.appointments(user, intake.intakeDate(query.get("date")), audit));
  if (resource === "queue") return json(await intake.queue(user, audit));
  if (resource === "workup") return json(await intake.workupDetail(user, query.get("encounterId"), audit));
  return json(await intake.overview(user));
 } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request, context: Context) {
 try {
  checkOrigin(request); const { resource } = await context.params;
  const permissions = { appointments: "appointment:create", checkin: "appointment:checkin", transition: "intake:read", workup: "workup:write" } as const;
  if (!Object.hasOwn(permissions, resource)) throw new ApiError(404, "invalidRequest");
  const { user } = await requestSession(request, permissions[resource as keyof typeof permissions]);
  await consumeLimit(`intake-write:${user.tenantId}:${user.id}`, 60, 60);
  const body = await readJson(request), audit = requestContext(request);
  if (resource === "appointments") return json(await intake.book(user, body, audit), 201);
  if (resource === "checkin") return json(await intake.checkIn(user, body, audit), 201);
  if (resource === "transition") return json(await intake.transition(user, body, audit));
  return json(await intake.saveWorkup(user, body, audit), 201);
 } catch (error) { return errorResponse(error); }
}
