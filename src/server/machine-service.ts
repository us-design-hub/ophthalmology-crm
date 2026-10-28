import "server-only";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { AuthUser } from "@/lib/access";
import { nextPathwayStage, type PathwayStep, type Stage } from "@/lib/intake";
import { machineOrderInput, machineSchema, type Machine, type MachineOrderInput, type MachineWorkItem } from "@/lib/machines";
import { withTenant } from "./db";
import { audit, type AuditContext } from "./audit";
import { ApiError } from "./http";

function parse<T>(schema: z.ZodType<T>, input: unknown): T { const result = schema.safeParse(input); if (!result.success) throw new ApiError(400, "machineInvalid"); return result.data; }
const OPEN = "('awaiting_approval','ordered')";

/** Machine tests on a visit, with results and report files, for queue cards and the doctor. */
export const machineSummarySql = (encounter: string) => `(SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'version',o.version,'machineId',o.machine_id,'machine',m.name,'needsDilation',m.needs_dilation,'eye',o.eye,'status',o.status,
  'orderedBy',ob.full_name,'orderedAt',o.ordered_at,'approvedBy',ab.full_name,'findings',o.findings,'keyValues',o.key_values,'note',o.note,'resultedBy',rb.full_name,'resultedAt',o.resulted_at,
  'reports',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'filename',r.filename,'mime',r.mime) ORDER BY r.captured_at),'[]') FROM app.machine_report r WHERE r.tenant_id=o.tenant_id AND r.order_id=o.id))
  ORDER BY m.display_order,m.name,o.eye),'[]')
  FROM app.machine_order o JOIN app.machine m ON m.id=o.machine_id AND m.tenant_id=o.tenant_id JOIN app.user_account ob ON ob.id=o.ordered_by AND ob.tenant_id=o.tenant_id
  LEFT JOIN app.user_account ab ON ab.id=o.approved_by AND ab.tenant_id=o.tenant_id LEFT JOIN app.user_account rb ON rb.id=o.resulted_by AND rb.tenant_id=o.tenant_id
  WHERE o.tenant_id=${encounter}.tenant_id AND o.encounter_id=${encounter}.id)`;

export async function listMachines(user: AuthUser): Promise<{ machines: Machine[] }> {
  return withTenant(user.tenantId, user.id, async db => ({ machines: (await db.query(`SELECT m.id,m.name,m.purpose,m.needs_dilation AS "needsDilation",m.needs_doctor_approval AS "needsDoctorApproval",m.active,m.display_order AS "displayOrder",m.revision,
    coalesce((SELECT array_agg(s.facility_id) FROM app.machine_suggestion s WHERE s.tenant_id=m.tenant_id AND s.machine_id=m.id),'{}') AS "suggestedFacilityIds"
    FROM app.machine m ORDER BY m.active DESC,m.display_order,m.name`)).rows as Machine[] }));
}

export async function saveMachine(user: AuthUser, input: unknown, context: AuditContext) {
  if (!user.permissions.includes("settings:write")) throw new ApiError(403, "accessDenied");
  const data = parse(machineSchema, input);
  try {
    return await withTenant(user.tenantId, user.id, async db => {
      let id = data.id;
      if (id) {
        const updated = await db.query("UPDATE app.machine SET name=$2,purpose=$3,needs_dilation=$4,needs_doctor_approval=$5,active=$6,display_order=$7,revision=revision+1 WHERE id=$1 AND revision=$8", [id, data.name, data.purpose, data.needsDilation, data.needsDoctorApproval, data.active, data.displayOrder, data.revision ?? 0]);
        if (!updated.rowCount) throw new ApiError(409, "recordChanged");
        await db.query("DELETE FROM app.machine_suggestion WHERE machine_id=$1", [id]);
      } else id = (await db.query("INSERT INTO app.machine(tenant_id,name,purpose,needs_dilation,needs_doctor_approval,active,display_order) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [user.tenantId, data.name, data.purpose, data.needsDilation, data.needsDoctorApproval, data.active, data.displayOrder])).rows[0].id as string;
      for (const facilityId of new Set(data.suggestedFacilityIds)) await db.query("INSERT INTO app.machine_suggestion(tenant_id,facility_id,machine_id) SELECT $1,f.id,$3 FROM app.facility f WHERE f.id=$2 AND f.type='clinic'", [user.tenantId, facilityId, id]);
      await audit(db, { tenantId: user.tenantId, actorId: user.id, action: data.id ? "machine.updated" : "machine.created", entityType: "machine", entityId: id, metadata: { name: data.name, active: data.active }, context });
      return { id };
    });
  } catch (error) { if ((error as { code?: string }).code === "23505") throw new ApiError(409, "machineNameTaken"); throw error; }
}

/**
 * The visit's own steps after workup: dilation when an open test needs it (or the
 * clinic always dilates), then machine tests while any are open.
 */
async function reshapePathway(db: PoolClient, encounterId: string, fromReview = false) {
  const visit = (await db.query(`SELECT e.pathway_steps AS steps,f.pathway_steps AS clinic,e.dilation_ready_at IS NOT NULL AS dilated,
    EXISTS(SELECT 1 FROM app.machine_order o WHERE o.encounter_id=e.id AND o.status IN ${OPEN}) AS open,
    EXISTS(SELECT 1 FROM app.machine_order o WHERE o.encounter_id=e.id) AS ordered,
    EXISTS(SELECT 1 FROM app.machine_order o JOIN app.machine m ON m.id=o.machine_id WHERE o.encounter_id=e.id AND o.status IN ${OPEN} AND m.needs_dilation) AS "needsDilation"
    FROM app.encounter e JOIN app.facility f ON f.id=e.facility_id AND f.tenant_id=e.tenant_id WHERE e.id=$1`, [encounterId])).rows[0] as { steps: PathwayStep[]; clinic: PathwayStep[]; dilated: boolean; open: boolean; ordered: boolean; needsDilation: boolean };
  const steps: PathwayStep[] = ["workup"];
  if (visit.needsDilation || visit.clinic.includes("dilation") || visit.dilated) steps.push("dilation");
  // At review the senior technician decides: no tests ticked means no machine step, whatever the clinic default.
  // Older visits without machine orders keep their testing step; otherwise only open tests keep it.
  if (visit.open || (!fromReview && !visit.ordered && visit.steps.includes("testing"))) steps.push("testing");
  await db.query("UPDATE app.encounter SET pathway_steps=$2 WHERE id=$1", [encounterId, steps]);
  return { steps, needsDilation: visit.needsDilation && !visit.dilated };
}

/** Move a visit to a stage outside the usual next-step rule (doctor sends a patient for tests, or tests finish). */
async function moveStage(db: PoolClient, user: AuthUser, encounter: { id: string; stage: Stage; version: number }, to: Stage, reason: string, context: AuditContext) {
  await db.query("UPDATE app.encounter SET stage=$2,version=version+1,stage_at=now(),dilation_ready_at=CASE WHEN $2='dilation' THEN now()+make_interval(mins=>coalesce((SELECT (settings->>'dilationMinutes')::int FROM app.tenant WHERE id=app.encounter.tenant_id),20)) ELSE dilation_ready_at END WHERE id=$1", [encounter.id, to]);
  await db.query("INSERT INTO app.queue_transition(tenant_id,encounter_id,from_stage,to_stage,encounter_version,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7)", [user.tenantId, encounter.id, encounter.stage, to, encounter.version + 1, user.id, reason]);
  await audit(db, { tenantId: user.tenantId, actorId: user.id, action: "queue.transitioned", entityType: "encounter", entityId: encounter.id, metadata: { from: encounter.stage, to, reason }, context });
}

/**
 * Order tests for a visit inside the caller's transaction. Senior technicians'
 * orders for approval-only machines wait for a doctor; doctors' orders are approved.
 * A doctor ordering during the consultation sends the patient to dilation or the machines.
 */
export async function orderMachines(db: PoolClient, user: AuthUser, encounterId: string, orders: MachineOrderInput[], context: AuditContext, fromReview = false) {
  const doctor = user.permissions.includes("clinical:write");
  for (const order of orders) {
    const machine = (await db.query("SELECT name,needs_doctor_approval FROM app.machine WHERE id=$1 AND active", [order.machineId])).rows[0];
    if (!machine) throw new ApiError(400, "machineUnavailable");
    const status = machine.needs_doctor_approval && !doctor ? "awaiting_approval" : "ordered";
    const inserted = await db.query("INSERT INTO app.machine_order(tenant_id,encounter_id,machine_id,eye,status,ordered_by,approved_by,approved_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING id", [user.tenantId, encounterId, order.machineId, order.eye, status, user.id, status === "ordered" && machine.needs_doctor_approval ? user.id : null, status === "ordered" && machine.needs_doctor_approval ? new Date() : null]);
    if (inserted.rowCount) await audit(db, { tenantId: user.tenantId, actorId: user.id, action: "machine.ordered", entityType: "machine_order", entityId: inserted.rows[0].id, metadata: { encounterId, machine: machine.name, eye: order.eye, status }, context });
  }
  return reshapePathway(db, encounterId, fromReview);
}

const doctorOrderInput = z.object({ encounterId: z.uuid(), version: z.number().int().positive(), orders: z.array(machineOrderInput).min(1).max(10) }).strict();
/** The doctor sends the patient for tests; they come back to the doctor's list when results are in. */
export async function doctorOrderMachines(user: AuthUser, input: unknown, context: AuditContext) {
  if (!user.permissions.includes("machine:order") || !user.permissions.includes("clinical:write")) throw new ApiError(403, "accessDenied");
  const data = parse(doctorOrderInput, input);
  return withTenant(user.tenantId, user.id, async db => {
    const encounter = (await db.query("SELECT id,stage,version,doctor_id,closed_at FROM app.encounter WHERE id=$1 AND facility_id=ANY($2::uuid[]) FOR UPDATE", [data.encounterId, user.facilityIds])).rows[0];
    if (!encounter) throw new ApiError(404, "encounterNotFound");
    if (encounter.closed_at || encounter.stage !== "consultation") throw new ApiError(409, "consultationRequired");
    if (encounter.doctor_id !== user.id) throw new ApiError(403, "clinicalOwner");
    if (encounter.version !== data.version) throw new ApiError(409, "queueConflict");
    const { needsDilation } = await orderMachines(db, user, data.encounterId, data.orders, context);
    const to: Stage = needsDilation ? "dilation" : "testing";
    await moveStage(db, user, encounter, to, "Doctor ordered machine tests", context);
    return { stage: to };
  });
}

/** When the last open test on a visit is finished, the patient moves on by themselves. */
async function advanceWhenComplete(db: PoolClient, user: AuthUser, encounterId: string, context: AuditContext) {
  const encounter = (await db.query("SELECT id,stage,version,pathway_steps FROM app.encounter WHERE id=$1 FOR UPDATE", [encounterId])).rows[0];
  if (encounter.stage !== "testing") { await reshapePathway(db, encounterId); return; }
  if ((await db.query(`SELECT 1 FROM app.machine_order WHERE encounter_id=$1 AND status IN ${OPEN}`, [encounterId])).rowCount) return;
  const next = nextPathwayStage("testing", encounter.pathway_steps) ?? "consultation";
  await moveStage(db, user, encounter, next, "Machine tests complete", context);
}

async function lockOrder(db: PoolClient, user: AuthUser, id: string, version: number) {
  const order = (await db.query(`SELECT o.*,e.stage AS encounter_stage,e.closed_at,m.name AS machine FROM app.machine_order o JOIN app.encounter e ON e.id=o.encounter_id AND e.tenant_id=o.tenant_id
    JOIN app.machine m ON m.id=o.machine_id AND m.tenant_id=o.tenant_id WHERE o.id=$1 AND e.facility_id=ANY($2::uuid[]) FOR UPDATE OF o`, [id, user.facilityIds])).rows[0];
  if (!order) throw new ApiError(404, "machineOrderNotFound");
  if (order.version !== version) throw new ApiError(409, "machineConflict");
  if (order.closed_at) throw new ApiError(409, "encounterLocked");
  return order as { encounter_id: string; status: string; encounter_stage: Stage; machine: string };
}

const resultInput = z.object({ id: z.uuid(), version: z.number().int().positive(), findings: z.string().trim().min(3).max(2000), keyValues: z.string().trim().max(400).default("") }).strict();
export async function recordMachineResult(user: AuthUser, input: unknown, context: AuditContext) {
  if (!user.permissions.includes("machine:write")) throw new ApiError(403, "accessDenied");
  const data = parse(resultInput, input);
  return withTenant(user.tenantId, user.id, async db => {
    const order = await lockOrder(db, user, data.id, data.version);
    if (order.status !== "ordered") throw new ApiError(409, order.status === "awaiting_approval" ? "machineAwaitingApproval" : "machineAlreadyRecorded");
    // The patient must be at the machines: dilated first when the test needs it.
    if (order.encounter_stage !== "testing") throw new ApiError(409, "machinePatientNotReady");
    await db.query("UPDATE app.machine_order SET status='done',findings=$2,key_values=$3,resulted_by=$4,resulted_at=now(),version=version+1 WHERE id=$1", [data.id, data.findings, data.keyValues, user.id]);
    await audit(db, { tenantId: user.tenantId, actorId: user.id, action: "machine.resulted", entityType: "machine_order", entityId: data.id, metadata: { machine: order.machine, encounterId: order.encounter_id }, context });
    await advanceWhenComplete(db, user, order.encounter_id, context);
    return { version: data.version + 1 };
  });
}

export async function markMachineNotDone(user: AuthUser, input: unknown, context: AuditContext) {
  if (!user.permissions.includes("machine:write")) throw new ApiError(403, "accessDenied");
  const data = parse(z.object({ id: z.uuid(), version: z.number().int().positive(), note: z.string().trim().min(3).max(240) }).strict(), input);
  return withTenant(user.tenantId, user.id, async db => {
    const order = await lockOrder(db, user, data.id, data.version);
    if (order.status !== "ordered" && order.status !== "awaiting_approval") throw new ApiError(409, "machineAlreadyRecorded");
    await db.query("UPDATE app.machine_order SET status='not_done',note=$2,resulted_by=$3,resulted_at=now(),version=version+1 WHERE id=$1", [data.id, data.note, user.id]);
    await audit(db, { tenantId: user.tenantId, actorId: user.id, action: "machine.not_done", entityType: "machine_order", entityId: data.id, metadata: { machine: order.machine, note: data.note }, context });
    await advanceWhenComplete(db, user, order.encounter_id, context);
    return { version: data.version + 1 };
  });
}

/** Doctors approve or decline tests that need their sign-off (dye injection). */
export async function decideMachineOrder(user: AuthUser, input: unknown, context: AuditContext) {
  if (!user.permissions.includes("clinical:write")) throw new ApiError(403, "accessDenied");
  const data = parse(z.object({ id: z.uuid(), version: z.number().int().positive(), decision: z.enum(["approve", "decline"]), note: z.string().trim().max(240).default("") }).strict(), input);
  return withTenant(user.tenantId, user.id, async db => {
    const order = await lockOrder(db, user, data.id, data.version);
    if (order.status !== "awaiting_approval") throw new ApiError(409, "machineAlreadyRecorded");
    if (data.decision === "approve") await db.query("UPDATE app.machine_order SET status='ordered',approved_by=$2,approved_at=now(),version=version+1 WHERE id=$1", [data.id, user.id]);
    else await db.query("UPDATE app.machine_order SET status='declined',note=$2,approved_by=$3,approved_at=now(),resulted_by=$3,resulted_at=now(),version=version+1 WHERE id=$1", [data.id, data.note, user.id]);
    await audit(db, { tenantId: user.tenantId, actorId: user.id, action: `machine.${data.decision === "approve" ? "approved" : "declined"}`, entityType: "machine_order", entityId: data.id, metadata: { machine: order.machine, note: data.note }, context });
    if (data.decision === "decline") await advanceWhenComplete(db, user, order.encounter_id, context);
    return { version: data.version + 1 };
  });
}

const WORK_COLUMNS = `o.id,o.version,o.machine_id AS "machineId",m.name AS machine,m.needs_dilation AS "needsDilation",o.eye,o.status,ob.full_name AS "orderedBy",o.ordered_at AS "orderedAt",ab.full_name AS "approvedBy",
  o.findings,o.key_values AS "keyValues",o.note,rb.full_name AS "resultedBy",o.resulted_at AS "resultedAt",
  (SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'filename',r.filename,'mime',r.mime) ORDER BY r.captured_at),'[]') FROM app.machine_report r WHERE r.tenant_id=o.tenant_id AND r.order_id=o.id) AS reports,
  e.id AS "encounterId",e.patient_id AS "patientId",concat_ws(' ',p.given_name,p.family_name) AS name,p.mrn,p.gender,p.dob::text AS dob,f.name AS clinic,e.stage,e.checked_in_at AS "checkedInAt",e.dilation_ready_at AS "dilationReadyAt",e.visit_type AS "visitType",
  (SELECT coalesce(jsonb_agg(jsonb_build_object('type',pf.type,'value',pf.value)),'[]') FROM app.patient_flag pf WHERE pf.tenant_id=p.tenant_id AND pf.patient_id=p.id AND pf.resolved_at IS NULL) AS flags
  FROM app.machine_order o JOIN app.machine m ON m.id=o.machine_id AND m.tenant_id=o.tenant_id JOIN app.encounter e ON e.id=o.encounter_id AND e.tenant_id=o.tenant_id
  JOIN app.patient p ON p.id=e.patient_id AND p.tenant_id=e.tenant_id JOIN app.facility f ON f.id=e.facility_id AND f.tenant_id=e.tenant_id
  JOIN app.user_account ob ON ob.id=o.ordered_by AND ob.tenant_id=o.tenant_id LEFT JOIN app.user_account ab ON ab.id=o.approved_by AND ab.tenant_id=o.tenant_id LEFT JOIN app.user_account rb ON rb.id=o.resulted_by AND rb.tenant_id=o.tenant_id`;
const TODAY = "date_trunc('day', now() AT TIME ZONE 'Asia/Karachi') AT TIME ZONE 'Asia/Karachi'";

/** Open tests for patients in the hospital, plus today's finished ones. */
export async function machineWorklist(user: AuthUser, context: AuditContext): Promise<{ orders: MachineWorkItem[]; serverNow: string }> {
  return withTenant(user.tenantId, user.id, async db => {
    const orders = (await db.query(`SELECT ${WORK_COLUMNS} WHERE e.facility_id=ANY($1::uuid[]) AND ((o.status IN ${OPEN} AND e.closed_at IS NULL) OR o.resulted_at >= ${TODAY})
      ORDER BY (e.visit_type='emergency') DESC,e.checked_in_at,m.display_order,o.eye`, [user.facilityIds])).rows as MachineWorkItem[];
    await audit(db, { tenantId: user.tenantId, actorId: user.id, action: "machine.worklist_viewed", entityType: "machine_order", metadata: { count: orders.length }, context });
    return { orders, serverNow: new Date().toISOString() };
  });
}

/** Tests waiting for a doctor's sign-off, for the doctor's own clinics. */
export async function pendingApprovals(user: AuthUser): Promise<{ orders: MachineWorkItem[] }> {
  return withTenant(user.tenantId, user.id, async db => ({ orders: (await db.query(`SELECT ${WORK_COLUMNS} WHERE e.facility_id=ANY($1::uuid[]) AND e.closed_at IS NULL AND o.status='awaiting_approval' AND (e.doctor_id IS NULL OR e.doctor_id=$2) ORDER BY o.ordered_at`, [user.facilityIds, user.id])).rows as MachineWorkItem[] }));
}

/** Whether leaving the testing step is governed by machine orders rather than older free-form investigations. */
export async function machineGate(db: PoolClient, encounterId: string) {
  const row = (await db.query(`SELECT count(*) FILTER (WHERE status IN ${OPEN})::int AS open,count(*)::int AS total FROM app.machine_order WHERE encounter_id=$1`, [encounterId])).rows[0];
  return { ordered: row.total > 0, open: row.open as number };
}
