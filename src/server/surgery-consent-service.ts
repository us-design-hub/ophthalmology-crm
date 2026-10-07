import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { AuthUser } from "@/lib/access";
import { withTenant } from "./db";
import { audit, type AuditContext } from "./audit";
import { ApiError } from "./http";
import { parseInput, requireAction } from "./administration-service";

const uuid = z.uuid();
const consentActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm"), consentVersionId: uuid }).strict(),
  z.object({ action: z.literal("withdraw"), consentVersionId: uuid, reason: z.string().trim().min(8).max(500) }).strict(),
]);

export type ConsentUploadInput = {
  caseId: string;
  eye: "OD" | "OS";
  signatoryType: "patient" | "guardian";
  signatoryName: string;
  relationship: string;
  witnessName: string;
  witnessRole: string;
};

function requireDoctor(user: AuthUser) {
  if (!user.roles.includes("doctor")) throw new ApiError(403, "doctorRequired");
}

async function accessibleCase(db: PoolClient, user: AuthUser, caseId: string) {
  const row = (await db.query("SELECT * FROM app.surgery_case WHERE id=$1 AND facility_id=ANY($2::uuid[]) FOR UPDATE", [caseId, user.facilityIds])).rows[0];
  if (!row) throw new ApiError(404, "caseNotFound");
  return row;
}

export async function hasActiveSurgicalConsent(db: PoolClient, caseId: string): Promise<boolean> {
  return Boolean((await db.query(`SELECT 1
    FROM app.surgery_consent_version v
    JOIN app.surgery_case c ON c.tenant_id=v.tenant_id AND c.id=v.case_id
    WHERE v.case_id=$1 AND v.version=(SELECT max(v2.version) FROM app.surgery_consent_version v2 WHERE v2.case_id=v.case_id)
      AND v.eye=c.eye AND v.procedure_snapshot=c.procedure
      AND (SELECT e.action FROM app.surgery_consent_event e WHERE e.consent_version_id=v.id ORDER BY e.sequence DESC LIMIT 1)='confirmed'`, [caseId])).rowCount);
}

export async function createSurgicalConsent(user: AuthUser, input: ConsentUploadInput, file: { content: Buffer; mime: string; filename: string }, context: AuditContext) {
  requireAction(user, "surgery:write");
  return withTenant(user.tenantId, user.id, async db => {
    const surgeryCase = await accessibleCase(db, user, input.caseId);
    if (surgeryCase.eye !== input.eye) throw new ApiError(409, "lateralityMismatch");
    if (!["estimate", "consent", "preop", "scheduled"].includes(surgeryCase.stage)) throw new ApiError(409, "stageConflict");
    const latest = (await db.query(`SELECT v.id,(SELECT e.action FROM app.surgery_consent_event e WHERE e.consent_version_id=v.id ORDER BY e.sequence DESC LIMIT 1) AS status FROM app.surgery_consent_version v WHERE v.case_id=$1 ORDER BY v.version DESC LIMIT 1`, [surgeryCase.id])).rows[0];
    if (latest?.status === "created") throw new ApiError(409, "consentDraftExists");
    const version = Number((await db.query("SELECT coalesce(max(version),0)+1 AS version FROM app.surgery_consent_version WHERE case_id=$1", [surgeryCase.id])).rows[0].version);
    const evidenceHash = createHash("sha256").update(file.content).digest("hex");
    const recordHash = createHash("sha256").update(JSON.stringify([
      surgeryCase.id, version, input.eye, surgeryCase.procedure, "surgical-consent-v1", input.signatoryType,
      input.signatoryName, input.relationship, input.witnessName, input.witnessRole, evidenceHash,
    ])).digest("hex");
    const consent = (await db.query(`INSERT INTO app.surgery_consent_version
      (tenant_id,case_id,version,eye,procedure_snapshot,statement_version,signatory_type,signatory_name,relationship,witness_name,witness_role,evidence_hash,record_hash,created_by)
      VALUES($1,$2,$3,$4,$5,'surgical-consent-v1',$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id,version`,
      [user.tenantId, surgeryCase.id, version, input.eye, surgeryCase.procedure, input.signatoryType, input.signatoryName, input.relationship, input.witnessName, input.witnessRole, evidenceHash, recordHash, user.id])).rows[0];
    const document = (await db.query(`INSERT INTO app.consent_document
      (tenant_id,case_id,consent_version_id,content,mime,filename,hash,eye,witness,actor_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [user.tenantId, surgeryCase.id, consent.id, file.content, file.mime, file.filename, evidenceHash, input.eye, input.witnessName, user.id])).rows[0];
    await db.query("INSERT INTO app.surgery_consent_event(tenant_id,consent_version_id,action,actor_id) VALUES($1,$2,'created',$3)", [user.tenantId, consent.id, user.id]);
    await audit(db, { tenantId: user.tenantId, actorId: user.id, action: "surgery.consent_version_created", entityType: "surgery_case", entityId: surgeryCase.id, metadata: { consentVersionId: consent.id, version, documentId: document.id, eye: input.eye }, context });
    return { id: consent.id, version, documentId: document.id, status: "created" };
  });
}

export async function surgicalConsentAction(user: AuthUser, input: unknown, context: AuditContext) {
  requireAction(user, "surgery:write");
  requireDoctor(user);
  const data = parseInput(consentActionSchema, input);
  return withTenant(user.tenantId, user.id, async db => {
    const consent = (await db.query(`SELECT v.*,c.facility_id,c.stage,c.eye AS case_eye,c.procedure AS case_procedure
      FROM app.surgery_consent_version v JOIN app.surgery_case c ON c.tenant_id=v.tenant_id AND c.id=v.case_id
      WHERE v.id=$1 AND c.facility_id=ANY($2::uuid[]) FOR UPDATE OF c`, [data.consentVersionId, user.facilityIds])).rows[0];
    if (!consent) throw new ApiError(404, "caseNotFound");
    if (!["estimate", "consent", "preop", "scheduled"].includes(consent.stage)) throw new ApiError(409, "stageConflict");
    const latest = (await db.query("SELECT id FROM app.surgery_consent_version WHERE case_id=$1 ORDER BY version DESC LIMIT 1", [consent.case_id])).rows[0];
    if (latest.id !== consent.id) throw new ApiError(409, "consentVersionStale");
    if (consent.eye !== consent.case_eye || consent.procedure_snapshot !== consent.case_procedure) throw new ApiError(409, "consentContextChanged");
    const status = (await db.query("SELECT action FROM app.surgery_consent_event WHERE consent_version_id=$1 ORDER BY sequence DESC LIMIT 1", [consent.id])).rows[0]?.action;
    if (data.action === "confirm" && status !== "created") throw new ApiError(409, "consentStateConflict");
    if (data.action === "withdraw" && status !== "confirmed") throw new ApiError(409, "consentStateConflict");
    await db.query("INSERT INTO app.surgery_consent_event(tenant_id,consent_version_id,action,reason,actor_id) VALUES($1,$2,$3,$4,$5)", [user.tenantId, consent.id, data.action === "confirm" ? "confirmed" : "withdrawn", data.action === "withdraw" ? data.reason : "", user.id]);
    await audit(db, { tenantId: user.tenantId, actorId: user.id, action: `surgery.consent_${data.action === "confirm" ? "confirmed" : "withdrawn"}`, entityType: "surgery_case", entityId: consent.case_id, metadata: { consentVersionId: consent.id, version: consent.version, ...(data.action === "withdraw" ? { reason: data.reason } : {}) }, context });
    return { ok: true, status: data.action === "confirm" ? "confirmed" : "withdrawn" };
  });
}
