import "server-only";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { AuthUser } from "@/lib/access";
import { spectacleInputSchema, type OpticsStatus, type SpectacleOrder } from "@/lib/optics";
import { audit, type AuditContext } from "./audit";
import { withTenant } from "./db";
import { ApiError } from "./http";

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApiError(400, "opticsInvalid");
  return result.data;
}

const orderSelect = `SELECT o.id,o.encounter_id AS "encounterId",o.patient_id AS "patientId",o.doctor_event_id AS "doctorEventId",o.version,
  concat_ws(' ',p.given_name,p.family_name) AS patient,p.mrn,p.dob::text AS dob,p.gender,p.phone_e164 AS phone,f.name AS clinic,d.full_name AS doctor,
  o.prescribed_at AS "prescribedAt",o.status,o.od_sphere::float AS "odSphere",o.od_cylinder::float AS "odCylinder",o.od_axis AS "odAxis",o.od_add::float AS "odAdd",o.od_prism AS "odPrism",
  o.os_sphere::float AS "osSphere",o.os_cylinder::float AS "osCylinder",o.os_axis AS "osAxis",o.os_add::float AS "osAdd",o.os_prism AS "osPrism",o.pd::float AS pd,
  o.lens_type AS "lensType",o.instructions,o.dispensing_note AS "dispensingNote",s.full_name AS "statusBy",o.status_at AS "statusAt",previous.value AS previous,
  (SELECT coalesce(jsonb_agg(jsonb_build_object('type',pf.type,'value',pf.value)),'[]') FROM app.patient_flag pf WHERE pf.tenant_id=p.tenant_id AND pf.patient_id=p.id AND pf.resolved_at IS NULL) AS flags
  FROM app.spectacle_order o JOIN app.encounter e ON e.id=o.encounter_id AND e.tenant_id=o.tenant_id
  JOIN app.patient p ON p.id=o.patient_id AND p.tenant_id=o.tenant_id JOIN app.facility f ON f.id=e.facility_id AND f.tenant_id=e.tenant_id
  JOIN app.user_account d ON d.id=o.prescribed_by AND d.tenant_id=o.tenant_id LEFT JOIN app.user_account s ON s.id=o.status_by AND s.tenant_id=o.tenant_id
  LEFT JOIN LATERAL (
    SELECT jsonb_build_object(
      'id',prior.id,'collectedAt',prior.status_at,'dispensingNote',prior.dispensing_note,
      'odSphere',prior.od_sphere::float,'odCylinder',prior.od_cylinder::float,'odAxis',prior.od_axis,'odAdd',prior.od_add::float,'odPrism',prior.od_prism,
      'osSphere',prior.os_sphere::float,'osCylinder',prior.os_cylinder::float,'osAxis',prior.os_axis,'osAdd',prior.os_add::float,'osPrism',prior.os_prism,
      'pd',prior.pd::float,'lensType',prior.lens_type,'instructions',prior.instructions
    ) AS value
    FROM app.spectacle_order prior
    WHERE prior.tenant_id=o.tenant_id AND prior.patient_id=o.patient_id AND prior.status='collected' AND prior.id<>o.id AND prior.status_at<o.prescribed_at
    ORDER BY prior.status_at DESC LIMIT 1
  ) previous ON true`;

export async function encounterOrders(user: AuthUser, encounterId: string | null, context: AuditContext) {
  const id = parse(z.uuid(), encounterId);
  return withTenant(user.tenantId, user.id, async db => {
    const orders = (await db.query(`${orderSelect} WHERE o.encounter_id=$1 AND e.facility_id=ANY($2::uuid[]) ORDER BY o.prescribed_at DESC`, [id, user.facilityIds])).rows as SpectacleOrder[];
    await audit(db, { tenantId: user.tenantId, actorId: user.id, action: "optics.encounter_viewed", entityType: "spectacle_order", metadata: { encounterId: id, count: orders.length }, context });
    return { orders };
  });
}

export async function worklist(user: AuthUser, context: AuditContext) {
  return withTenant(user.tenantId, user.id, async db => {
    const orders = (await db.query(`${orderSelect} WHERE e.facility_id=ANY($1::uuid[]) AND (o.status IN ('issued','in_progress','ready') OR (o.status='collected' AND o.status_at >= date_trunc('day',now()))) ORDER BY CASE o.status WHEN 'issued' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'ready' THEN 3 ELSE 4 END,o.prescribed_at`, [user.facilityIds])).rows as SpectacleOrder[];
    await audit(db, { tenantId: user.tenantId, actorId: user.id, action: "optics.worklist_viewed", entityType: "spectacle_order", metadata: { count: orders.length }, context });
    return { orders, serverNow: new Date().toISOString() };
  });
}

export async function issue(user: AuthUser, input: unknown, context: AuditContext) {
  if (!user.permissions.includes("optics:order") || !user.permissions.includes("clinical:write")) throw new ApiError(403, "accessDenied");
  const data = parse(spectacleInputSchema, input);
  return withTenant(user.tenantId, user.id, async db => {
    const encounter = (await db.query(`SELECT e.id,e.patient_id,e.version,e.stage,e.closed_at,e.doctor_id,d.id AS event_id,d.status AS event_status
      FROM app.encounter e LEFT JOIN app.doctor_event d ON d.encounter_id=e.id AND d.tenant_id=e.tenant_id
      WHERE e.id=$1 AND e.facility_id=ANY($2::uuid[]) FOR UPDATE OF e`, [data.encounterId, user.facilityIds])).rows[0];
    if (!encounter) throw new ApiError(404, "encounterNotFound");
    if (encounter.version !== data.encounterVersion) throw new ApiError(409, "encounterConflict");
    if (encounter.closed_at || encounter.stage !== "consultation" || encounter.doctor_id !== user.id) throw new ApiError(409, "encounterLocked");
    if (!encounter.event_id || encounter.event_status !== "signed") throw new ApiError(409, "opticsSignedEventRequired");
    const existing = await db.query("SELECT id FROM app.spectacle_order WHERE doctor_event_id=$1 AND status<>'cancelled'", [encounter.event_id]);
    if (existing.rowCount) throw new ApiError(409, "opticsAlreadyIssued");
    const values = [user.tenantId, data.encounterId, encounter.patient_id, encounter.event_id, user.id, data.odSphere, data.odCylinder, data.odAxis, data.odAdd, data.odPrism, data.osSphere, data.osCylinder, data.osAxis, data.osAdd, data.osPrism, data.pd, data.lensType, data.instructions];
    const inserted = await db.query(`INSERT INTO app.spectacle_order(tenant_id,encounter_id,patient_id,doctor_event_id,prescribed_by,od_sphere,od_cylinder,od_axis,od_add,od_prism,os_sphere,os_cylinder,os_axis,os_add,os_prism,pd,lens_type,instructions)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`, values);
    const id = inserted.rows[0].id as string;
    await audit(db, { tenantId: user.tenantId, actorId: user.id, action: "optics.issued", entityType: "spectacle_order", entityId: id, metadata: { encounterId: data.encounterId, patientId: encounter.patient_id, lensType: data.lensType }, context });
    return { id };
  });
}

const transitions: Record<OpticsStatus, readonly OpticsStatus[]> = {
  issued: ["in_progress", "cancelled"], in_progress: ["ready", "cancelled"], ready: ["in_progress", "collected", "cancelled"], collected: [], cancelled: [],
};
const statusInput = z.object({ id: z.uuid(), version: z.number().int().positive(), status: z.enum(["in_progress", "ready", "collected", "cancelled"]), note: z.string().trim().max(1000) }).strict();

async function lockOrder(db: PoolClient, user: AuthUser, id: string) {
  return (await db.query(`SELECT o.id,o.version,o.status,o.encounter_id,o.patient_id FROM app.spectacle_order o JOIN app.encounter e ON e.id=o.encounter_id AND e.tenant_id=o.tenant_id WHERE o.id=$1 AND e.facility_id=ANY($2::uuid[]) FOR UPDATE OF o`, [id, user.facilityIds])).rows[0];
}
export async function updateStatus(user: AuthUser, input: unknown, context: AuditContext) {
  if (!user.permissions.includes("optics:write")) throw new ApiError(403, "accessDenied");
  const data = parse(statusInput, input);
  if (data.status === "cancelled" && data.note.length < 8) throw new ApiError(400, "reasonTooShort");
  return withTenant(user.tenantId, user.id, async db => {
    const order = await lockOrder(db, user, data.id);
    if (!order) throw new ApiError(404, "opticsOrderNotFound");
    if (order.version !== data.version) throw new ApiError(409, "opticsConflict");
    if (!transitions[order.status as OpticsStatus].includes(data.status)) throw new ApiError(409, "opticsInvalidTransition");
    await db.query("UPDATE app.spectacle_order SET status=$2,dispensing_note=$3,status_by=$4,status_at=now(),version=version+1 WHERE id=$1", [data.id, data.status, data.note, user.id]);
    await audit(db, { tenantId: user.tenantId, actorId: user.id, action: `optics.${data.status}`, entityType: "spectacle_order", entityId: data.id, metadata: { encounterId: order.encounter_id, patientId: order.patient_id, note: data.note }, context });
    return { version: data.version + 1, status: data.status };
  });
}
