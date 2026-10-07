import "server-only";
import { z } from "zod";
import type { PoolClient } from "pg";
import type { AuthUser, Permission } from "@/lib/access";
import { readBatch, withTenant } from "./db";
import { audit, type AuditContext } from "./audit";
import { ApiError } from "./http";
import { parseInput, requireAction } from "./administration-service";
import { todayKarachi } from "@/lib/patients";
import { cataractAction, isCataractAction } from "./cataract-service";
import { surgeryReadiness } from "@/lib/surgery-worklist";
import { hasActiveSurgicalConsent } from "./surgery-consent-service";

const uuid = z.uuid();
const text = (max = 500) => z.string().trim().max(max);
const reason = text().min(8);

async function lock(db: PoolClient, user: AuthUser) {
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`operations:${user.tenantId}`]);
}
async function facility(db: PoolClient, user: AuthUser, id: string) {
  if (!user.facilityIds.includes(id) || !(await db.query("SELECT 1 FROM app.facility WHERE id=$1 AND active", [id])).rowCount) throw new ApiError(403, "accessDenied");
}
async function log(db: PoolClient, user: AuthUser, context: AuditContext, action: string, id?: string) {
  await audit(db, { tenantId: user.tenantId, actorId: user.id, action, entityType: "operations", entityId: id, context });
}

export async function operationsData(user: AuthUser, resource: string, context: AuditContext) {
  const permissions: Record<string, Permission> = { surgery: "surgery:read", management: "management:read" };
  if (!permissions[resource]) throw new ApiError(404, "notFound");
  requireAction(user, permissions[resource]);
  return withTenant(user.tenantId, user.id, async db => {
    let result: Record<string, unknown>;
    if (resource === "surgery") {
      const [facilities, encounters, procedures, surgeons, caseRows] = await readBatch(db, [
        { text: "SELECT id,name,type FROM app.facility WHERE active AND id=ANY($1::uuid[]) ORDER BY name", values: [user.facilityIds] },
        { text: `SELECT e.id,p.mrn,p.given_name||' '||p.family_name AS patient,e.facility_id AS "facilityId" FROM app.encounter e JOIN app.patient p ON p.id=e.patient_id JOIN app.doctor_event d ON d.encounter_id=e.id AND d.status='signed' WHERE e.facility_id=ANY($1::uuid[]) ORDER BY e.checked_in_at DESC LIMIT 200`, values: [user.facilityIds] },
        { text: "SELECT code,name,specialty,version,definition FROM app.procedure_catalogue WHERE active AND status='published' ORDER BY specialty,name" },
        { text: `SELECT DISTINCT u.id,u.full_name AS name
          FROM app.user_account u
          JOIN app.user_role r ON r.tenant_id=u.tenant_id AND r.user_id=u.id AND r.role_code='doctor'
          JOIN app.user_facility uf ON uf.tenant_id=u.tenant_id AND uf.user_id=u.id
          JOIN app.facility f ON f.tenant_id=uf.tenant_id AND f.id=uf.facility_id AND f.type='theatre' AND f.active
          WHERE u.status='active' AND uf.facility_id=ANY($1::uuid[]) ORDER BY name`, values: [user.facilityIds] },
        { text: `SELECT c.id,c.version,c.eye,c.procedure,pc.code AS "procedureCode",CASE WHEN c.stage='estimate' THEN 'planning' ELSE c.stage END AS stage,c.scheduled_at AS scheduled,c.facility_id AS "facilityId",f.name AS theatre,c.surgeon_id AS "surgeonId",s.full_name AS surgeon,c.created_at AS "createdAt",p.mrn,p.given_name||' '||p.family_name AS patient,
          (SELECT coalesce(jsonb_agg(jsonb_build_object('stage',CASE WHEN t.stage='estimate' THEN 'planning' ELSE t.stage END,'eye',t.eye,'notes',t.notes,'at',t.at,'actor',u.full_name) ORDER BY t.at),'[]') FROM app.surgery_transition t JOIN app.user_account u ON u.id=t.actor_id WHERE t.case_id=c.id) AS history,
          (SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'filename',d.filename,'eye',d.eye,'witness',d.witness,'at',d.at)),'[]') FROM app.consent_document d WHERE d.case_id=c.id) AS documents,
          (SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id',v.id,'version',v.version,'eye',v.eye,'procedure',v.procedure_snapshot,'statementVersion',v.statement_version,
            'signatoryType',v.signatory_type,'signatoryName',v.signatory_name,'relationship',v.relationship,
            'witnessName',v.witness_name,'witnessRole',v.witness_role,'source',v.source,'recordHash',v.record_hash,'createdAt',v.created_at,
            'createdBy',creator.full_name,
            'status',(SELECT ce.action FROM app.surgery_consent_event ce WHERE ce.consent_version_id=v.id ORDER BY ce.sequence DESC LIMIT 1),
            'confirmedBy',(SELECT ua.full_name FROM app.surgery_consent_event ce JOIN app.user_account ua ON ua.tenant_id=ce.tenant_id AND ua.id=ce.actor_id WHERE ce.consent_version_id=v.id AND ce.action='confirmed'),
            'confirmedAt',(SELECT ce.at FROM app.surgery_consent_event ce WHERE ce.consent_version_id=v.id AND ce.action='confirmed'),
            'withdrawnBy',(SELECT ua.full_name FROM app.surgery_consent_event ce JOIN app.user_account ua ON ua.tenant_id=ce.tenant_id AND ua.id=ce.actor_id WHERE ce.consent_version_id=v.id AND ce.action='withdrawn'),
            'withdrawnAt',(SELECT ce.at FROM app.surgery_consent_event ce WHERE ce.consent_version_id=v.id AND ce.action='withdrawn'),
            'withdrawalReason',(SELECT ce.reason FROM app.surgery_consent_event ce WHERE ce.consent_version_id=v.id AND ce.action='withdrawn'),
            'document',(SELECT jsonb_build_object('id',d.id,'filename',d.filename) FROM app.consent_document d WHERE d.consent_version_id=v.id)
          ) ORDER BY v.version DESC),'[]') FROM app.surgery_consent_version v JOIN app.user_account creator ON creator.tenant_id=v.tenant_id AND creator.id=v.created_by WHERE v.case_id=c.id) AS consents,
          (SELECT jsonb_build_object('version',a.version,'axialLength',a.axial_length,'keratometryK1',a.keratometry_k1,'keratometryK2',a.keratometry_k2,'targetRefraction',a.target_refraction,'iolModel',a.iol_model,'iolPower',a.iol_power,'anaesthesia',a.anaesthesia,'biometryVerified',a.biometry_verified,'medicalClearance',a.medical_clearance,'pupilDilation',a.pupil_dilation,'notes',a.notes) FROM app.surgery_preop_assessment a WHERE a.case_id=c.id) AS preop,
          (SELECT jsonb_build_object('version',n.version,'procedurePerformed',n.procedure_performed,'anaesthesia',n.anaesthesia,'incision',n.incision,'capsulorhexis',n.capsulorhexis,'phacoTechnique',n.phaco_technique,'iolModel',n.iol_model,'iolPower',n.iol_power,'complications',n.complications,'postoperativeInstructions',n.postoperative_instructions) FROM app.surgery_operation_note n WHERE n.case_id=c.id) AS "operationNote",
          (SELECT coalesce(jsonb_agg(jsonb_build_object('version',f.version,'visitType',f.visit_type,'uncorrectedAcuity',f.uncorrected_acuity,'correctedAcuity',f.corrected_acuity,'iop',f.iop,'wound',f.wound,'cornea',f.cornea,'anteriorChamber',f.anterior_chamber,'iolPosition',f.iol_position,'medications',f.medications,'plan',f.plan,'nextReview',f.next_review) ORDER BY f.created_at),'[]') FROM app.surgery_followup f WHERE f.case_id=c.id) AS followups
         FROM app.surgery_case c
         JOIN app.encounter e ON e.id=c.encounter_id
         JOIN app.patient p ON p.id=e.patient_id
         JOIN app.facility f ON f.tenant_id=c.tenant_id AND f.id=c.facility_id
         JOIN app.user_account s ON s.tenant_id=c.tenant_id AND s.id=c.surgeon_id
         LEFT JOIN app.procedure_catalogue pc ON pc.tenant_id=c.tenant_id AND pc.id=c.procedure_catalogue_id
         WHERE c.facility_id=ANY($1::uuid[]) ORDER BY c.created_at DESC LIMIT 200`, values: [user.facilityIds] },
      ]);
      const cases = caseRows.map(surgeryCase => ({ ...surgeryCase, readiness: surgeryReadiness(surgeryCase as Parameters<typeof surgeryReadiness>[0]) }));
      result = { facilities, encounters, procedures, surgeons, cases };
    } else {
      result = await dashboard(db, user);
    }
    await log(db, user, context, `operations.${resource}_read`);
    return result;
  });
}

export const SURGERY_STAGES = ["estimate", "consent", "preop", "scheduled", "operated", "discharged", "followup"] as const;
export async function surgeryAction(user: AuthUser, input: unknown, context: AuditContext) {
  requireAction(user, "surgery:write");
  if (isCataractAction(input)) return cataractAction(user, input, context);
  const data = parseInput(z.discriminatedUnion("action", [
    z.object({ action: z.literal("create"), encounterId: uuid, facilityId: uuid, surgeonId: uuid, eye: z.enum(["OD", "OS"]), procedureCode: text(80).optional(), procedure: text(200).optional() }).strict(),
    z.object({ action: z.literal("advance"), id: uuid, version: z.number().int().positive(), stage: z.enum([...SURGERY_STAGES, "cancelled"]), eye: z.enum(["OD", "OS"]), notes: reason, scheduled: z.iso.datetime({ offset: true }).optional() }).strict(),
  ]), input);
  return withTenant(user.tenantId, user.id, async db => {
    await lock(db, user);
    if (data.action === "create") {
      await facility(db, user, data.facilityId);
      if (!(await db.query("SELECT 1 FROM app.facility WHERE id=$1 AND type='theatre'", [data.facilityId])).rowCount) throw new ApiError(400, "theatreRequired");
      if (!(await db.query(`SELECT 1 FROM app.user_account u JOIN app.user_role r ON r.tenant_id=u.tenant_id AND r.user_id=u.id JOIN app.user_facility uf ON uf.tenant_id=u.tenant_id AND uf.user_id=u.id WHERE u.id=$1 AND u.status='active' AND r.role_code='doctor' AND uf.facility_id=$2`, [data.surgeonId, data.facilityId])).rowCount) throw new ApiError(400, "surgeonUnavailable");
      if (!(await db.query("SELECT 1 FROM app.encounter e JOIN app.doctor_event v ON v.encounter_id=e.id WHERE e.id=$1 AND e.facility_id=ANY($2::uuid[]) AND v.status='signed'", [data.encounterId, user.facilityIds])).rowCount) throw new ApiError(400, "signedEventRequired");
      if (!data.procedureCode && !data.procedure) throw new ApiError(400, "validationFailed");
      const catalogue = data.procedureCode ? (await db.query("SELECT id,name,definition FROM app.procedure_catalogue WHERE code=$1 AND active AND status='published'", [data.procedureCode])).rows[0] : null;
      if (data.procedureCode && !catalogue) throw new ApiError(400, "procedureNotFound");
      if (catalogue && !(catalogue.definition?.allowedEyes as unknown[]|undefined)?.includes(data.eye)) throw new ApiError(400,"procedureEyeNotAllowed");
      const created = (await db.query("INSERT INTO app.surgery_case(tenant_id,encounter_id,facility_id,surgeon_id,eye,procedure,procedure_catalogue_id,estimate_paisa,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,0,$8) RETURNING id", [user.tenantId, data.encounterId, data.facilityId, data.surgeonId, data.eye, catalogue?.name ?? data.procedure, catalogue?.id ?? null, user.id])).rows[0];
      await db.query("INSERT INTO app.surgery_transition(tenant_id,case_id,stage,eye,notes,actor_id) VALUES($1,$2,'estimate',$3,'Case created',$4)", [user.tenantId, created.id, data.eye, user.id]);
      await log(db, user, context, "surgery.created", created.id);
      return created;
    }
    const surgeryCase = (await db.query("SELECT * FROM app.surgery_case WHERE id=$1 FOR UPDATE", [data.id])).rows[0];
    if (!surgeryCase) throw new ApiError(404, "caseNotFound");
    await facility(db, user, surgeryCase.facility_id);
    if (surgeryCase.version !== data.version) throw new ApiError(409, "recordChanged");
    if (surgeryCase.eye !== data.eye) throw new ApiError(409, "lateralityMismatch");
    if (data.stage === "cancelled") {
      if (["operated", "discharged", "followup", "cancelled"].includes(surgeryCase.stage)) throw new ApiError(409, "stageConflict");
    } else if (SURGERY_STAGES[SURGERY_STAGES.indexOf(surgeryCase.stage) + 1] !== data.stage) throw new ApiError(409, "stageConflict");
    if (["consent", "scheduled", "operated"].includes(data.stage) && !(await hasActiveSurgicalConsent(db, surgeryCase.id))) throw new ApiError(409, "confirmedConsentRequired");
    if (data.stage === "scheduled" && surgeryCase.procedure_catalogue_id) {
      const procedure=(await db.query("SELECT definition FROM app.procedure_catalogue WHERE id=$1",[surgeryCase.procedure_catalogue_id])).rows[0];
      const checks=(procedure?.definition?.preoperativeChecks??[]) as string[];
      const assessment=checks.length?(await db.query("SELECT biometry_verified,medical_clearance,pupil_dilation FROM app.surgery_preop_assessment WHERE case_id=$1",[surgeryCase.id])).rows[0]:null;
      if(checks.some(check=>assessment?.[check]!==true))throw new ApiError(409,"preopRequired");
    }
    if (data.stage === "operated" && surgeryCase.procedure_catalogue_id && !(await db.query("SELECT 1 FROM app.surgery_operation_note WHERE case_id=$1", [surgeryCase.id])).rowCount) throw new ApiError(409, "operationNoteRequired");
    if (data.stage === "scheduled" && (!data.scheduled || Date.parse(data.scheduled) < Date.now())) throw new ApiError(400, "futureSurgeryRequired");
    if (["operated", "discharged", "followup", "preop"].includes(data.stage) && !user.roles.includes("doctor")) throw new ApiError(403, "doctorRequired");
    await db.query("UPDATE app.surgery_case SET stage=$2,version=version+1,scheduled_at=coalesce($3,scheduled_at) WHERE id=$1", [surgeryCase.id, data.stage, data.scheduled ?? null]);
    await db.query("INSERT INTO app.surgery_transition(tenant_id,case_id,stage,eye,notes,actor_id) VALUES($1,$2,$3,$4,$5,$6)", [user.tenantId, surgeryCase.id, data.stage, data.eye, data.notes, user.id]);
    await log(db, user, context, `surgery.${data.stage}`, surgeryCase.id);
    return { ok: true };
  });
}

async function dashboard(db: PoolClient, user: AuthUser) {
  const date = todayKarachi();
  const [bookingRows, surgery, documentationRows, waits] = await readBatch(db, [
    { text: "SELECT count(*)::int AS total,count(*) FILTER(WHERE status='checked_in')::int AS attended,count(*) FILTER(WHERE status='cancelled')::int AS cancelled,count(*) FILTER(WHERE status='no_show')::int AS missed FROM app.appointment WHERE facility_id=ANY($1::uuid[]) AND appointment_date=$2", values: [user.facilityIds, date] },
    { text: "SELECT CASE WHEN stage='estimate' THEN 'planning' ELSE stage END AS stage,count(*)::int AS count FROM app.surgery_case WHERE facility_id=ANY($1::uuid[]) GROUP BY CASE WHEN stage='estimate' THEN 'planning' ELSE stage END", values: [user.facilityIds] },
    { text: "SELECT count(*)::int AS visits,count(*) FILTER(WHERE d.status='signed')::int AS signed FROM app.encounter e LEFT JOIN app.doctor_event d ON d.encounter_id=e.id WHERE e.facility_id=ANY($1::uuid[]) AND e.checked_in_at>=now()-interval '30 days'", values: [user.facilityIds] },
    { text: "SELECT stage,round(avg(minutes)::numeric,1)::float8 AS minutes FROM (SELECT q.to_stage AS stage,extract(epoch FROM (lead(q.at) OVER(PARTITION BY q.encounter_id ORDER BY q.encounter_version)-q.at))/60 AS minutes FROM app.queue_transition q JOIN app.encounter e ON e.id=q.encounter_id WHERE e.facility_id=ANY($1::uuid[]) AND e.checked_in_at>=now()-interval '30 days') w WHERE minutes IS NOT NULL GROUP BY stage", values: [user.facilityIds] },
  ]);
  return { date, bookings: bookingRows[0], surgery, documentation: documentationRows[0], waits, asOf: new Date().toISOString() };
}
