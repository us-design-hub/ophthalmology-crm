import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import pg from "pg";
import { assertDemoDatabase } from "./env";

async function main() {
  const url = assertDemoDatabase();
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  try {
    await db.query("SELECT pg_advisory_lock(724912001)");
    await db.query("CREATE TABLE IF NOT EXISTS public.openeyes_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
    for (const name of readdirSync("db/migrations").filter(name => name.endsWith(".sql")).sort()) {
      const sql = readFileSync(`db/migrations/${name}`, "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const existing = await db.query("SELECT checksum FROM public.openeyes_migrations WHERE name=$1", [name]);
      if (existing.rowCount) {
        if (existing.rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${name}`);
        console.log(`Already applied: ${name}`); continue;
      }
      await db.query("BEGIN");
      try {
        await db.query(sql);
        await db.query("INSERT INTO public.openeyes_migrations(name,checksum) VALUES($1,$2)", [name, checksum]);
        await db.query("COMMIT");
        console.log(`Applied: ${name}`);
      } catch (error) { await db.query("ROLLBACK"); throw error; }
    }
  } finally { await db.end(); }
}
main().catch(error => { console.error("Migration failed:", error.code ?? error.message); process.exitCode = 1; });
