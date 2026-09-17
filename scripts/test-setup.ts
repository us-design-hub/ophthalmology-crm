import "./test-env";
import pg from "pg";
import { spawnSync } from "node:child_process";
import { assertDemoDatabase } from "./env";

async function main() {
  const url = assertDemoDatabase();
  if (url.pathname !== "/openeyes_demo_test") throw new Error("Test setup requires the dedicated test database");
  url.pathname = "/postgres";
  const db = new pg.Client({ connectionString: url.toString() }); await db.connect();
  try {
    if (!(await db.query("SELECT 1 FROM pg_database WHERE datname='openeyes_demo_test'")).rowCount) await db.query("CREATE DATABASE openeyes_demo_test");
    await db.query("REVOKE ALL ON DATABASE openeyes_demo_test FROM PUBLIC");
    await db.query("GRANT CONNECT ON DATABASE openeyes_demo_test TO openeyes_app");
  } finally { await db.end(); }
  if (process.argv.includes('--fresh')) {
    // This branch is deliberately unavailable to the presentation database.
    const testUrl = assertDemoDatabase();
    if (testUrl.pathname !== '/openeyes_demo_test') throw new Error('Fresh setup requires openeyes_demo_test');
    const fixtures = new pg.Client({ connectionString: testUrl.toString() }); await fixtures.connect();
    try {
      if ((await fixtures.query('SELECT current_database() AS name')).rows[0].name !== 'openeyes_demo_test') throw new Error('Unexpected database; refusing fresh setup');
      const connections = await fixtures.query('SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()');
      if (connections.rowCount) throw new Error('Stop all test-database clients before fresh setup');
      await fixtures.query('BEGIN');
      await fixtures.query('DROP SCHEMA IF EXISTS app CASCADE');
      await fixtures.query('DROP TABLE IF EXISTS public.openeyes_migrations');
      await fixtures.query('COMMIT');
      console.log('Cleared only the dedicated test schema for a fresh fixture run.');
    } catch (error) { await fixtures.query('ROLLBACK'); throw error; } finally { await fixtures.end(); }
  }
  for (const script of ["scripts/migrate.ts", "scripts/seed.ts", "scripts/seed-intake.ts", "scripts/seed-clinical.ts", "scripts/seed-operations.ts", "scripts/seed-live-operations.ts"]) {
    const result = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", script], { stdio: "inherit", env: process.env, windowsHide: true });
    if (result.status !== 0) throw new Error(`Test preparation failed: ${script}`);
  }
  console.log("Dedicated test database ready. Browser and database tests do not modify the preview registry.");
}
main().catch(error => { console.error("Test setup failed:", error.code ?? error.message); process.exitCode = 1; });
