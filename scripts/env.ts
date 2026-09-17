import { existsSync } from "node:fs";
for (const file of [".env.local", ".env.db.local"]) if (existsSync(file)) process.loadEnvFile(file);

export function assertDemoDatabase() {
  if (process.env.APP_MODE !== "demo") throw new Error("Demo tools require APP_MODE=demo");
  const url = new URL(process.env.DATABASE_ADMIN_URL ?? "");
  if (!/^openeyes_demo(?:_test)?$/.test(url.pathname.slice(1))) throw new Error("Demo tools require a database named openeyes_demo or openeyes_demo_test");
  return url;
}
