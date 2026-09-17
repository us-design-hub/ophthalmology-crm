import "./env";
import { assertDemoDatabase } from "./env";
assertDemoDatabase();
for (const key of ["DATABASE_URL", "DATABASE_ADMIN_URL"]) {
  const url = new URL(process.env[key]!);
  url.pathname = "/openeyes_demo_test";
  process.env[key] = url.toString();
}
process.env.APP_ORIGIN = "http://127.0.0.1:3100";

