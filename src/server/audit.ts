import "server-only";
import type { PoolClient } from "pg";
import { isIP } from "node:net";

export type AuditContext = { ip?: string | null; userAgent?: string | null };
export function requestContext(request: Request): AuditContext {
  const forwarded = process.env.TRUST_PROXY === "true" ? request.headers.get("x-forwarded-for")?.split(",")[0].trim() : null;
  return { ip: forwarded && isIP(forwarded) ? forwarded : null, userAgent: request.headers.get("user-agent")?.slice(0, 200) ?? null };
}
export async function audit(db: PoolClient, entry: {
  tenantId: string; actorId?: string; action: string; entityType: string; entityId?: string;
  metadata?: Record<string, unknown>; context?: AuditContext;
}) {
  // Explicit metadata only. Never serialize request bodies, search terms, or patient snapshots.
  await db.query("INSERT INTO app.audit_log(tenant_id,actor_id,action,entity_type,entity_id,ip,user_agent,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [entry.tenantId, entry.actorId ?? null, entry.action, entry.entityType, entry.entityId ?? null, entry.context?.ip ?? null, entry.context?.userAgent ?? null, JSON.stringify(entry.metadata ?? {})]);
}
