import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { hash } from "@node-rs/argon2";
import pg from "pg";
import type { Role } from "../src/lib/access";

for (const file of [".env.production.local", ".env.local", ".env.db.local"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

type DemoRoleAccount = {
  name: string;
  email: string;
  role: Role;
  designation: string;
  facilities: "clinics" | "testing" | "imaging" | "theatres";
};

const accounts: DemoRoleAccount[] = [
  { name: "Sana Qureshi", email: "sana.qureshi@demo.openeyes.local", role: "senior_technician", designation: "Senior ophthalmic technician", facilities: "clinics" },
  { name: "Hira Saleem", email: "hira.saleem@demo.openeyes.local", role: "lab_assistant", designation: "Ophthalmic laboratory assistant", facilities: "testing" },
  { name: "Imran Shah", email: "imran.shah@demo.openeyes.local", role: "machine_operator", designation: "Diagnostic machine operator", facilities: "imaging" },
  { name: "Rabia Aslam", email: "rabia.aslam@demo.openeyes.local", role: "ot_coordinator", designation: "Operating theatre coordinator", facilities: "theatres" },
  { name: "Kamran Yousaf", email: "kamran.yousaf@demo.openeyes.local", role: "pharmacist", designation: "Prescription review pharmacist", facilities: "clinics" },
];

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const password = required("DEMO_ACCOUNT_PASSWORD");
  if (password.length < 12) throw new Error("DEMO_ACCOUNT_PASSWORD must contain at least 12 characters");
  const db = new pg.Client({ connectionString: required("DATABASE_ADMIN_URL"), application_name: "openeyes-demo-role-seed" });
  await db.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(724912004)");
    const tenant = (await db.query("SELECT id FROM app.tenant WHERE code='DEMO' AND is_demo=true FOR UPDATE")).rows[0];
    if (!tenant) throw new Error("Refusing to create demo accounts because no DEMO tenant marked is_demo=true exists");
    const facilities = (await db.query("SELECT id,type,pathway_steps FROM app.facility WHERE tenant_id=$1 AND active ORDER BY name", [tenant.id])).rows as { id: string; type: string; pathway_steps: string[] | null }[];
    if (!facilities.length) throw new Error("The DEMO tenant has no active facilities");
    const created: string[] = [];
    const preserved: string[] = [];
    for (const account of accounts) {
      const existing = (await db.query("SELECT id FROM app.user_account WHERE tenant_id=$1 AND email=$2", [tenant.id, account.email])).rows[0];
      const userId = existing?.id ?? randomUUID();
      if (!existing) {
        const passwordHash = await hash(password, { algorithm: 2, memoryCost: 65536, timeCost: 3, parallelism: 1 });
        await db.query("INSERT INTO app.user_account(id,tenant_id,email,full_name,designation,password_hash) VALUES($1,$2,$3,$4,$5,$6)", [userId, tenant.id, account.email, account.name, account.designation, passwordHash]);
        created.push(account.role);
      } else {
        preserved.push(account.role);
      }
      if (!(await db.query("SELECT 1 FROM app.role WHERE tenant_id=$1 AND code=$2", [tenant.id, account.role])).rowCount) throw new Error(`Role ${account.role} has not been migrated`);
      await db.query("INSERT INTO app.user_role(tenant_id,user_id,role_code) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [tenant.id, userId, account.role]);
      const assigned = facilities.filter(facility => account.facilities === "clinics" ? facility.type === "clinic" : account.facilities === "theatres" ? facility.type === "theatre" : facility.type === "clinic" && (facility.pathway_steps ?? []).includes(account.facilities === "testing" ? "testing" : "imaging"));
      if (!assigned.length) throw new Error(`No ${account.facilities} facility is configured for ${account.role}`);
      for (const facility of assigned) await db.query("INSERT INTO app.user_facility(tenant_id,user_id,facility_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [tenant.id, userId, facility.id]);
    }
    await db.query("COMMIT");
    console.log(`Demo role accounts ready. Created: ${created.join(", ") || "none"}. Preserved: ${preserved.join(", ") || "none"}.`);
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    await db.end();
  }
}

main().catch(error => {
  console.error(`Demo role account seed failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
