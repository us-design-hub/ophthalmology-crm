import { randomBytes, randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { ASSIGNABLE_ROLES, PERMISSIONS, ROLE_PERMISSIONS } from "../src/lib/access";
import { productionClient, requiredProductionEnv } from "./production-env";

type InitialAccount = { email: string; name: string; designation: string; password: string; role: "hospital_admin" | "security_admin" };

function account(prefix: "HOSPITAL_ADMIN" | "SECURITY_ADMIN", role: InitialAccount["role"]): InitialAccount {
  const password = requiredProductionEnv(`INITIAL_${prefix}_PASSWORD`);
  if (password.length < 16) throw new Error(`INITIAL_${prefix}_PASSWORD must contain at least 16 characters`);
  return {
    email: requiredProductionEnv(`INITIAL_${prefix}_EMAIL`).toLowerCase(),
    name: requiredProductionEnv(`INITIAL_${prefix}_NAME`),
    designation: role === "hospital_admin" ? "Hospital administrator" : "Security administrator",
    password,
    role,
  };
}

async function main() {
  const code = requiredProductionEnv("HOSPITAL_CODE");
  if (!/^[A-Z0-9_-]{2,24}$/.test(code)) throw new Error("HOSPITAL_CODE must contain 2-24 uppercase letters, numbers, underscores, or hyphens");
  const hospitalName = requiredProductionEnv("PRODUCTION_HOSPITAL_NAME");
  const mrnPrefix = requiredProductionEnv("PRODUCTION_MRN_PREFIX");
  if (!/^[A-Z0-9-]{2,12}$/.test(mrnPrefix)) throw new Error("PRODUCTION_MRN_PREFIX must contain 2-12 uppercase letters, numbers, or hyphens");
  const facilityName = requiredProductionEnv("PRODUCTION_FACILITY_NAME");
  const hospitalAdmin = account("HOSPITAL_ADMIN", "hospital_admin");
  const securityAdmin = account("SECURITY_ADMIN", "security_admin");
  const serviceEmail = requiredProductionEnv("ODOO_SERVICE_ACCOUNT_EMAIL").toLowerCase();
  if (new Set([hospitalAdmin.email, securityAdmin.email, serviceEmail]).size !== 3) throw new Error("Initial administrator and Odoo service emails must be distinct");
  if (hospitalAdmin.password === securityAdmin.password) throw new Error("Initial administrator passwords must be different");

  const db = productionClient("openeyes-production-bootstrap");
  await db.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(724912003)");
    const existing = await db.query("SELECT id,is_demo FROM app.tenant WHERE code=$1", [code]);
    if (existing.rowCount) throw new Error(`Hospital ${code} already exists; bootstrap does not modify an existing tenant`);

    const tenantId = randomUUID();
    const facilityId = randomUUID();
    await db.query("INSERT INTO app.tenant(id,code,name,mrn_prefix,is_demo) VALUES($1,$2,$3,$4,false)", [tenantId, code, hospitalName, mrnPrefix]);
    await db.query("INSERT INTO app.facility(id,tenant_id,name,type) VALUES($1,$2,$3,'clinic')", [facilityId, tenantId, facilityName]);

    for (const permission of PERMISSIONS) {
      await db.query("INSERT INTO app.permission(code) VALUES($1) ON CONFLICT DO NOTHING", [permission]);
    }
    for (const role of ASSIGNABLE_ROLES) {
      await db.query("INSERT INTO app.role(tenant_id,code) VALUES($1,$2)", [tenantId, role]);
      for (const permission of ROLE_PERMISSIONS[role].filter(permission => !permission.startsWith("preview:"))) {
        await db.query("INSERT INTO app.role_permission(tenant_id,role_code,permission_code) VALUES($1,$2,$3)", [tenantId, role, permission]);
      }
    }

    let hospitalAdminId = "";
    for (const member of [hospitalAdmin, securityAdmin]) {
      const id = randomUUID();
      if (member.role === "hospital_admin") hospitalAdminId = id;
      const passwordHash = await hash(member.password, { algorithm: 2, memoryCost: 65536, timeCost: 3, parallelism: 1 });
      await db.query(`INSERT INTO app.user_account(id,tenant_id,email,full_name,designation,password_hash,must_change_password)
        VALUES($1,$2,$3,$4,$5,$6,true)`, [id, tenantId, member.email, member.name, member.designation, passwordHash]);
      await db.query("INSERT INTO app.user_role(tenant_id,user_id,role_code) VALUES($1,$2,$3)", [tenantId, id, member.role]);
      await db.query("INSERT INTO app.user_facility(tenant_id,user_id,facility_id) VALUES($1,$2,$3)", [tenantId, id, facilityId]);
    }

    const serviceId = randomUUID();
    const unusablePassword = await hash(randomBytes(48).toString("base64"), { algorithm: 2, memoryCost: 65536, timeCost: 3, parallelism: 1 });
    await db.query(`INSERT INTO app.user_account(id,tenant_id,email,full_name,designation,password_hash)
      VALUES($1,$2,$3,'Odoo integration','Non-interactive integration identity',$4)`, [serviceId, tenantId, serviceEmail, unusablePassword]);
    await db.query("INSERT INTO app.user_facility(tenant_id,user_id,facility_id) VALUES($1,$2,$3)", [tenantId, serviceId, facilityId]);
    await db.query(`INSERT INTO app.audit_log(tenant_id,actor_id,action,entity_type,entity_id,metadata)
      VALUES($1,$2,'tenant.production_bootstrapped','tenant',$1,$3::jsonb)`, [tenantId, hospitalAdminId, JSON.stringify({ facilityId, serviceAccountId: serviceId })]);
    await db.query("COMMIT");
    console.log(`Created production hospital ${code} with one clinic, two named administrators, and a non-interactive Odoo identity.`);
    console.log(`Set ODOO_DEFAULT_FACILITY_ID=${facilityId}, then run npm run preflight:production.`);
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    await db.end();
  }
}

main().catch(error => {
  console.error(`Production bootstrap failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
