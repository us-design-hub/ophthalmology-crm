import "server-only";
import { Pool, escapeLiteral, types, type PoolClient, type QueryResult } from "pg";
import { requiredEnv } from "./config";

types.setTypeParser(1082, value => value);
const globalDb = globalThis as unknown as { openeyesPool?: Pool; roleCheck?: Promise<void> };
export function pool(): Pool {
  if (!globalDb.openeyesPool) {
    const ca = process.env.DATABASE_SSL_CA_BASE64;
    globalDb.openeyesPool = new Pool({ connectionString: requiredEnv("DATABASE_URL"), ...(ca ? { ssl: { ca: Buffer.from(ca, "base64").toString("utf8"), rejectUnauthorized: true } } : {}), max: 8, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30_000, application_name: "openeyes-web" });
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
const BEGIN = "BEGIN; SET LOCAL statement_timeout = '8s'";
export async function transaction<T>(work: (db: PoolClient) => Promise<T>, preamble?: string): Promise<T> {
  await verifyAppRole();
  const db = await pool().connect();
  try {
    // These statements use the simple protocol, saving network round trips
    // for every transaction without changing its timeout or isolation.
    await db.query(preamble ? `${BEGIN}; ${preamble}` : BEGIN);
    const result = await work(db);
    await db.query("COMMIT");
    return result;
  } catch (error) { await db.query("ROLLBACK"); throw error; }
  finally { db.release(); }
}
// Runs a complete transaction in one network round trip. The simple protocol
// accepts no parameters, so every value must already be embedded with
// escapeLiteral. Returns the results of the caller's statements only.
export async function singleTripTransaction(sql: string): Promise<QueryResult[]> {
  await verifyAppRole();
  const db = await pool().connect();
  try {
    const results = await db.query(`${BEGIN}; ${sql}; COMMIT`) as unknown as QueryResult[];
    return results.slice(2, -1);
  } catch (error) { await db.query("ROLLBACK"); throw error; }
  finally { db.release(); }
}


export type ReadQuery = { text: string; values?: readonly unknown[] };
export async function readBatch(db: PoolClient, queries: readonly ReadQuery[]): Promise<Record<string, unknown>[][]> {
  if (!queries.length) return [];
  const values: unknown[] = [];
  const columns = queries.map((query, index) => {
    if (!/^\s*(SELECT|WITH)\b/i.test(query.text) || query.text.includes(";")) throw new Error("readBatch only accepts one read query");
    const offset = values.length;
    const sql = query.text.replace(/\$(\d+)\b/g, (_match, number: string) => `$${Number(number) + offset}`);
    values.push(...(query.values ?? []));
    return `(SELECT coalesce(jsonb_agg(to_jsonb(batch_row)), '[]'::jsonb) FROM (${sql}) AS batch_row) AS "q${index}"`;
  });
  const row = (await db.query(`SELECT ${columns.join(",")}`, values)).rows[0] as Record<string, Record<string, unknown>[]>;
  return queries.map((_query, index) => row[`q${index}`] ?? []);
}

// Tenant context travels with BEGIN, so it costs no extra round trip.
export function tenantContextSql(tenantId: string, actorId?: string) {
  return `SELECT set_config('app.tenant_id',${escapeLiteral(tenantId)},true), set_config('app.actor_id',${escapeLiteral(actorId ?? "")},true)`;
}
export async function withTenant<T>(tenantId: string, actorId: string | undefined, work: (db: PoolClient) => Promise<T>): Promise<T> {
  return transaction(work, tenantContextSql(tenantId, actorId));
}
