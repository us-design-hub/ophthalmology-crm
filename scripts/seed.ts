import { randomUUID } from "node:crypto";
import pg from "pg";
import { hash } from "@node-rs/argon2";
import { assertDemoDatabase } from "./env";
import { ROLES, PERMISSIONS, ROLE_PERMISSIONS, type Role } from "../src/lib/access";
import { encryptIdentifier, identifierIndex } from "../src/server/crypto";
import { todayKarachi } from "../src/lib/patients";

const staff: { name: string; email: string; role: Role; designation: string }[] = [
  { name: "Aisha Malik", email: "aisha.malik@demo.openeyes.local", role: "receptionist", designation: "Patient services officer" },
  { name: "Bilal Ahmed", email: "bilal.ahmed@demo.openeyes.local", role: "receptionist", designation: "Reception coordinator" },
  { name: "Dr. Sara Khan", email: "sara.khan@demo.openeyes.local", role: "doctor", designation: "Consultant ophthalmologist" },
  { name: "Dr. Hamza Ali", email: "hamza.ali@demo.openeyes.local", role: "doctor", designation: "Retina specialist" },
  { name: "Nadia Raza", email: "nadia.raza@demo.openeyes.local", role: "nurse", designation: "Ophthalmic nurse" },
  { name: "Usman Farooq", email: "usman.farooq@demo.openeyes.local", role: "optometrist", designation: "Optometrist" },
  { name: "Sana Iqbal", email: "sana.iqbal@demo.openeyes.local", role: "pharmacist", designation: "Pharmacist" },
  { name: "Imran Shah", email: "imran.shah@demo.openeyes.local", role: "cashier", designation: "Cashier" },
  { name: "Hina Aslam", email: "hina.aslam@demo.openeyes.local", role: "inventory_officer", designation: "Inventory officer" },
  { name: "Omar Siddiqui", email: "omar.siddiqui@demo.openeyes.local", role: "hospital_admin", designation: "Hospital administrator" },
  { name: "Faisal Noor", email: "faisal.noor@demo.openeyes.local", role: "security_admin", designation: "Security administrator" },
  { name: "Maryam Saeed", email: "maryam.saeed@demo.openeyes.local", role: "auditor", designation: "Clinical systems auditor" },
];
const givenNames = ["Fatima", "Abdul", "Zainab", "Mohammad", "Shazia", "Rashid", "Nasreen", "Javed", "Salma", "Tariq", "Rubina", "Khalid", "Bushra", "Arif", "Samina", "Nadeem", "Farzana", "Iqbal", "Rukhsana", "Sohail"];
const families = ["Ahmed", "Khan", "Siddiqui"];

async function main() {
  const url = assertDemoDatabase();
  const password = process.env.DEMO_ACCOUNT_PASSWORD;
  if (!password || password.length < 12) throw new Error("Set a unique demo account password of at least 12 characters");
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  const started = Date.now();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(724912002)");
    const found = await db.query("SELECT id,is_demo FROM app.tenant WHERE code='DEMO'");
    if (found.rowCount) {
      if (!found.rows[0].is_demo) throw new Error("Refusing to seed an existing non-demo hospital");
      await db.query("ROLLBACK");
      console.log("Demo tenant already exists; seed is idempotent and preserves registered patients.");
      return;
    }
    const tenantId = randomUUID();
    await db.query("INSERT INTO app.tenant(id,code,name,mrn_prefix,is_demo) VALUES($1,'DEMO','Demo Eye Hospital','DEH',true)", [tenantId]);
    const facilityIds: string[] = [];
    for (const [name, type] of [["General Ophthalmology", "clinic"], ["Retina", "clinic"], ["Glaucoma", "clinic"], ["Theatre", "theatre"], ["Pharmacy", "pharmacy"]]) {
      const facilityId = randomUUID(); facilityIds.push(facilityId);
      await db.query("INSERT INTO app.facility(id,tenant_id,name,type) VALUES($1,$2,$3,$4)", [facilityId, tenantId, name, type]);
    }
    for (const permission of PERMISSIONS) await db.query("INSERT INTO app.permission(code) VALUES($1) ON CONFLICT DO NOTHING", [permission]);
    for (const role of ROLES) {
      await db.query("INSERT INTO app.role(tenant_id,code) VALUES($1,$2)", [tenantId, role]);
      for (const permission of ROLE_PERMISSIONS[role]) await db.query("INSERT INTO app.role_permission(tenant_id,role_code,permission_code) VALUES($1,$2,$3)", [tenantId, role, permission]);
    }
    let creatorId = "";
    for (const member of staff) {
      const id = randomUUID(); if (!creatorId) creatorId = id;
      const passwordHash = await hash(password, { algorithm: 2, memoryCost: 65536, timeCost: 3, parallelism: 1 }); // Argon2id
      await db.query("INSERT INTO app.user_account(id,tenant_id,email,full_name,designation,password_hash) VALUES($1,$2,$3,$4,$5,$6)", [id, tenantId, member.email, member.name, member.designation, passwordHash]);
      await db.query("INSERT INTO app.user_role(tenant_id,user_id,role_code) VALUES($1,$2,$3)", [tenantId, id, member.role]);
      await db.query("INSERT INTO app.user_facility(tenant_id,user_id,facility_id) VALUES($1,$2,$3)", [tenantId, id, facilityIds[member.role === "pharmacist" ? 4 : 0]]);
    }
    const year = Number(todayKarachi().slice(0, 4));
    for (let index = 0; index < 60; index++) {
      const id = randomUUID();
      const identifier = `00000${String(index + 1).padStart(7, "0")}0`; // Deliberately synthetic, valid-length national identifier examples.
      const mrn = `DEH-${String(year).slice(-2)}-${String(index + 1).padStart(6, "0")}`;
      const dob = `${year - (38 + index % 43)}-${String(index % 12 + 1).padStart(2, "0")}-${String(index % 27 + 1).padStart(2, "0")}`;
      await db.query(`INSERT INTO app.patient(id,tenant_id,mrn,given_name,family_name,dob,dob_estimated,gender,phone_e164,identifier_type,identifier_encrypted,identifier_blind_index,identifier_last4,city,address,preferred_language,created_by,created_facility_id,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'cnic',$10,$11,$12,$13,$14,$15,$16,$17,now()-make_interval(days=>$18))`, [
        id, tenantId, mrn, givenNames[index % 20], families[Math.floor(index / 20)], dob, index % 9 === 0,
        index % 2 === 0 ? "female" : "male", `+92300${String(1000000 + index)}`,
        encryptIdentifier(tenantId, "cnic", identifier), identifierIndex(tenantId, "cnic", identifier), identifier.slice(-4),
        ["Karachi", "Lahore", "Peshawar"][index % 3], `Synthetic address ${index + 1}, Demo Colony`, index % 3 === 0 ? "ur" : "en", creatorId, facilityIds[0], index * 3,
      ]);
      if (index % 10 === 0) await db.query("INSERT INTO app.patient_flag(tenant_id,patient_id,type,value,created_by) VALUES($1,$2,'allergy','Demo allergy flag — verify during clinical review',$3)", [tenantId, id, creatorId]);
      if (index % 7 === 0) await db.query("INSERT INTO app.patient_flag(tenant_id,patient_id,type,value,created_by) VALUES($1,$2,'risk','Needs assistance with mobility',$3)", [tenantId, id, creatorId]);
      await db.query("INSERT INTO app.audit_log(tenant_id,actor_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'patient.seeded','patient',$3,'{\"synthetic\":true}')", [tenantId, creatorId, id]);
    }
    await db.query("INSERT INTO app.mrn_counter(tenant_id,year,sequence) VALUES($1,$2,60)", [tenantId, year]);
    await db.query("COMMIT");
    console.log(`Seeded 1 demo hospital, 5 facilities, 12 named accounts, and 60 synthetic patients in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
    console.log("Demo account choices are available on the login screen when explicitly enabled. Passwords were not printed.");
  } catch (error) { await db.query("ROLLBACK"); throw error; }
  finally { await db.end(); }
}
main().catch(error => { console.error("Seed failed:", error.code ?? error.message); process.exitCode = 1; });
