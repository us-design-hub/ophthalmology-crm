import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import pg from "pg";

for (const file of [".env.production.local", ".env.db.local"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function key(name: string): Buffer {
  const value = Buffer.from(required(name), "base64");
  if (value.length !== 32) throw new Error(`${name} must be a base64-encoded 32-byte value`);
  return value;
}

async function main() {
  if (required("APP_MODE") !== "production") throw new Error("APP_MODE must be production");
  const origin = new URL(required("APP_ORIGIN"));
  if (origin.protocol !== "https:") throw new Error("APP_ORIGIN must use HTTPS");
  const hospitalCode = required("HOSPITAL_CODE");
  if (hospitalCode.toUpperCase() === "DEMO") throw new Error("HOSPITAL_CODE must identify the production hospital");
  if (process.env.SHOW_DEMO_CREDENTIALS === "true") throw new Error("SHOW_DEMO_CREDENTIALS must not be enabled");
  if (!/^(true|false)$/.test(required("TRUST_PROXY"))) throw new Error("TRUST_PROXY must be true or false");

  const runtimeUrl = new URL(required("DATABASE_URL"));
  const runtimeUsername = decodeURIComponent(runtimeUrl.username);
  if (runtimeUsername !== "openeyes_app" && !/^openeyes_app.[a-z0-9]+$/i.test(runtimeUsername)) throw new Error("DATABASE_URL must use the restricted openeyes_app role");
  const adminUrl = new URL(required("DATABASE_ADMIN_URL"));
  const keys = [key("IDENTIFIER_ENCRYPTION_KEY"), key("IDENTIFIER_INDEX_KEY"), key("SESSION_PEPPER")];
  if (new Set(keys.map(value => value.toString("hex"))).size !== keys.length) throw new Error("Encryption, index, and session keys must be independent values");

  const ca = process.env.DATABASE_SSL_CA_BASE64;
  const runtimeDb = new pg.Client({
    connectionString: runtimeUrl.toString(),
    ...(ca ? { ssl: { ca: Buffer.from(ca, "base64").toString("utf8"), rejectUnauthorized: true } } : {}),
    application_name: "openeyes-production-preflight",
  });
  await runtimeDb.connect();
  try {
    const role = (await runtimeDb.query(`SELECT r.rolname,r.rolsuper,r.rolbypassrls,
      EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relowner=r.oid) AS owns_tables
      FROM pg_roles r WHERE r.rolname=current_user`)).rows[0];
    if (role?.rolname !== "openeyes_app" || role.rolsuper || role.rolbypassrls || role.owns_tables) {
      throw new Error("DATABASE_URL does not use a safe restricted runtime role");
    }
  } finally {
    await runtimeDb.end();
  }

  const db = new pg.Client({ connectionString: adminUrl.toString() });
  await db.connect();
  try {
    const applied = await db.query<{ name: string; checksum: string }>("SELECT name,checksum FROM public.openeyes_migrations");
    const appliedByName = new Map(applied.rows.map(row => [row.name, row.checksum]));
    for (const name of readdirSync("db/migrations").filter(name => name.endsWith(".sql")).sort()) {
      const checksum = createHash("sha256").update(readFileSync(`db/migrations/${name}`, "utf8")).digest("hex");
      if (!appliedByName.has(name)) throw new Error(`Migration is not applied: ${name}`);
      if (appliedByName.get(name) !== checksum) throw new Error(`Applied migration checksum differs: ${name}`);
    }

    const tenant = (await db.query<{ id: string; is_demo: boolean }>("SELECT id,is_demo FROM app.tenant WHERE code=$1", [hospitalCode])).rows[0];
    if (!tenant) throw new Error(`No tenant exists for HOSPITAL_CODE=${hospitalCode}`);
    if (tenant.is_demo) throw new Error("The production hospital must not be marked as a demo tenant");

    const roleCounts = await db.query<{ code: string; count: string }>(`
      SELECT r.code,count(DISTINCT u.id)::text AS count
      FROM app.role r
      LEFT JOIN app.user_role ur ON ur.role_code=r.code AND ur.tenant_id=r.tenant_id
      LEFT JOIN app.user_account u ON u.id=ur.user_id AND u.status='active'
      WHERE r.tenant_id=$1 AND r.code=ANY($2::text[])
      GROUP BY r.code`, [tenant.id, ["hospital_admin", "security_admin"]]);
    const counts = new Map(roleCounts.rows.map(row => [row.code, Number(row.count)]));
    for (const role of ["hospital_admin", "security_admin"]) {
      if (!counts.get(role)) throw new Error(`At least one active ${role} account is required`);
    }

    const retired = await db.query<{ count: string }>(`
      SELECT count(DISTINCT u.id)::text AS count
      FROM app.user_account u
      JOIN app.user_role ur ON ur.tenant_id=u.tenant_id AND ur.user_id=u.id
      JOIN app.role r ON r.tenant_id=ur.tenant_id AND r.code=ur.role_code
      WHERE u.tenant_id=$1 AND u.status='active' AND r.code=ANY($2::text[])`, [tenant.id, ["cashier", "inventory_officer"]]);
    if (Number(retired.rows[0]?.count ?? 0) > 0) throw new Error("Active accounts still have retired cashier or inventory roles");
  } finally {
    await db.end();
  }

  console.log("Production preflight passed: configuration, migrations, tenant, administrators, and native patient registration are ready.");
}

main().catch(error => {
  console.error(`Production preflight failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
