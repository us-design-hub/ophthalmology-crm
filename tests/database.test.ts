import "../scripts/test-env";
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { encryptIdentifier, identifierIndex } from "../src/server/crypto";

const admin = new pg.Client({ connectionString: process.env.DATABASE_ADMIN_URL });
const app = new pg.Client({ connectionString: process.env.DATABASE_URL });
let tenantId: string;
before(async () => { await admin.connect(); await app.connect(); tenantId = (await admin.query("SELECT id FROM app.tenant WHERE code='DEMO'")).rows[0].id; });
after(async () => { await app.end(); await admin.end(); });

test("signed event parents and plan children reject direct runtime mutation", async () => {
  const record=(await admin.query("SELECT d.id,p.id AS plan_id FROM app.doctor_event d JOIN app.event_plan p ON p.event_id=d.id WHERE d.tenant_id=$1 AND d.status='signed' LIMIT 1",[tenantId])).rows[0];
  assert.ok(record);
  await app.query('BEGIN');
  try {
    await app.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
    const attempts:[string,unknown[]][]=[['UPDATE app.doctor_event SET complaint=$2 WHERE id=$1',[record.id,'Tampered']],['DELETE FROM app.event_plan WHERE id=$1',[record.plan_id]],['INSERT INTO app.event_plan(id,tenant_id,event_id,eye,anatomy_site,intent,notes) VALUES($1,$2,$3,\'OS\',\'retina\',\'observation\',\'Tampered\')',[randomUUID(),tenantId,record.id]],['UPDATE app.clinical_addendum SET text=\'Tampered\' WHERE false',[]]];
    for(const [query,args] of attempts){await app.query('SAVEPOINT denied');await assert.rejects(app.query(query,args),(error:{code?:string})=>error.code==='42501');await app.query('ROLLBACK TO SAVEPOINT denied');}
  } finally {await app.query('ROLLBACK');}
});

test("all clinical tables require tenant context and enforce forced RLS",async()=>{
  const names=['formulary','doctor_event','event_plan','prescription','prescription_item','clinical_addendum'];
  const tables=(await admin.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname=ANY($1)",[names])).rows;assert.equal(tables.length,names.length);
  for(const row of tables){assert.equal(row.relrowsecurity,true);assert.equal(row.relforcerowsecurity,true);assert.equal((await app.query(`SELECT * FROM app.${row.relname}`)).rowCount,0);}
});

test("intake tables enforce RLS and clinical revisions cannot be mutated by the runtime role", async () => {
  const names = ['clinic_schedule','clinic_doctor','appointment','encounter','queue_transition','workup_revision','workup_eye'];
  const tables = (await admin.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname=ANY($1)",[names])).rows;
  assert.equal(tables.length,names.length);
  for(const table of tables) { assert.equal(table.relrowsecurity,true); assert.equal(table.relforcerowsecurity,true); assert.equal((await app.query(`SELECT * FROM app.${table.relname}`)).rowCount,0); }
  for(const statement of ["UPDATE app.workup_eye SET iop=10 WHERE false","DELETE FROM app.workup_revision WHERE false","DELETE FROM app.queue_transition WHERE false","UPDATE app.appointment SET patient_id=gen_random_uuid() WHERE false","UPDATE app.encounter SET patient_id=gen_random_uuid() WHERE false"]) await assert.rejects(app.query(statement),(error: {code?:string}) => error.code==='42501');
});

test("runtime connects as a non-owner role without a row-security bypass", async () => {
  const row = (await app.query("SELECT current_user,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows[0];
  assert.equal(row.current_user, "openeyes_app"); assert.equal(row.rolsuper, false); assert.equal(row.rolbypassrls, false);
  const tables = await admin.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='app' AND c.relname IN ('patient','patient_flag','audit_log','session','user_account')");
  assert.equal(tables.rowCount, 5);
  for (const table of tables.rows) { assert.equal(table.relrowsecurity, true); assert.equal(table.relforcerowsecurity, true); assert.notEqual(table.owner, "openeyes_app"); }
});

test("missing tenant context denies reads and transaction-local context does not leak", async () => {
  assert.equal((await app.query("SELECT id FROM app.patient")).rowCount, 0);
  await app.query("BEGIN");
  await app.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
  assert.ok((await app.query("SELECT id FROM app.patient")).rowCount! >= 60);
  await app.query("COMMIT");
  assert.equal((await app.query("SELECT id FROM app.patient")).rowCount, 0);
});

test("audit rows and patient identity remain protected from runtime mutation", async () => {
  for (const statement of ["UPDATE app.audit_log SET action='tampered' WHERE false", "DELETE FROM app.audit_log WHERE false", "TRUNCATE app.audit_log", "DELETE FROM app.patient WHERE false", "UPDATE app.patient SET mrn='changed' WHERE false"]) {
    await assert.rejects(app.query(statement), (error: { code?: string }) => error.code === "42501");
  }
});

test("patient identifiers are ciphertext and sensitive values are absent from audit metadata", async () => {
  const patients = await admin.query("SELECT identifier_encrypted,identifier_blind_index,identifier_last4 FROM app.patient WHERE tenant_id=$1 LIMIT 60", [tenantId]);
  for (const row of patients.rows) { assert.match(row.identifier_encrypted, /^v1\./); assert.equal(row.identifier_blind_index.length, 64); assert.equal(row.identifier_last4.length, 4); }
  const result = await admin.query("SELECT count(*)::int AS total FROM app.audit_log WHERE metadata::text ~ '00000[0-9]{8}'");
  assert.equal(result.rows[0].total, 0);
});

test("a second hospital's rows are invisible and cross-tenant writes fail", async () => {
  // Roll back all fixtures; no second hospital remains in the test registry.
  const otherTenant = randomUUID(); const facility = randomUUID(); const author = randomUUID(); const patient = randomUUID();
  await admin.query("BEGIN");
  try {
    await admin.query("INSERT INTO app.tenant(id,code,name,mrn_prefix,is_demo) VALUES($1,$2,'Isolation test','ISO',true)", [otherTenant, `TEST-${otherTenant}`]);
    await admin.query("INSERT INTO app.facility(id,tenant_id,name,type) VALUES($1,$2,'Test clinic','clinic')", [facility, otherTenant]);
    await admin.query("INSERT INTO app.user_account(id,tenant_id,email,full_name,designation,password_hash) VALUES($1,$2,'fixture@test.invalid','Fixture','Fixture','not-a-login-hash')", [author, otherTenant]);
    await admin.query(`INSERT INTO app.patient(id,tenant_id,mrn,given_name,dob,gender,phone_e164,identifier_type,identifier_encrypted,identifier_blind_index,identifier_last4,created_by,created_facility_id)
      VALUES($1,$2,'ISO-TEST','Isolated','1970-01-01','unknown','+923009999999','cnic',$3,$4,'0000',$5,$6)`, [patient, otherTenant, encryptIdentifier(otherTenant, "cnic", "0000000000000"), identifierIndex(otherTenant, "cnic", "0000000000000"), author, facility]);
    await admin.query("INSERT INTO app.clinic_schedule(tenant_id,facility_id,start_minute,end_minute,slot_minutes) VALUES($1,$2,540,1020,15)", [otherTenant,facility]);
    await admin.query("INSERT INTO app.clinic_doctor(tenant_id,facility_id,doctor_id) VALUES($1,$2,$3)", [otherTenant,facility,author]);
    const appointment = (await admin.query("INSERT INTO app.appointment(tenant_id,patient_id,facility_id,doctor_id,appointment_date,slot_time,created_by) VALUES($1,$2,$3,$4,current_date,'09:00',$4) RETURNING id", [otherTenant,patient,facility,author])).rows[0].id;
    const encounter = (await admin.query("INSERT INTO app.encounter(tenant_id,appointment_id,patient_id,facility_id,doctor_id) VALUES($1,$2,$3,$4,$5) RETURNING id", [otherTenant,appointment,patient,facility,author])).rows[0].id;
    await admin.query("INSERT INTO app.queue_transition(tenant_id,encounter_id,to_stage,encounter_version,actor_id) VALUES($1,$2,'waiting',1,$3)", [otherTenant,encounter,author]);
    const revision = (await admin.query("INSERT INTO app.workup_revision(tenant_id,encounter_id,version,author_id) VALUES($1,$2,1,$3) RETURNING id", [otherTenant,encounter,author])).rows[0].id;
    await admin.query("INSERT INTO app.workup_eye(tenant_id,revision_id,eye,uncorrected,pinhole,corrected,iop,method,measured_at) VALUES($1,$2,'OD','CF','HM','6/12',24,'NCT',now())", [otherTenant,revision]);
    const drug=(await admin.query("INSERT INTO app.formulary(tenant_id,name,strength,therapy_group) VALUES($1,'Isolation drug','Demo','Demo') RETURNING id",[otherTenant])).rows[0].id;
    const event=(await admin.query('INSERT INTO app.doctor_event(tenant_id,encounter_id,author_id) VALUES($1,$2,$3) RETURNING id',[otherTenant,encounter,author])).rows[0].id;
    await admin.query("INSERT INTO app.event_plan(id,tenant_id,event_id,eye,anatomy_site,intent) VALUES($1,$2,$3,'OD','lens','observation')",[randomUUID(),otherTenant,event]);
    const prescription=(await admin.query('INSERT INTO app.prescription(tenant_id,event_id,author_id) VALUES($1,$2,$3) RETURNING id',[otherTenant,event,author])).rows[0].id;
    await admin.query("INSERT INTO app.prescription_item(id,tenant_id,prescription_id,position,drug_id,name,strength,eye,dose,route,frequency,duration) VALUES($1,$2,$3,0,$4,'Isolation drug','Demo','OD','Demo','Demo','Demo','Demo')",[randomUUID(),otherTenant,prescription,drug]);
    await admin.query("UPDATE app.doctor_event SET status='signed',signed_at=now(),signed_by=$2,snapshot_text='{}',content_hash=encode(sha256(convert_to('{}','UTF8')),'hex') WHERE id=$1",[event,author]);
    await admin.query("INSERT INTO app.clinical_addendum(tenant_id,event_id,author_id,text,content_hash) VALUES($1,$2,$3,'Isolation addendum',repeat('0',64))",[otherTenant,event,author]);
    await admin.query('INSERT INTO app.operations_preview(tenant_id,data) VALUES($1,$2)', [otherTenant, JSON.stringify({version:1,asOf:"2026-09-15",invoices:[{id:"other-tenant-only"}]})]);
    await admin.query("SET LOCAL ROLE openeyes_app");
    await admin.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
    assert.equal((await admin.query("SELECT id FROM app.patient WHERE id=$1", [patient])).rowCount, 0);
    assert.equal((await admin.query("SELECT * FROM app.operations_preview WHERE tenant_id=$1", [otherTenant])).rowCount, 0);
    for (const table of ['clinic_schedule','clinic_doctor','appointment','encounter','queue_transition','workup_revision','workup_eye']) assert.equal((await admin.query(`SELECT * FROM app.${table} WHERE tenant_id=$1`,[otherTenant])).rowCount,0);
    for (const table of ['formulary','doctor_event','event_plan','prescription','prescription_item','clinical_addendum']) assert.equal((await admin.query(`SELECT * FROM app.${table} WHERE tenant_id=$1`,[otherTenant])).rowCount,0);
    await admin.query("SAVEPOINT denied_write");
    await assert.rejects(admin.query("INSERT INTO app.patient_flag(tenant_id,patient_id,type,value,created_by) VALUES($1,$2,'risk','Test',$3)", [otherTenant, patient, author]), (error: { code?: string }) => error.code === "42501");
    await admin.query("ROLLBACK TO SAVEPOINT denied_write");
    await admin.query("SELECT set_config('app.tenant_id',$1,true)", [otherTenant]);
    assert.equal((await admin.query("SELECT id FROM app.patient")).rowCount, 1);
    assert.equal((await admin.query("SELECT * FROM app.operations_preview")).rowCount, 1);
    assert.equal((await admin.query("SELECT * FROM app.operations_preview WHERE tenant_id=$1", [tenantId])).rowCount, 0);
    assert.equal((await admin.query("SELECT id FROM app.patient WHERE tenant_id=$1", [tenantId])).rowCount, 0);
  } finally { await admin.query("ROLLBACK"); }
});


test("operations snapshots require tenant context and reject all runtime writes", async () => {
  assert.equal((await app.query('SELECT * FROM app.operations_preview')).rowCount,0);
  await app.query('BEGIN');
  try {
    await app.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
    assert.equal((await app.query('SELECT * FROM app.operations_preview')).rowCount,1);
    for(const sql of ["UPDATE app.operations_preview SET data='{}'::jsonb", 'DELETE FROM app.operations_preview', "INSERT INTO app.operations_preview(tenant_id,data) VALUES(gen_random_uuid(),'{\"version\":1}'::jsonb)"]){
      await app.query('SAVEPOINT denied'); await assert.rejects(app.query(sql),(error:{code?:string})=>error.code==='42501'); await app.query('ROLLBACK TO SAVEPOINT denied');
    }
  } finally {await app.query('ROLLBACK');}
});

test('new operational tables enforce RLS and financial and stock ledgers are append-only',async()=>{const names=['stock_batch','stock_movement','dispense','invoice','invoice_line','payment','refund','cashier_session','surgery_case','consent_document','patient_history'];for(const name of names){const row=(await admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass",['app.'+name])).rows[0];assert.equal(row.relrowsecurity,true);assert.equal(row.relforcerowsecurity,true);assert.equal((await app.query('SELECT 1 FROM app.'+name)).rowCount,0);}for(const statement of ['UPDATE app.stock_movement SET quantity=1 WHERE false','DELETE FROM app.payment WHERE false','UPDATE app.invoice SET total_paisa=0 WHERE false','UPDATE app.dispense SET actor_id=gen_random_uuid() WHERE false','DELETE FROM app.consent_document WHERE false',"UPDATE app.patient_history SET text='tampered' WHERE false"])await assert.rejects(app.query(statement),(e:{code?:string})=>e.code==='42501');});
