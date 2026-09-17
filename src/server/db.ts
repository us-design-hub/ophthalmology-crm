import "server-only";
import { Pool, types, type PoolClient } from "pg";
import { requiredEnv } from "./config";

types.setTypeParser(1082, value => value);
const globalDb = globalThis as unknown as { openeyesPool?: Pool; roleCheck?: Promise<void> };
export function pool(): Pool {
  if (!globalDb.openeyesPool) {
    globalDb.openeyesPool = new Pool({ connectionString: requiredEnv("DATABASE_URL"), max: 8, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30_000, application_name: "openeyes-web" });
    globalDb.openeyesPool.on("error", () => console.error("Database connection error"));
  }
  return globalDb.openeyesPool;
}
async function verifyAppRole() {
  globalDb.roleCheck ??= (async () => {
    const result = await pool().query("SELECT r.rolname,r.rolsuper,r.rolbypassrls, EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relowner=r.oid) AS owns_tables FROM pg_roles r WHERE r.rolname=current_user");
    const role = result.rows[0];
    if (role.rolname !== "openeyes_app" || role.rolsuper || role.rolbypassrls || role.owns_tables) throw new Error("Unsafe runtime database role");
  })();
  return globalDb.roleCheck;
}
export async function transaction<T>(work: (db: PoolClient) => Promise<T>): Promise<T> {
  await verifyAppRole();
  const db = await pool().connect();
  try {
    await db.query("BEGIN");
    await db.query("SET LOCAL statement_timeout = '8s'");
    const result = await work(db);
    await db.query("COMMIT");
    return result;
  } catch (error) { await db.query("ROLLBACK"); throw error; }
  finally { db.release(); }
}
export async function setTenant(db: PoolClient, tenantId: string, actorId?: string) {
  await db.query("SELECT set_config('app.tenant_id',$1,true), set_config('app.actor_id',$2,true)", [tenantId, actorId ?? ""]);
}
export async function withTenant<T>(tenantId: string, actorId: string | undefined, work: (db: PoolClient) => Promise<T>): Promise<T> {
  return transaction(async db => { await setTenant(db, tenantId, actorId); return work(db); });
}
