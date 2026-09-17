import { requestSession, consumeLimit } from "@/server/auth";
import { withTenant } from "@/server/db";
import { audit, requestContext } from "@/server/audit";
import { ApiError, errorResponse, json } from "@/server/http";
export async function GET(request: Request) {
  try {
    const { user } = await requestSession(request, "audit:read");
    await consumeLimit(`audit:${user.tenantId}:${user.id}`, 60, 60);
    const page = Number(new URL(request.url).searchParams.get("page") ?? 1);
    const group = new URL(request.url).searchParams.get("group") ?? 'all';
    const predicates: Record<string, string> = { all: 'true', clinical: "a.action IN ('clinical.signed','prescription.signed','clinical.addendum')", previews: "a.action LIKE 'preview.%'", examples: "a.action='security.break_glass_example' AND a.metadata->>'synthetic'='true'" };
    if (!Object.hasOwn(predicates, group)) throw new ApiError(400, 'invalidRequest');
    if (!Number.isInteger(page) || page < 1 || page > 10000) throw new ApiError(400, "invalidRequest");
    const data = await withTenant(user.tenantId, user.id, async db => {
      await audit(db, { tenantId: user.tenantId, actorId: user.id, action: "audit.read", entityType: "audit_log", context: requestContext(request) });
      const events = await db.query(`SELECT a.id,a.action,a.entity_type AS "entityType",a.entity_id AS "entityId",a.at,a.metadata,u.full_name AS actor FROM app.audit_log a LEFT JOIN app.user_account u ON u.id=a.actor_id AND u.tenant_id=a.tenant_id WHERE ${predicates[group]} ORDER BY a.at DESC,a.id LIMIT 25 OFFSET $1`, [(page - 1) * 25]);
      const count = await db.query(`SELECT count(*)::int AS total FROM app.audit_log a WHERE ${predicates[group]}`);
      return { events: events.rows, total: count.rows[0].total, page, pageSize: 25 };
    });
    return json(data);
  } catch (error) { return errorResponse(error); }
}
