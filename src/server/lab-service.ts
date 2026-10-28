import "server-only";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { AuthUser } from "@/lib/access";
import { bpResultSchema, isAbnormal, LAB_TESTS, sugarResultSchema, type LabReason, type LabTest, type LabWorkItem } from "@/lib/lab";
import { ageFromDob } from "@/lib/patients";
import { withTenant } from "./db";
import { audit, type AuditContext } from "./audit";
import { ApiError } from "./http";

function parse<T>(schema: z.ZodType<T>, input: unknown): T { const result = schema.safeParse(input); if (!result.success) throw new ApiError(400, "labInvalid"); return result.data; }

/** Every lab order on a visit, as the queue card and the doctor see it. */
export const labSummarySql = (encounter: string) => `(SELECT coalesce(jsonb_agg(jsonb_build_object('test',l.test,'status',l.status,'abnormal',l.abnormal,'result',l.result,'note',l.note) ORDER BY l.test),'[]') FROM app.lab_order l WHERE l.tenant_id=${encounter}.tenant_id AND l.encounter_id=${encounter}.id)`;

/**
 * Raise the automatic BP and sugar orders for a new visit. Sugar: diabetes or
 * an open surgery case. BP: hypertension, age 40 or over, Glaucoma clinic, or
 * an open surgery case. Runs inside the check-in transaction.
 */
export async function orderAutomaticLabs(db: PoolClient, tenantId: string, encounterId: string) {
  const visit = (await db.query(`SELECT p.dob::text AS dob, p.medical_conditions AS conditions, lower(f.specialty) AS specialty,
    EXISTS(SELECT 1 FROM app.surgery_case c JOIN app.encounter prior ON prior.id=c.encounter_id AND prior.tenant_id=c.tenant_id
      WHERE prior.patient_id=e.patient_id AND c.tenant_id=e.tenant_id AND c.stage NOT IN ('operated','discharged','followup','cancelled')) AS "preOp"
    FROM app.encounter e JOIN app.patient p ON p.id=e.patient_id AND p.tenant_id=e.tenant_id JOIN app.facility f ON f.id=e.facility_id AND f.tenant_id=e.tenant_id
    WHERE e.id=$1`, [encounterId])).rows[0] as { dob: string; conditions: string[]; specialty: string | null; preOp: boolean } | undefined;
  if (!visit) return;
  const reasons: Record<LabTest, LabReason[]> = { bp: [], sugar: [] };
  if (visit.conditions.includes("diabetes")) reasons.sugar.push("diabetes");
  if (visit.conditions.includes("hypertension")) reasons.bp.push("hypertension");
  if (ageFromDob(visit.dob) >= 40) reasons.bp.push("age_40");
  if (visit.specialty === "glaucoma") reasons.bp.push("glaucoma");
  if (visit.preOp) { reasons.bp.push("pre_op"); reasons.sugar.push("pre_op"); }
  for (const test of LAB_TESTS) if (reasons[test].length) await db.query("INSERT INTO app.lab_order(tenant_id,encounter_id,test,reasons) VALUES($1,$2,$3,$4) ON CONFLICT (tenant_id,encounter_id,test) DO NOTHING", [tenantId, encounterId, test, reasons[test]]);
}

/** Open orders for patients still in the hospital, plus today's finished ones for reference. */
export async function labWorklist(user: AuthUser, context: AuditContext): Promise<{ orders: LabWorkItem[]; serverNow: string }> {
  return withTenant(user.tenantId, user.id, async db => {
    const orders = (await db.query(`SELECT l.id,l.version,l.test,l.reasons,l.status,l.result,l.abnormal,l.note,l.ordered_at AS "orderedAt",l.resulted_at AS "resultedAt",r.full_name AS "resultedBy",
      e.id AS "encounterId",e.patient_id AS "patientId",concat_ws(' ',p.given_name,p.family_name) AS name,p.mrn,p.gender,p.dob::text AS dob,f.name AS clinic,e.stage,e.checked_in_at AS "checkedInAt",e.visit_type AS "visitType",
      (SELECT coalesce(jsonb_agg(jsonb_build_object('type',pf.type,'value',pf.value)),'[]') FROM app.patient_flag pf WHERE pf.tenant_id=p.tenant_id AND pf.patient_id=p.id AND pf.resolved_at IS NULL) AS flags
      FROM app.lab_order l JOIN app.encounter e ON e.id=l.encounter_id AND e.tenant_id=l.tenant_id JOIN app.patient p ON p.id=e.patient_id AND p.tenant_id=e.tenant_id
      JOIN app.facility f ON f.id=e.facility_id AND f.tenant_id=e.tenant_id LEFT JOIN app.user_account r ON r.id=l.resulted_by AND r.tenant_id=l.tenant_id
      WHERE e.facility_id=ANY($1::uuid[]) AND ((l.status='pending' AND e.closed_at IS NULL) OR l.resulted_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Karachi') AT TIME ZONE 'Asia/Karachi')
      ORDER BY (l.status='pending') DESC,(e.visit_type='emergency') DESC,e.checked_in_at,l.test`, [user.facilityIds])).rows as LabWorkItem[];
    await audit(db, { tenantId: user.tenantId, actorId: user.id, action: "lab.worklist_viewed", entityType: "lab_order", metadata: { count: orders.length }, context });
    return { orders, serverNow: new Date().toISOString() };
  });
}

async function lockOrder(db: PoolClient, user: AuthUser, id: string, version: number) {
  const order = (await db.query("SELECT l.*,e.closed_at FROM app.lab_order l JOIN app.encounter e ON e.id=l.encounter_id AND e.tenant_id=l.tenant_id WHERE l.id=$1 AND e.facility_id=ANY($2::uuid[]) FOR UPDATE OF l", [id, user.facilityIds])).rows[0];
  if (!order) throw new ApiError(404, "labOrderNotFound");
  if (order.version !== version) throw new ApiError(409, "labConflict");
  if (order.status !== "pending") throw new ApiError(409, "labAlreadyRecorded");
  return order as { test: LabTest; encounter_id: string };
}

const resultInput = z.object({ id: z.uuid(), version: z.number().int().positive(), result: z.unknown(), note: z.string().trim().max(240).default("") }).strict();
export async function recordLabResult(user: AuthUser, input: unknown, context: AuditContext) {
  if (!user.permissions.includes("lab:write")) throw new ApiError(403, "accessDenied");
  const data = parse(resultInput, input);
  return withTenant(user.tenantId, user.id, async db => {
    const order = await lockOrder(db, user, data.id, data.version);
    const result = parse<object>(order.test === "bp" ? bpResultSchema : sugarResultSchema, data.result) as Parameters<typeof isAbnormal>[1];
    const abnormal = isAbnormal(order.test, result);
    await db.query("UPDATE app.lab_order SET status='done',result=$2,abnormal=$3,note=$4,resulted_by=$5,resulted_at=now(),version=version+1 WHERE id=$1", [data.id, result, abnormal, data.note, user.id]);
    await audit(db, { tenantId: user.tenantId, actorId: user.id, action: "lab.resulted", entityType: "lab_order", entityId: data.id, metadata: { test: order.test, abnormal, encounterId: order.encounter_id }, context });
    return { version: data.version + 1, abnormal };
  });
}

/** Patient refused, left, or the test could not be done; the reason is kept for the doctor. */
export async function markLabNotDone(user: AuthUser, input: unknown, context: AuditContext) {
  if (!user.permissions.includes("lab:write")) throw new ApiError(403, "accessDenied");
  const data = parse(z.object({ id: z.uuid(), version: z.number().int().positive(), note: z.string().trim().min(3).max(240) }).strict(), input);
  return withTenant(user.tenantId, user.id, async db => {
    const order = await lockOrder(db, user, data.id, data.version);
    await db.query("UPDATE app.lab_order SET status='not_done',note=$2,resulted_by=$3,resulted_at=now(),version=version+1 WHERE id=$1", [data.id, data.note, user.id]);
    await audit(db, { tenantId: user.tenantId, actorId: user.id, action: "lab.not_done", entityType: "lab_order", entityId: data.id, metadata: { test: order.test, note: data.note }, context });
    return { version: data.version + 1 };
  });
}

/** Clinical staff add a test the rules did not raise; asking again for an existing test is a no-op. */
export async function orderLab(user: AuthUser, input: unknown, context: AuditContext) {
  if (!user.permissions.includes("lab:order")) throw new ApiError(403, "accessDenied");
  const data = parse(z.object({ encounterId: z.uuid(), test: z.enum(LAB_TESTS) }).strict(), input);
  return withTenant(user.tenantId, user.id, async db => {
    const encounter = (await db.query("SELECT closed_at FROM app.encounter WHERE id=$1 AND facility_id=ANY($2::uuid[])", [data.encounterId, user.facilityIds])).rows[0];
    if (!encounter) throw new ApiError(404, "encounterNotFound");
    if (encounter.closed_at) throw new ApiError(409, "encounterLocked");
    const inserted = await db.query("INSERT INTO app.lab_order(tenant_id,encounter_id,test,reasons,ordered_by) VALUES($1,$2,$3,ARRAY['manual'],$4) ON CONFLICT (tenant_id,encounter_id,test) DO NOTHING RETURNING id", [user.tenantId, data.encounterId, data.test, user.id]);
    if (inserted.rowCount) await audit(db, { tenantId: user.tenantId, actorId: user.id, action: "lab.ordered", entityType: "lab_order", entityId: inserted.rows[0].id, metadata: { test: data.test, encounterId: data.encounterId }, context });
    return { ordered: !!inserted.rowCount };
  });
}
