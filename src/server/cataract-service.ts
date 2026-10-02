import "server-only";

import { z } from "zod";
import type { PoolClient } from "pg";
import type { AuthUser } from "@/lib/access";
import { withTenant } from "./db";
import { audit, type AuditContext } from "./audit";
import { ApiError } from "./http";
import { parseInput } from "./administration-service";

const uuid = z.uuid();
const shortText = (max = 500) => z.string().trim().min(1).max(max);
const eye = z.enum(["OD", "OS"]);
const anaesthesia = z.enum(["topical", "local", "general"]);

const preopSchema = z.object({
  action: z.literal("save_preop"),
  id: uuid,
  version: z.number().int().nonnegative(),
  eye,
  axialLength: z.number().min(15).max(40),
  keratometryK1: z.number().min(20).max(70),
  keratometryK2: z.number().min(20).max(70),
  targetRefraction: z.number().min(-20).max(20),
  iolModel: shortText(120),
  iolPower: z.number().min(-10).max(60),
  anaesthesia,
  biometryVerified: z.boolean(),
  medicalClearance: z.boolean(),
  pupilDilation: z.boolean(),
  notes: z.string().trim().max(2000),
}).strict();

const operationSchema = z.object({
  action: z.literal("save_operation"),
  id: uuid,
  version: z.number().int().nonnegative(),
  eye,
  procedurePerformed: shortText(240),
  anaesthesia,
  incision: shortText(160),
  capsulorhexis: shortText(160),
  phacoTechnique: shortText(160),
  iolModel: shortText(120),
  iolPower: z.number().min(-10).max(60),
  complications: z.string().trim().max(2000),
  postoperativeInstructions: shortText(2000),
}).strict();

const followupSchema = z.object({
  action: z.literal("save_followup"),
  id: uuid,
  version: z.number().int().nonnegative(),
  visitType: z.enum(["day_1", "week_1", "month_1", "other"]),
  eye,
  uncorrectedAcuity: shortText(40),
  correctedAcuity: z.string().trim().max(40),
  iop: z.number().min(0).max(80),
  wound: shortText(500),
  cornea: shortText(500),
  anteriorChamber: shortText(500),
  iolPosition: shortText(500),
  medications: shortText(1000),
  plan: shortText(1500),
  nextReview: z.iso.date().optional(),
}).strict();

const cataractActionSchema = z.discriminatedUnion("action", [preopSchema, operationSchema, followupSchema]);
const cataractActions = new Set(["save_preop", "save_operation", "save_followup"]);

export function isCataractAction(input: unknown) {
  return !!input && typeof input === "object" && cataractActions.has(String((input as { action?: unknown }).action));
}

async function surgeryCase(db: PoolClient, user: AuthUser, id: string) {
  const row = (await db.query(
    `SELECT c.*,p.code AS procedure_code
     FROM app.surgery_case c
     LEFT JOIN app.procedure_catalogue p ON p.id=c.procedure_catalogue_id AND p.tenant_id=c.tenant_id
     WHERE c.id=$1 AND c.facility_id=ANY($2::uuid[])
     FOR UPDATE OF c`,
    [id, user.facilityIds],
  )).rows[0];
  if (!row) throw new ApiError(404, "caseNotFound");
  if (row.procedure_code !== "cataract-phaco-iol") throw new ApiError(409, "cataractProcedureRequired");
  return row;
}

async function writeAudit(db: PoolClient, user: AuthUser, context: AuditContext, action: string, caseId: string) {
  await audit(db, { tenantId: user.tenantId, actorId: user.id, action, entityType: "surgery_case", entityId: caseId, context });
}

export async function cataractAction(user: AuthUser, input: unknown, context: AuditContext) {
  if (!user.permissions.includes("surgery:write")) throw new ApiError(403, "accessDenied");
  if (!user.roles.includes("doctor")) throw new ApiError(403, "doctorRequired");
  const data = parseInput(cataractActionSchema, input);
  return withTenant(user.tenantId, user.id, async db => {
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["cataract:" + user.tenantId]);
    const currentCase = await surgeryCase(db, user, data.id);
    if (currentCase.eye !== data.eye) throw new ApiError(409, "lateralityMismatch");

    if (data.action === "save_preop") {
      if (!["consent", "preop"].includes(currentCase.stage)) throw new ApiError(409, "stageConflict");
      const existing = (await db.query("SELECT version FROM app.surgery_preop_assessment WHERE case_id=$1 FOR UPDATE", [data.id])).rows[0];
      if ((existing?.version ?? 0) !== data.version) throw new ApiError(409, "recordChanged");
      if (existing) {
        await db.query(
          `UPDATE app.surgery_preop_assessment
           SET axial_length=$2,keratometry_k1=$3,keratometry_k2=$4,target_refraction=$5,iol_model=$6,iol_power=$7,
               anaesthesia=$8,biometry_verified=$9,medical_clearance=$10,pupil_dilation=$11,notes=$12,
               author_id=$13,version=version+1,updated_at=now()
           WHERE case_id=$1`,
          [data.id, data.axialLength, data.keratometryK1, data.keratometryK2, data.targetRefraction, data.iolModel, data.iolPower, data.anaesthesia, data.biometryVerified, data.medicalClearance, data.pupilDilation, data.notes, user.id],
        );
      } else {
        await db.query(
          `INSERT INTO app.surgery_preop_assessment
           (tenant_id,case_id,eye,axial_length,keratometry_k1,keratometry_k2,target_refraction,iol_model,iol_power,anaesthesia,biometry_verified,medical_clearance,pupil_dilation,notes,author_id)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [user.tenantId, data.id, data.eye, data.axialLength, data.keratometryK1, data.keratometryK2, data.targetRefraction, data.iolModel, data.iolPower, data.anaesthesia, data.biometryVerified, data.medicalClearance, data.pupilDilation, data.notes, user.id],
        );
      }
      await writeAudit(db, user, context, "cataract.preop_saved", data.id);
      return { ok: true };
    }

    if (data.action === "save_operation") {
      if (currentCase.stage !== "scheduled") throw new ApiError(409, "stageConflict");
      const ready = (await db.query("SELECT 1 FROM app.surgery_preop_assessment WHERE case_id=$1 AND biometry_verified AND medical_clearance", [data.id])).rowCount;
      if (!ready) throw new ApiError(409, "preopRequired");
      const existing = (await db.query("SELECT version FROM app.surgery_operation_note WHERE case_id=$1 FOR UPDATE", [data.id])).rows[0];
      if ((existing?.version ?? 0) !== data.version) throw new ApiError(409, "recordChanged");
      if (existing) {
        await db.query(
          `UPDATE app.surgery_operation_note
           SET procedure_performed=$2,anaesthesia=$3,incision=$4,capsulorhexis=$5,phaco_technique=$6,
               iol_model=$7,iol_power=$8,complications=$9,postoperative_instructions=$10,
               author_id=$11,version=version+1,updated_at=now()
           WHERE case_id=$1`,
          [data.id, data.procedurePerformed, data.anaesthesia, data.incision, data.capsulorhexis, data.phacoTechnique, data.iolModel, data.iolPower, data.complications, data.postoperativeInstructions, user.id],
        );
      } else {
        await db.query(
          `INSERT INTO app.surgery_operation_note
           (tenant_id,case_id,eye,procedure_performed,anaesthesia,incision,capsulorhexis,phaco_technique,iol_model,iol_power,complications,postoperative_instructions,author_id)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [user.tenantId, data.id, data.eye, data.procedurePerformed, data.anaesthesia, data.incision, data.capsulorhexis, data.phacoTechnique, data.iolModel, data.iolPower, data.complications, data.postoperativeInstructions, user.id],
        );
      }
      await writeAudit(db, user, context, "cataract.operation_saved", data.id);
      return { ok: true };
    }

    if (!["operated", "discharged", "followup"].includes(currentCase.stage)) throw new ApiError(409, "stageConflict");
    const existing = (await db.query("SELECT version FROM app.surgery_followup WHERE case_id=$1 AND visit_type=$2 FOR UPDATE", [data.id, data.visitType])).rows[0];
    if ((existing?.version ?? 0) !== data.version) throw new ApiError(409, "recordChanged");
    if (existing) {
      await db.query(
        `UPDATE app.surgery_followup
         SET uncorrected_acuity=$3,corrected_acuity=$4,iop=$5,wound=$6,cornea=$7,anterior_chamber=$8,
             iol_position=$9,medications=$10,plan=$11,next_review=$12,author_id=$13,version=version+1,updated_at=now()
         WHERE case_id=$1 AND visit_type=$2`,
        [data.id, data.visitType, data.uncorrectedAcuity, data.correctedAcuity, data.iop, data.wound, data.cornea, data.anteriorChamber, data.iolPosition, data.medications, data.plan, data.nextReview ?? null, user.id],
      );
    } else {
      await db.query(
        `INSERT INTO app.surgery_followup
         (tenant_id,case_id,visit_type,eye,uncorrected_acuity,corrected_acuity,iop,wound,cornea,anterior_chamber,iol_position,medications,plan,next_review,author_id)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [user.tenantId, data.id, data.visitType, data.eye, data.uncorrectedAcuity, data.correctedAcuity, data.iop, data.wound, data.cornea, data.anteriorChamber, data.iolPosition, data.medications, data.plan, data.nextReview ?? null, user.id],
      );
    }
    await writeAudit(db, user, context, "cataract.followup_saved", data.id);
    return { ok: true };
  });
}
