import "server-only";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { AuthUser } from "@/lib/access";
import { bookingSchema, bookingDateAllowed, canTransition, dateSchema, slotTimes, transitionSchema, workupSchema, type Encounter, type Workup, type EncounterDetail, type Clinic } from "@/lib/intake";
import { todayKarachi } from "@/lib/patients";
import { withTenant } from "./db";
import { audit, type AuditContext } from "./audit";
import { ApiError } from "./http";

function parse<T>(schema: z.ZodType<T>, input: unknown): T { const result = schema.safeParse(input); if (!result.success) throw new ApiError(400, "intakeInvalid"); return result.data; }
export function intakeDate(value: unknown) { return parse(dateSchema, value ?? todayKarachi()); }
function facilityAccess(user: AuthUser, facilityId: string) { if (!user.facilityIds.includes(facilityId)) throw new ApiError(403, "accessDenied"); }
const flags = `(SELECT coalesce(jsonb_agg(jsonb_build_object('type',pf.type,'value',pf.value)),'[]') FROM app.patient_flag pf WHERE pf.tenant_id=p.tenant_id AND pf.patient_id=p.id AND pf.resolved_at IS NULL)`;
const encounterSelect = `SELECT e.id,e.patient_id AS "patientId",concat_ws(' ',p.given_name,p.family_name) AS name,p.mrn,e.facility_id AS "facilityId",f.name AS clinic,e.doctor_id AS "doctorId",u.full_name AS doctor,e.stage,e.priority,e.version,e.checked_in_at AS "checkedInAt",e.stage_at AS "stageAt",e.dilation_ready_at AS "dilationReadyAt",coalesce((SELECT max(w.version) FROM app.workup_revision w WHERE w.tenant_id=e.tenant_id AND w.encounter_id=e.id),0) AS "workupVersion",${flags} AS flags FROM app.encounter e JOIN app.patient p ON p.id=e.patient_id AND p.tenant_id=e.tenant_id JOIN app.facility f ON f.id=e.facility_id AND f.tenant_id=e.tenant_id JOIN app.user_account u ON u.id=e.doctor_id AND u.tenant_id=e.tenant_id`;
async function event(db: PoolClient, user: AuthUser, context: AuditContext, action: string, entityType: string, entityId?: string, metadata?: Record<string, unknown>) { await audit(db, { tenantId: user.tenantId, actorId: user.id, action, entityType, entityId, metadata, context }); }
async function lockEncounter(db: PoolClient, user: AuthUser, id: string) {
 const result = await db.query('SELECT * FROM app.encounter WHERE id=$1 AND facility_id=ANY($2::uuid[]) FOR UPDATE', [id, user.facilityIds]);
 if (!result.rowCount) throw new ApiError(404, "encounterNotFound");
 if (result.rows[0].closed_at) throw new ApiError(409, "encounterLocked");
 return result.rows[0];
}
export async function latestWorkup(db: PoolClient, encounterId: string): Promise<Workup | null> {
 const result = await db.query(`SELECT w.id,w.encounter_id AS "encounterId",w.version,w.author_id AS "authorId",u.full_name AS author,w.saved_at AS "savedAt",w.notes FROM app.workup_revision w JOIN app.user_account u ON u.id=w.author_id AND u.tenant_id=w.tenant_id WHERE w.encounter_id=$1 ORDER BY w.version DESC LIMIT 1`, [encounterId]);
 if (!result.rowCount) return null;
 const eyes = await db.query('SELECT eye,refraction,logmar,uncorrected,pinhole,corrected,iop::float8 AS iop,method,measured_at AS "measuredAt" FROM app.workup_eye WHERE revision_id=$1 ORDER BY eye', [result.rows[0].id]);
 return { ...result.rows[0], ...Object.fromEntries(eyes.rows.map(({ eye, ...measurement }) => [eye, measurement])) } as Workup;
}
export async function clinics(user: AuthUser): Promise<{ clinics: Clinic[] }> {
 return withTenant(user.tenantId, user.id, async db => ({ clinics: (await db.query(`SELECT f.id,f.name,s.start_minute AS "startMinute",s.end_minute AS "endMinute",s.slot_minutes AS "slotMinutes",coalesce((SELECT jsonb_agg(jsonb_build_object('id',u.id,'name',u.full_name) ORDER BY u.full_name) FROM app.clinic_doctor cd JOIN app.user_account u ON u.id=cd.doctor_id AND u.tenant_id=cd.tenant_id WHERE cd.active AND cd.facility_id=f.id AND cd.tenant_id=f.tenant_id AND u.status='active' AND EXISTS(SELECT 1 FROM app.user_role ur WHERE ur.tenant_id=u.tenant_id AND ur.user_id=u.id AND ur.role_code='doctor') AND EXISTS(SELECT 1 FROM app.user_facility uf WHERE uf.tenant_id=u.tenant_id AND uf.user_id=u.id AND uf.facility_id=f.id)),'[]') AS doctors FROM app.clinic_schedule s JOIN app.facility f ON f.id=s.facility_id AND f.tenant_id=s.tenant_id WHERE f.active AND f.id=ANY($1::uuid[]) ORDER BY f.name`, [user.facilityIds])).rows }));
}
export async function availableSlots(user: AuthUser, input: unknown) {
 const data = parse(bookingSchema.omit({ patientId: true, time: true }), input); facilityAccess(user, data.facilityId);
 const clinic = (await clinics(user)).clinics.find(value => value.id === data.facilityId && value.doctors.some(doctor => doctor.id === data.doctorId));
 if (!clinic || !bookingDateAllowed(data.date)) throw new ApiError(400, "slotUnavailable");
 return withTenant(user.tenantId, user.id, async db => {
  const schedule=(await db.query('SELECT weekdays,closed_dates::text[] AS closed_dates FROM app.clinic_schedule WHERE facility_id=$1',[data.facilityId])).rows[0];
  if(!schedule.weekdays.includes(new Date(data.date+'T12:00:00Z').getUTCDay())||schedule.closed_dates.includes(data.date))return {slots:[]};
  const busy = (await db.query("SELECT to_char(slot_time,'HH24:MI') AS time FROM app.appointment WHERE doctor_id=$1 AND appointment_date=$2 AND status IN ('booked','checked_in')", [data.doctorId, data.date])).rows.map(row => row.time);
  return { slots: slotTimes(clinic.startMinute, clinic.endMinute, clinic.slotMinutes).filter(time => !busy.includes(time)) };
 });
}
export async function appointments(user: AuthUser, date: string, context: AuditContext) {
 return withTenant(user.tenantId, user.id, async db => {
  const result = await db.query(`SELECT a.id,a.patient_id AS "patientId",concat_ws(' ',p.given_name,p.family_name) AS name,p.mrn,a.facility_id AS "facilityId",f.name AS clinic,a.doctor_id AS "doctorId",u.full_name AS doctor,a.appointment_date AS date,to_char(a.slot_time,'HH24:MI') AS time,a.status,a.version,e.id AS "encounterId",${flags} AS flags FROM app.appointment a JOIN app.patient p ON p.id=a.patient_id AND p.tenant_id=a.tenant_id JOIN app.facility f ON f.id=a.facility_id AND f.tenant_id=a.tenant_id JOIN app.user_account u ON u.id=a.doctor_id AND u.tenant_id=a.tenant_id LEFT JOIN app.encounter e ON e.appointment_id=a.id AND e.tenant_id=a.tenant_id WHERE a.appointment_date=$1 AND a.facility_id=ANY($2::uuid[]) ORDER BY a.slot_time,f.name,u.full_name`, [date, user.facilityIds]);
  await event(db, user, context, "appointment.list", "appointment", undefined, { count: result.rowCount }); return { appointments: result.rows };
 });
}
export async function book(user: AuthUser, input: unknown, context: AuditContext) {
 const data = parse(bookingSchema, input); facilityAccess(user, data.facilityId);
 if (!bookingDateAllowed(data.date)) throw new ApiError(400, "bookingDateInvalid");
 try { return await withTenant(user.tenantId, user.id, async db => {
  // Serialize bookings for a doctor across clinics. Revalidate availability inside the transaction.
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`booking:${user.tenantId}:${data.doctorId}:${data.date}`]);
  const roster = await db.query(`SELECT s.start_minute,s.end_minute,s.slot_minutes,s.weekdays,s.closed_dates::text[] AS closed_dates FROM app.clinic_schedule s JOIN app.clinic_doctor cd ON cd.facility_id=s.facility_id AND cd.tenant_id=s.tenant_id JOIN app.user_account u ON u.id=cd.doctor_id AND u.tenant_id=cd.tenant_id WHERE cd.active AND EXISTS(SELECT 1 FROM app.facility f WHERE f.id=s.facility_id AND f.active) AND s.facility_id=$1 AND cd.doctor_id=$2 AND u.status='active' AND EXISTS(SELECT 1 FROM app.user_role ur WHERE ur.tenant_id=u.tenant_id AND ur.user_id=u.id AND ur.role_code='doctor') AND EXISTS(SELECT 1 FROM app.user_facility uf WHERE uf.tenant_id=u.tenant_id AND uf.user_id=u.id AND uf.facility_id=s.facility_id)`, [data.facilityId, data.doctorId]);
  const schedule = roster.rows[0];
  if (!schedule || !schedule.weekdays.includes(new Date(data.date+'T12:00:00Z').getUTCDay()) || schedule.closed_dates.includes(data.date) || !slotTimes(schedule.start_minute, schedule.end_minute, schedule.slot_minutes).includes(data.time)) throw new ApiError(409, "slotUnavailable");
  if (!(await db.query('SELECT id FROM app.patient WHERE id=$1', [data.patientId])).rowCount) throw new ApiError(404, "patientNotFound");
  const result = await db.query('INSERT INTO app.appointment(tenant_id,patient_id,facility_id,doctor_id,appointment_date,slot_time,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [user.tenantId, data.patientId, data.facilityId, data.doctorId, data.date, data.time, user.id]);
  await event(db, user, context, "appointment.booked", "appointment", result.rows[0].id); return result.rows[0];
 }); } catch (error) { if ((error as { code?: string }).code === "23505") throw new ApiError(409, "bookingConflict"); throw error; }
}
export async function checkIn(user: AuthUser, input: unknown, context: AuditContext) {
 const { appointmentId } = parse(z.object({ appointmentId: z.uuid() }).strict(), input);
 try { return await withTenant(user.tenantId, user.id, async db => {
  const result = await db.query('SELECT * FROM app.appointment WHERE id=$1 AND facility_id=ANY($2::uuid[]) FOR UPDATE', [appointmentId, user.facilityIds]);
  if (!result.rowCount) throw new ApiError(404, "appointmentNotFound"); const appointment = result.rows[0];
  if (appointment.status !== "booked") throw new ApiError(409, "alreadyCheckedIn");
  if (appointment.appointment_date !== todayKarachi()) throw new ApiError(409, "checkInTodayOnly");
  const encounter = (await db.query('INSERT INTO app.encounter(tenant_id,appointment_id,patient_id,facility_id,doctor_id) VALUES($1,$2,$3,$4,$5) RETURNING id', [user.tenantId, appointmentId, appointment.patient_id, appointment.facility_id, appointment.doctor_id])).rows[0];
  await db.query("UPDATE app.appointment SET status='checked_in' WHERE id=$1", [appointmentId]);
  await db.query("INSERT INTO app.queue_transition(tenant_id,encounter_id,to_stage,encounter_version,actor_id) VALUES($1,$2,'waiting',1,$3)", [user.tenantId, encounter.id, user.id]);
  await event(db, user, context, "appointment.checked_in", "encounter", encounter.id, { appointmentId }); return encounter;
 }); } catch (error) { if ((error as { code?: string }).code === "23505") throw new ApiError(409, "activeEncounterExists"); throw error; }
}
export async function queue(user: AuthUser, context: AuditContext) {
 return withTenant(user.tenantId, user.id, async db => {
  const result = await db.query(`${encounterSelect} WHERE e.closed_at IS NULL AND e.facility_id=ANY($1::uuid[]) ORDER BY (e.priority='urgent') DESC,e.stage_at,e.id`, [user.facilityIds]);
  await event(db, user, context, "queue.viewed", "encounter", undefined, { count: result.rowCount }); return { encounters: result.rows, serverNow: new Date().toISOString() };
 });
}
export async function transition(user: AuthUser, input: unknown, context: AuditContext) {
 const data = parse(transitionSchema, input);
 const permission = data.to === "workup" ? "queue:workup" : "queue:handoff";
 if (!user.permissions.includes(permission)) throw new ApiError(403, "accessDenied");
 return withTenant(user.tenantId, user.id, async db => {
  const encounter = await lockEncounter(db, user, data.encounterId);
  if (encounter.version !== data.version || !canTransition(encounter.stage, data.to)) throw new ApiError(409, "queueConflict");
  if (data.to !== "workup" && !(await latestWorkup(db, data.encounterId))) throw new ApiError(409, "workupRequired");
  if (encounter.stage === "dilation" && new Date(encounter.dilation_ready_at).getTime() > Date.now() && data.reason.length < 8) throw new ApiError(409, "dilationReasonRequired");
  await db.query("UPDATE app.encounter SET stage=$2,version=version+1,stage_at=now(),dilation_ready_at=CASE WHEN $2='dilation' THEN now()+make_interval(mins=>coalesce((SELECT (settings->>'dilationMinutes')::int FROM app.tenant WHERE id=app.encounter.tenant_id),20)) ELSE dilation_ready_at END WHERE id=$1", [data.encounterId, data.to]);
  await db.query('INSERT INTO app.queue_transition(tenant_id,encounter_id,from_stage,to_stage,encounter_version,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7)', [user.tenantId, data.encounterId, encounter.stage, data.to, data.version + 1, user.id, data.reason]);
  await event(db, user, context, "queue.transitioned", "encounter", data.encounterId, { from: encounter.stage, to: data.to, reason: data.reason, version: data.version + 1 }); return { version: data.version + 1 };
 });
}
export async function workupDetail(user: AuthUser, id: unknown, context: AuditContext): Promise<EncounterDetail> {
 const encounterId = parse(z.uuid(), id);
 return withTenant(user.tenantId, user.id, async db => {
  // A consistent snapshot: serialize with workup revisions and queue transitions.
  await lockEncounter(db, user, encounterId);
  const encounter = (await db.query(`${encounterSelect} WHERE e.id=$1`, [encounterId])).rows[0] as Encounter;
  const history = (await db.query('SELECT q.from_stage AS "from",q.to_stage AS "to",u.full_name AS actor,q.at,q.reason FROM app.queue_transition q JOIN app.user_account u ON u.id=q.actor_id AND u.tenant_id=q.tenant_id WHERE q.encounter_id=$1 ORDER BY q.encounter_version', [encounterId])).rows;
  await event(db, user, context, "workup.read", "encounter", encounterId);
  return { encounter, workup: await latestWorkup(db, encounterId), history };
 });
}
export async function saveWorkup(user: AuthUser, input: unknown, context: AuditContext) {
 const data = parse(workupSchema, input);
 return withTenant(user.tenantId, user.id, async db => {
  const encounter = await lockEncounter(db, user, data.encounterId);
  if (encounter.stage !== "workup") throw new ApiError(409, "encounterLocked");
  for (const eye of [data.OD, data.OS]) { const measured = new Date(eye.measuredAt).getTime(); if (measured > Date.now() + 60_000 || measured < new Date(encounter.checked_in_at).getTime() - 60_000) throw new ApiError(400, "measurementTimeInvalid"); }
  const prior = await latestWorkup(db, data.encounterId);
  if ((prior?.version ?? 0) !== data.version) throw new ApiError(409, "workupConflict");
  if (prior && prior.authorId !== user.id) throw new ApiError(403, "workupOwnership");
  const revision = (await db.query('INSERT INTO app.workup_revision(tenant_id,encounter_id,version,author_id,notes) VALUES($1,$2,$3,$4,$5) RETURNING id', [user.tenantId, data.encounterId, data.version + 1, user.id, data.notes])).rows[0];
  for (const eye of ["OD", "OS"] as const) { const value = data[eye]; await db.query('INSERT INTO app.workup_eye(tenant_id,revision_id,eye,uncorrected,pinhole,corrected,iop,method,measured_at,refraction,logmar) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [user.tenantId, revision.id, eye, value.uncorrected, value.pinhole, value.corrected, value.iop, value.method, value.measuredAt, value.refraction?JSON.stringify(value.refraction):null,value.logmar?JSON.stringify(value.logmar):null]); }
  await event(db, user, context, "workup.saved", "encounter", data.encounterId, { revisionId: revision.id, version: data.version + 1 });
  return { workup: await latestWorkup(db, data.encounterId) };
 });
}
export async function overview(user: AuthUser) {
 return withTenant(user.tenantId, user.id, async db => {
  const appointments = (await db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE status='checked_in')::int AS checked_in FROM app.appointment WHERE appointment_date=$1 AND facility_id=ANY($2::uuid[])", [todayKarachi(), user.facilityIds])).rows[0];
  const stages = (await db.query('SELECT stage,count(*)::int AS count FROM app.encounter WHERE closed_at IS NULL AND facility_id=ANY($1::uuid[]) GROUP BY stage', [user.facilityIds])).rows;
  return { date: todayKarachi(), appointments: appointments.total, checkedIn: appointments.checked_in, stages: Object.fromEntries(stages.map(row => [row.stage, row.count])) };
 });
}

export async function manageAppointment(user:AuthUser,input:unknown,context:AuditContext){
 if(!user.permissions.includes('appointment:manage'))throw new ApiError(403,'accessDenied');
 const d=parse(z.object({id:z.uuid(),version:z.number().int().positive(),action:z.enum(['cancelled','no_show','rescheduled']),reason:z.string().trim().min(8).max(500),booking:bookingSchema.omit({patientId:true}).optional()}).strict(),input);
 try{return await withTenant(user.tenantId,user.id,async db=>{const old=(await db.query('SELECT * FROM app.appointment WHERE id=$1 AND facility_id=ANY($2::uuid[]) FOR UPDATE',[d.id,user.facilityIds])).rows[0];if(!old)throw new ApiError(404,'appointmentNotFound');if(old.status!=='booked'||old.version!==d.version)throw new ApiError(409,'bookingConflict');
 if(d.action==='no_show'&&old.appointment_date>todayKarachi())throw new ApiError(400,'bookingDateInvalid');
 await db.query('UPDATE app.appointment SET status=$2,version=version+1,change_reason=$3 WHERE id=$1',[d.id,d.action,d.reason]);let replacementId:string|undefined;
 if(d.action==='rescheduled'){const b=d.booking;if(!b||!bookingDateAllowed(b.date))throw new ApiError(400,'bookingDateInvalid');facilityAccess(user,b.facilityId);await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`booking:${user.tenantId}:${b.doctorId}:${b.date}`]);
 const roster=(await db.query("SELECT s.* FROM app.clinic_schedule s JOIN app.clinic_doctor cd ON cd.tenant_id=s.tenant_id AND cd.facility_id=s.facility_id JOIN app.facility f ON f.id=s.facility_id JOIN app.user_account u ON u.id=cd.doctor_id WHERE s.facility_id=$1 AND cd.doctor_id=$2 AND cd.active AND f.active AND u.status='active' AND EXISTS(SELECT 1 FROM app.user_role r WHERE r.user_id=u.id AND r.role_code='doctor') AND EXISTS(SELECT 1 FROM app.user_facility uf WHERE uf.user_id=u.id AND uf.facility_id=f.id)",[b.facilityId,b.doctorId])).rows[0];
 if(!roster||!roster.weekdays.includes(new Date(b.date+'T12:00:00Z').getUTCDay())||roster.closed_dates.includes(b.date)||!slotTimes(roster.start_minute,roster.end_minute,roster.slot_minutes).includes(b.time))throw new ApiError(409,'slotUnavailable');
 replacementId=(await db.query('INSERT INTO app.appointment(tenant_id,patient_id,facility_id,doctor_id,appointment_date,slot_time,created_by,replaces_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[user.tenantId,old.patient_id,b.facilityId,b.doctorId,b.date,b.time,user.id,d.id])).rows[0].id;}
 await event(db,user,context,'appointment.'+d.action,'appointment',d.id,{reason:d.reason,replacementId});return {ok:true,id:replacementId};});}catch(error){if((error as {code?:string}).code==='23505')throw new ApiError(409,'bookingConflict');throw error;}}
export async function manageQueue(user:AuthUser,input:unknown,context:AuditContext){if(!user.permissions.includes('queue:manage'))throw new ApiError(403,'accessDenied');const d=parse(z.object({id:z.uuid(),version:z.number().int().positive(),action:z.enum(['urgent','routine','left_before_seen','completed']),reason:z.string().trim().min(8).max(500)}).strict(),input);return withTenant(user.tenantId,user.id,async db=>{const e=await lockEncounter(db,user,d.id);if(e.version!==d.version)throw new ApiError(409,'queueConflict');if(d.action==='completed'){
 if(e.stage!=='pharmacy_billing')throw new ApiError(409,'queueConflict');
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`operations:${user.tenantId}`]);
 const unpaid=(await db.query('SELECT 1 FROM app.invoice i WHERE i.encounter_id=$1 AND i.total_paisa>coalesce((SELECT sum(p.amount_paisa) FROM app.payment p WHERE p.invoice_id=i.id),0)-coalesce((SELECT sum(r.amount_paisa) FROM app.refund r JOIN app.payment p ON p.id=r.payment_id WHERE p.invoice_id=i.id AND r.approved_at IS NOT NULL),0)',[d.id])).rowCount;
 const pending=(await db.query("SELECT 1 FROM app.prescription r JOIN app.doctor_event v ON v.id=r.event_id WHERE v.encounter_id=$1 AND NOT EXISTS(SELECT 1 FROM app.prescription_closure c WHERE c.prescription_id=r.id) AND EXISTS(SELECT 1 FROM app.prescription_item i WHERE i.prescription_id=r.id AND (i.quantity IS NULL OR i.quantity>coalesce((SELECT sum(-m.quantity) FROM app.dispense x JOIN app.stock_movement m ON m.id=x.movement_id WHERE x.prescription_item_id=i.id),0)))",[d.id])).rowCount;
 if(unpaid||pending)throw new ApiError(409,'outstandingVisitTasks');
 await db.query("UPDATE app.encounter SET stage='completed',closed_at=now(),closure_reason=$2,version=version+1 WHERE id=$1",[d.id,d.reason]);await db.query("INSERT INTO app.queue_transition(tenant_id,encounter_id,from_stage,to_stage,encounter_version,actor_id,reason) VALUES($1,$2,$3,'completed',$4,$5,$6)",[user.tenantId,d.id,e.stage,d.version+1,user.id,d.reason]);
 }else if(d.action==='left_before_seen'){if(['consultation','pharmacy_billing'].includes(e.stage)||(await db.query('SELECT 1 FROM app.doctor_event WHERE encounter_id=$1',[d.id])).rowCount)throw new ApiError(409,'encounterLocked');await db.query("UPDATE app.encounter SET stage='left_before_seen',closed_at=now(),closure_reason=$2,version=version+1 WHERE id=$1",[d.id,d.reason]);}else await db.query('UPDATE app.encounter SET priority=$2,version=version+1 WHERE id=$1',[d.id,d.action]);await event(db,user,context,'queue.'+d.action,'encounter',d.id,{reason:d.reason});return {ok:true};});}

export async function walkIn(user:AuthUser,input:unknown,context:AuditContext){if(!user.permissions.includes('appointment:create')||!user.permissions.includes('appointment:checkin'))throw new ApiError(403,'accessDenied');const d=parse(z.object({patientId:z.uuid(),facilityId:z.uuid(),doctorId:z.uuid()}).strict(),input);facilityAccess(user,d.facilityId);try{return await withTenant(user.tenantId,user.id,async db=>{const date=todayKarachi();await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`booking:${user.tenantId}:${d.doctorId}:${date}`]);if(!(await db.query("SELECT 1 FROM app.clinic_doctor cd JOIN app.facility f ON f.id=cd.facility_id JOIN app.user_account u ON u.id=cd.doctor_id WHERE cd.facility_id=$1 AND cd.doctor_id=$2 AND cd.active AND f.active AND u.status='active' AND EXISTS(SELECT 1 FROM app.user_role r WHERE r.user_id=u.id AND r.role_code='doctor') AND EXISTS(SELECT 1 FROM app.user_facility uf WHERE uf.user_id=u.id AND uf.facility_id=f.id)",[d.facilityId,d.doctorId])).rowCount)throw new ApiError(400,'slotUnavailable');if(!(await db.query('SELECT 1 FROM app.patient WHERE id=$1',[d.patientId])).rowCount)throw new ApiError(404,'patientNotFound');const slot=(await db.query("SELECT ((now() AT TIME ZONE 'Asia/Karachi')::time+'1 second'::interval*n)::time AS time FROM generate_series(1,120) n WHERE NOT EXISTS(SELECT 1 FROM app.appointment a WHERE a.doctor_id=$1 AND a.appointment_date=$2 AND a.slot_time=((now() AT TIME ZONE 'Asia/Karachi')::time+'1 second'::interval*n)::time AND a.status IN ('booked','checked_in')) LIMIT 1",[d.doctorId,date])).rows[0].time;const a=(await db.query("INSERT INTO app.appointment(tenant_id,patient_id,facility_id,doctor_id,appointment_date,slot_time,created_by,status,change_reason) VALUES($1,$2,$3,$4,$5,$6,$7,'checked_in','Walk-in arrival') RETURNING id",[user.tenantId,d.patientId,d.facilityId,d.doctorId,date,slot,user.id])).rows[0];const e=(await db.query('INSERT INTO app.encounter(tenant_id,appointment_id,patient_id,facility_id,doctor_id) VALUES($1,$2,$3,$4,$5) RETURNING id',[user.tenantId,a.id,d.patientId,d.facilityId,d.doctorId])).rows[0];await db.query("INSERT INTO app.queue_transition(tenant_id,encounter_id,to_stage,encounter_version,actor_id) VALUES($1,$2,'waiting',1,$3)",[user.tenantId,e.id,user.id]);await event(db,user,context,'appointment.walk_in','encounter',e.id,{appointmentId:a.id});return e;});}catch(error){if((error as {code?:string}).code==='23505')throw new ApiError(409,'activeEncounterExists');throw error;}}
