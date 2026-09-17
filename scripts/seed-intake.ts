import pg from "pg";
import { assertDemoDatabase } from "./env";
import { todayKarachi } from "../src/lib/patients";
async function main() {
 const db = new pg.Client({ connectionString: assertDemoDatabase().toString() }); await db.connect();
 try {
  await db.query('BEGIN'); await db.query('SELECT pg_advisory_xact_lock(724912003)');
  const tenant = (await db.query("SELECT id,is_demo FROM app.tenant WHERE code='DEMO'")).rows[0];
  if (!tenant?.is_demo) throw new Error('A seeded demo hospital is required');
  const tid = tenant.id;
  const facilities = (await db.query("SELECT id FROM app.facility WHERE tenant_id=$1 AND type='clinic' ORDER BY name", [tid])).rows;
  const doctors = (await db.query("SELECT u.id FROM app.user_account u JOIN app.user_role r ON r.user_id=u.id AND r.tenant_id=u.tenant_id WHERE u.tenant_id=$1 AND r.role_code='doctor' ORDER BY u.email", [tid])).rows;
  for (const facility of facilities) {
   await db.query('INSERT INTO app.clinic_schedule(tenant_id,facility_id,start_minute,end_minute,slot_minutes) VALUES($1,$2,540,1020,15) ON CONFLICT DO NOTHING', [tid, facility.id]);
   for (const doctor of doctors) await db.query('INSERT INTO app.clinic_doctor(tenant_id,facility_id,doctor_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [tid, facility.id, doctor.id]);
   await db.query("INSERT INTO app.user_facility(tenant_id,user_id,facility_id) SELECT $1,u.id,$2 FROM app.user_account u WHERE u.tenant_id=$1 AND EXISTS(SELECT 1 FROM app.user_role r WHERE r.tenant_id=u.tenant_id AND r.user_id=u.id AND r.role_code IN ('receptionist','nurse','optometrist','doctor','hospital_admin')) ON CONFLICT DO NOTHING", [tid, facility.id]);
  }
  if ((await db.query('SELECT 1 FROM app.appointment WHERE tenant_id=$1 LIMIT 1', [tid])).rowCount) { await db.query('COMMIT'); console.log('Intake configuration ready; existing appointments preserved.'); return; }
  const reception = (await db.query("SELECT id FROM app.user_account WHERE tenant_id=$1 AND email='aisha.malik@demo.openeyes.local'", [tid])).rows[0].id;
  const nurse = (await db.query("SELECT id FROM app.user_account WHERE tenant_id=$1 AND email='nadia.raza@demo.openeyes.local'", [tid])).rows[0].id;
  const patients = (await db.query('SELECT id FROM app.patient WHERE tenant_id=$1 ORDER BY mrn LIMIT 24', [tid])).rows;
  for (let index = 0; index < patients.length; index++) {
   const facility = facilities[index % facilities.length].id, doctor = doctors[index % doctors.length].id;
   const minute = 540 + Math.floor(index / doctors.length) * 15;
   const time = `${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, '0')}`;
   const appointment = (await db.query('INSERT INTO app.appointment(tenant_id,patient_id,facility_id,doctor_id,appointment_date,slot_time,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [tid, patients[index].id, facility, doctor, todayKarachi(), time, reception])).rows[0].id;
   if (index < 8) {
    const stage = index < 4 ? 'waiting' : index < 6 ? 'workup' : 'consultation'; const version = index < 4 ? 1 : index < 6 ? 2 : 3;
    const encounter = (await db.query("INSERT INTO app.encounter(tenant_id,appointment_id,patient_id,facility_id,doctor_id,stage,version,checked_in_at,stage_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()-interval '10 minutes',now()-interval '2 minutes') RETURNING id", [tid, appointment, patients[index].id, facility, doctor, stage, version])).rows[0].id;
    await db.query("UPDATE app.appointment SET status='checked_in' WHERE id=$1", [appointment]);
    for (let v = 1; v <= version; v++) await db.query("INSERT INTO app.queue_transition(tenant_id,encounter_id,from_stage,to_stage,encounter_version,actor_id,at,reason) VALUES($1,$2,$3,$4,$5,$6,now()-make_interval(mins=>$7),'Synthetic intake example')", [tid, encounter, [null, 'waiting', 'workup'][v - 1], ['waiting','workup','consultation'][v - 1], v, v === 1 ? reception : nurse, 12 - v * 3]);
    if (index >= 6) {
     const revision = (await db.query("INSERT INTO app.workup_revision(tenant_id,encounter_id,version,author_id,notes,saved_at) VALUES($1,$2,1,$3,'Synthetic bilateral workup for demonstration',now()-interval '4 minutes') RETURNING id", [tid, encounter, nurse])).rows[0].id;
     for (const eye of ['OD','OS']) await db.query("INSERT INTO app.workup_eye(tenant_id,revision_id,eye,uncorrected,pinhole,corrected,iop,method,measured_at) VALUES($1,$2,$3,$4,'not_tested','6/9',$5,'NCT',now()-interval '5 minutes')", [tid, revision, eye, eye === 'OD' ? 'CF' : '6/12', eye === 'OD' ? 24 + index % 2 * 2 : 16]);
    }
   }
   await db.query("INSERT INTO app.audit_log(tenant_id,actor_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'appointment.seeded','appointment',$3,'{\"synthetic\":true}')", [tid, reception, appointment]);
  }
  await db.query('COMMIT'); console.log(`Seeded ${patients.length} appointments, 8 checked-in examples, and 2 saved bilateral workups. Dates use Asia/Karachi.`);
 } catch(error) { await db.query('ROLLBACK'); throw error; } finally { await db.end(); }
}
main().catch(error => { console.error('Intake seed failed:', error.code ?? error.message); process.exitCode = 1; });
