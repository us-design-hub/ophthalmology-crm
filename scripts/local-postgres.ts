import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { assertDemoDatabase } from "./env";

async function main() {
  const command = process.argv[2];
  if (command === "init") {
    if (existsSync(".env.local") || existsSync(".env.db.local")) throw new Error("Local configuration already exists; refusing to replace configuration or keys");
    const admin = randomBytes(24).toString("hex");
    const app = randomBytes(24).toString("hex");
    const secret = () => randomBytes(32).toString("base64");
    const password = `Demo-${randomBytes(12).toString("base64url")}!`;
    writeFileSync(".env.local", [
      "APP_MODE=demo", "APP_ORIGIN=http://127.0.0.1:3000", "HOSPITAL_CODE=DEMO",
      `DATABASE_URL=postgresql://openeyes_app:${app}@127.0.0.1:55432/openeyes_demo`,
      `IDENTIFIER_ENCRYPTION_KEY=${secret()}`, `IDENTIFIER_INDEX_KEY=${secret()}`, `SESSION_PEPPER=${secret()}`,
      "SHOW_DEMO_CREDENTIALS=true", `DEMO_ACCOUNT_PASSWORD=${password}`, "TRUST_PROXY=false", "",
    ].join("\n"), { mode: 0o600, flag: "wx" });
    writeFileSync(".env.db.local", `DATABASE_ADMIN_URL=postgresql://openeyes_owner:${admin}@127.0.0.1:55432/openeyes_demo\n`, { mode: 0o600, flag: "wx" });
    console.log("Created ignored application and database-admin configuration with unique local secrets. Next run npm run db:local:start.");
    return;
  }
  if (command !== "start") throw new Error("Use init or start");
  const adminUrl = assertDemoDatabase();
  if (adminUrl.hostname !== "127.0.0.1" || adminUrl.port !== "55432" || adminUrl.username !== "openeyes_owner") throw new Error("Local runtime requires the generated loopback configuration");
  const appUrl = new URL(process.env.DATABASE_URL!);
  if (appUrl.username !== "openeyes_app" || appUrl.hostname !== adminUrl.hostname || appUrl.port !== adminUrl.port || appUrl.pathname !== adminUrl.pathname) throw new Error("Application and admin connections must address the same local demo database");
  mkdirSync(resolve(".data"), { recursive: true });
  const cluster = new EmbeddedPostgres({
    databaseDir: resolve(".data/postgres"), user: adminUrl.username, password: decodeURIComponent(adminUrl.password),
    port: 55432, persistent: true, authMethod: "scram-sha-256", initdbFlags: ["--encoding=UTF8", "--locale=C"],
    postgresFlags: ["-h", "127.0.0.1", "-c", "log_min_error_statement=panic", "-c", "log_parameter_max_length_on_error=0"],
    onLog: message => { if (message.includes("ready to accept connections")) console.log("Local PostgreSQL is ready on 127.0.0.1:55432."); },
    onError: () => console.error("PostgreSQL runtime error. Check the local runtime configuration."),
  });
  if (!existsSync(resolve(".data/postgres/PG_VERSION"))) await cluster.initialise();
  await cluster.start();
  const rootUrl = new URL(adminUrl); rootUrl.pathname = "/postgres";
  const client = new pg.Client({ connectionString: rootUrl.toString() });
  await client.connect();
  const database = adminUrl.pathname.slice(1);
  if (!(await client.query("SELECT 1 FROM pg_database WHERE datname=$1", [database])).rowCount) await client.query(`CREATE DATABASE "${database}"`);
  const passwordLiteral = decodeURIComponent(appUrl.password).replace(/'/g, "''");
  if (!(await client.query("SELECT 1 FROM pg_roles WHERE rolname='openeyes_app'")).rowCount) {
    await client.query(`CREATE ROLE openeyes_app LOGIN PASSWORD '${passwordLiteral}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
  }
  await client.query(`REVOKE ALL ON DATABASE "${database}" FROM PUBLIC`);
  await client.query(`GRANT CONNECT ON DATABASE "${database}" TO openeyes_app`);
  await client.end();
  console.log("Database files persist in .data/postgres. Leave this process running. Use Ctrl+C to stop.");
  // The runtime's exit hook stops only this persistent cluster; no system service is created.
  setInterval(() => {}, 60_000);
}
main().catch(error => { console.error(error instanceof Error && !('query' in error) ? error.message : "Local database setup failed"); process.exitCode = 1; });
