import "server-only";
import { z } from "zod";
import type { AuthUser } from "@/lib/access";
import { opticsReferralInputSchema, type OpticsReferral } from "@/lib/optics";
import { audit, type AuditContext } from "./audit";
import { withTenant } from "./db";
import { ApiError } from "./http";

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApiError(400, "opticsInvalid");
  return result.data;
}

const referralSelect = `SELECT o.id,o.encounter_id AS "encounterId",o.patient_id AS "patientId",o.doctor_event_id AS "doctorEventId",
  concat_ws(' ',p.given_name,p.family_name) AS patient,p.mrn,p.dob::text AS dob,p.gender,p.phone_e164 AS phone,f.name AS clinic,d.full_name AS doctor,
  o.prescribed_at AS "markedAt",o.doctor_suggestion AS "doctorSuggestion",o.referral_note AS "referralNote",
  o.od_sphere::float AS "odSphere",o.od_cylinder::float AS "odCylinder",o.od_axis AS "odAxis",o.od_add::float AS "odAdd",o.od_prism AS "odPrism",
  o.os_sphere::float AS "osSphere",o.os_cylinder::float AS "osCylinder",o.os_axis AS "osAxis",o.os_add::float AS "osAdd",o.os_prism AS "osPrism",o.pd::float AS pd,
  o.lens_type AS "lensType",o.instructions,workup.value AS workup,
  (SELECT coalesce(jsonb_agg(jsonb_build_object('type',pf.type,'value',pf.value)),'[]') FROM app.patient_flag pf WHERE pf.tenant_id=p.tenant_id AND pf.patient_id=p.id AND pf.resolved_at IS NULL) AS flags
  FROM app.spectacle_order o JOIN app.encounter e ON e.id=o.encounter_id AND e.tenant_id=o.tenant_id
  JOIN app.patient p ON p.id=o.patient_id AND p.tenant_id=o.tenant_id JOIN app.facility f ON f.id=e.facility_id AND f.tenant_id=e.tenant_id
  JOIN app.user_account d ON d.id=o.prescribed_by AND d.tenant_id=o.tenant_id
  LEFT JOIN LATERAL (
    SELECT jsonb_build_object(
      'source',CASE WHEN r.decision='approved' THEN 'senior' ELSE 'technician' END,
      'savedAt',w.saved_at,'reviewedAt',r.reviewed_at,
      'pd',CASE WHEN r.decision='approved' THEN nullif(r.assessment->>'pd','')::numeric
                WHEN od.refraction->>'pd' IS NOT NULL AND os.refraction->>'pd' IS NOT NULL THEN (od.refraction->>'pd')::numeric+(os.refraction->>'pd')::numeric ELSE NULL END,
      'OD',(CASE WHEN r.decision='approved' THEN coalesce(r.assessment->'OD','{}'::jsonb) ELSE coalesce(od.refraction,'{}'::jsonb) END) || jsonb_build_object('corrected',od.corrected,'near',od.technician->>'near','glasses',od.technician->>'glasses'),
      'OS',(CASE WHEN r.decision='approved' THEN coalesce(r.assessment->'OS','{}'::jsonb) ELSE coalesce(os.refraction,'{}'::jsonb) END) || jsonb_build_object('corrected',os.corrected,'near',os.technician->>'near','glasses',os.technician->>'glasses')
    ) AS value
    FROM app.workup_revision w
    LEFT JOIN app.workup_eye od ON od.tenant_id=w.tenant_id AND od.revision_id=w.id AND od.eye='OD'
    LEFT JOIN app.workup_eye os ON os.tenant_id=w.tenant_id AND os.revision_id=w.id AND os.eye='OS'
    LEFT JOIN app.workup_review r ON r.tenant_id=w.tenant_id AND r.revision_id=w.id
    WHERE w.tenant_id=e.tenant_id AND w.encounter_id=e.id ORDER BY w.version DESC LIMIT 1
  ) workup ON true`;

export async function encounterReferrals(user: AuthUser, encounterId: string | null, context: AuditContext) {
  const id = parse(z.uuid(), encounterId);
  return withTenant(user.tenantId, user.id, async db => {
    const referrals = (await db.query(`${referralSelect} WHERE o.encounter_id=$1 AND o.status<>'cancelled' AND e.facility_id=ANY($2::uuid[]) ORDER BY o.prescribed_at DESC`, [id, user.facilityIds])).rows as OpticsReferral[];
    await audit(db, { tenantId: user.tenantId, actorId: user.id, action: "optics.encounter_viewed", entityType: "spectacle_order", metadata: { encounterId: id, count: referrals.length }, context });
    return { referrals };
  });
}

export async function worklist(user: AuthUser, context: AuditContext) {
  return withTenant(user.tenantId, user.id, async db => {
    const referrals = (await db.query(`${referralSelect} WHERE e.facility_id=ANY($1::uuid[]) AND o.status<>'cancelled' ORDER BY o.prescribed_at DESC LIMIT 250`, [user.facilityIds])).rows as OpticsReferral[];
    await audit(db, { tenantId: user.tenantId, actorId: user.id, action: "optics.worklist_viewed", entityType: "spectacle_order", metadata: { count: referrals.length }, context });
    return { referrals, serverNow: new Date().toISOString() };
  });
}

export async function markRequired(user: AuthUser, input: unknown, context: AuditContext) {
  if (!user.permissions.includes("optics:order") || !user.permissions.includes("clinical:write")) throw new ApiError(403, "accessDenied");
  const data = parse(opticsReferralInputSchema, input);
  return withTenant(user.tenantId, user.id, async db => {
    const encounter = (await db.query(`SELECT e.id,e.patient_id,e.version,e.stage,e.closed_at,e.doctor_id,d.id AS event_id,d.status AS event_status
      FROM app.encounter e LEFT JOIN app.doctor_event d ON d.encounter_id=e.id AND d.tenant_id=e.tenant_id
      WHERE e.id=$1 AND e.facility_id=ANY($2::uuid[]) FOR UPDATE OF e`, [data.encounterId, user.facilityIds])).rows[0];
    if (!encounter) throw new ApiError(404, "encounterNotFound");
    if (encounter.version !== data.encounterVersion) throw new ApiError(409, "encounterConflict");
    if (encounter.closed_at || encounter.stage !== "consultation" || encounter.doctor_id !== user.id) throw new ApiError(409, "encounterLocked");
    if (!encounter.event_id || encounter.event_status !== "signed") throw new ApiError(409, "opticsSignedEventRequired");
    if ((await db.query("SELECT 1 FROM app.spectacle_order WHERE doctor_event_id=$1 AND status<>'cancelled'", [encounter.event_id])).rowCount) throw new ApiError(409, "opticsAlreadyIssued");
    const suggestion = data.doctorSuggestion;
    const values = [user.tenantId,data.encounterId,encounter.patient_id,encounter.event_id,user.id,suggestion,suggestion?data.odSphere:null,suggestion?data.odCylinder:null,suggestion?data.odAxis:null,suggestion?data.odAdd:null,suggestion?data.odPrism:"",suggestion?data.osSphere:null,suggestion?data.osCylinder:null,suggestion?data.osAxis:null,suggestion?data.osAdd:null,suggestion?data.osPrism:"",suggestion?data.pd:null,suggestion?data.lensType:null,suggestion?data.instructions:"",data.referralNote];
    const inserted = await db.query(`INSERT INTO app.spectacle_order(tenant_id,encounter_id,patient_id,doctor_event_id,prescribed_by,doctor_suggestion,od_sphere,od_cylinder,od_axis,od_add,od_prism,os_sphere,os_cylinder,os_axis,os_add,os_prism,pd,lens_type,instructions,referral_note)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id`, values);
    const id = inserted.rows[0].id as string;
    await audit(db, { tenantId: user.tenantId, actorId: user.id, action: "optics.required", entityType: "spectacle_order", entityId: id, metadata: { encounterId: data.encounterId, patientId: encounter.patient_id, doctorSuggestion: suggestion }, context });
    return { id };
  });
}
