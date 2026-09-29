import { existsSync } from "node:fs";
import pg from "pg";

for (const file of [".env.production.local", ".env.db.local"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

export function requiredProductionEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function productionAdminUrl(): URL {
  if (requiredProductionEnv("APP_MODE") !== "production") throw new Error("Production database tools require APP_MODE=production");
  if (requiredProductionEnv("HOSPITAL_CODE").toUpperCase() === "DEMO") throw new Error("Production database tools refuse HOSPITAL_CODE=DEMO");
  const url = new URL(requiredProductionEnv("DATABASE_ADMIN_URL"));
  if (/^openeyes_demo(?:_test)?$/i.test(url.pathname.slice(1))) throw new Error("Production database tools refuse a demo database");
  return url;
}

export function productionClient(applicationName: string): pg.Client {
  const ca = process.env.DATABASE_SSL_CA_BASE64;
  return new pg.Client({
    connectionString: productionAdminUrl().toString(),
    ...(ca ? { ssl: { ca: Buffer.from(ca, "base64").toString("utf8"), rejectUnauthorized: true } } : {}),
    application_name: applicationName,
  });
}
