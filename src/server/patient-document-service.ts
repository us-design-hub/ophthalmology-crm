import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import type { AuthUser } from "@/lib/access";
import { DOCUMENT_CATEGORIES, uploadDocumentCategories, visibleDocumentCategories, type DocumentCategory, type PatientDocumentData } from "@/lib/patient-documents";
import type { AuditContext } from "./audit";
import { audit } from "./audit";
import { withTenant } from "./db";
import { ApiError } from "./http";
import { patientTimelineActivities } from "./patient-timeline-service";

const inputSchema = z.object({
  patientId: z.uuid(), encounterId: z.uuid(), category: z.enum(DOCUMENT_CATEGORIES),
  title: z.string().trim().min(2).max(160), remarks: z.string().trim().max(2000),
  capturedAt: z.iso.datetime({ offset: true }),
}).strict();

export type DocumentUpload = z.infer<typeof inputSchema> & { content: Buffer; mime: string; filename: string };

function allowed(user: AuthUser) { return visibleDocumentCategories(user.roles); }
function uploadAllowed(user: AuthUser) { return user.permissions.includes("document:upload") ? uploadDocumentCategories(user.roles) : []; }

async function patientExists(db: PoolClient, user: AuthUser, patientId: string) {
  const row = (await db.query("SELECT id FROM app.patient WHERE id=$1", [patientId])).rows[0];
  if (!row) throw new ApiError(404, "patientNotFound");
}

export async function patientDocumentList(user: AuthUser, patientId: string, context: AuditContext): Promise<PatientDocumentData> {
  if (!z.uuid().safeParse(patientId).success) throw new ApiError(404, "patientNotFound");
  return withTenant(user.tenantId, user.id, async db => {
    await patientExists(db, user, patientId);
    const categories = allowed(user);
    const documents = categories.length ? (await db.query(`
      SELECT d.id,d.patient_id AS "patientId",d.encounter_id AS "encounterId",d.category,d.title,d.remarks,
        d.captured_at AS "capturedAt",d.uploaded_at AS "uploadedAt",u.full_name AS actor,d.actor_role AS "actorRole",
        d.filename,d.mime,d.hash,f.name AS clinic,e.checked_in_at AS "visitDate"
      FROM app.clinical_document d
      JOIN app.encounter e ON e.id=d.encounter_id AND e.tenant_id=d.tenant_id
      JOIN app.facility f ON f.id=e.facility_id AND f.tenant_id=e.tenant_id
      JOIN app.user_account u ON u.id=d.actor_id AND u.tenant_id=d.tenant_id
      WHERE d.patient_id=$1 AND e.facility_id=ANY($2::uuid[]) AND d.category=ANY($3::text[])
      ORDER BY d.captured_at DESC,d.uploaded_at DESC,d.id DESC LIMIT 300`, [patientId, user.facilityIds, categories])).rows : [];
    const encounters = (await db.query(`SELECT e.id,f.name AS clinic,e.checked_in_at AS date,e.stage
      FROM app.encounter e JOIN app.facility f ON f.id=e.facility_id AND f.tenant_id=e.tenant_id
      WHERE e.patient_id=$1 AND e.facility_id=ANY($2::uuid[]) ORDER BY e.checked_in_at DESC LIMIT 50`, [patientId, user.facilityIds])).rows;
    await audit(db, { tenantId: user.tenantId, actorId: user.id, action: "patient_file.viewed", entityType: "patient", entityId: patientId, metadata: { documentCount: documents.length }, context });
    return { documents, encounters, uploadCategories: uploadAllowed(user), canExport: user.permissions.includes("document:export") };
  });
}

export async function uploadPatientDocument(user: AuthUser, raw: unknown, file: Omit<DocumentUpload, keyof z.infer<typeof inputSchema>>, context: AuditContext) {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, "validationFailed");
  const data: DocumentUpload = { ...parsed.data, ...file };
  if (!uploadAllowed(user).includes(data.category)) throw new ApiError(403, "documentCategoryDenied");
  if (new Date(data.capturedAt).getTime() > Date.now() + 60_000) throw new ApiError(400, "validationFailed");
  return withTenant(user.tenantId, user.id, async db => {
    const encounter = (await db.query(`SELECT e.id,e.patient_id,e.doctor_id,p.created_at
      FROM app.encounter e JOIN app.patient p ON p.id=e.patient_id AND p.tenant_id=e.tenant_id
      WHERE e.id=$1 AND e.patient_id=$2 AND e.facility_id=ANY($3::uuid[]) FOR UPDATE OF e`, [data.encounterId, data.patientId, user.facilityIds])).rows[0];
    if (!encounter) throw new ApiError(404, "clinicalNotFound");
    if (user.roles.includes("doctor") && encounter.doctor_id !== user.id) throw new ApiError(403, "clinicalOwner");
    if (new Date(data.capturedAt) < new Date(encounter.created_at)) throw new ApiError(400, "validationFailed");
    const hash = createHash("sha256").update(data.content).digest("hex");
    const actorRole = user.roles.find(role => (uploadDocumentCategories([role]) as DocumentCategory[]).includes(data.category)) ?? user.roles[0];
    try {
      const row = (await db.query(`INSERT INTO app.clinical_document
        (tenant_id,patient_id,encounter_id,category,title,remarks,captured_at,actor_id,actor_role,content,mime,filename,hash)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id,hash,uploaded_at AS "uploadedAt"`,
        [user.tenantId,data.patientId,data.encounterId,data.category,data.title,data.remarks,data.capturedAt,user.id,actorRole,data.content,data.mime,data.filename,hash])).rows[0];
      await audit(db, { tenantId: user.tenantId, actorId: user.id, action: "patient_file.document_uploaded", entityType: "patient", entityId: data.patientId, metadata: { documentId: row.id, encounterId: data.encounterId, category: data.category, hash, mime: data.mime }, context });
      return row;
    } catch (error) {
      if ((error as { code?: string }).code === "23505") throw new ApiError(409, "documentDuplicate");
      throw error;
    }
  });
}

export async function patientDocumentContent(user: AuthUser, id: string, context: AuditContext) {
  if (!z.uuid().safeParse(id).success) throw new ApiError(404, "documentNotFound");
  return withTenant(user.tenantId, user.id, async db => {
    const categories = allowed(user); if (!categories.length) throw new ApiError(403, "accessDenied");
    const row = (await db.query(`SELECT d.id,d.patient_id,d.content,d.mime,d.filename,d.hash
      FROM app.clinical_document d JOIN app.encounter e ON e.id=d.encounter_id AND e.tenant_id=d.tenant_id
      WHERE d.id=$1 AND e.facility_id=ANY($2::uuid[]) AND d.category=ANY($3::text[])`, [id,user.facilityIds,categories])).rows[0];
    if (!row) throw new ApiError(404, "documentNotFound");
    await audit(db, { tenantId:user.tenantId,actorId:user.id,action:"patient_file.document_viewed",entityType:"patient",entityId:row.patient_id,metadata:{documentId:id,hash:row.hash},context });
    return row;
  });
}

export async function patientFileExportData(user: AuthUser, patientId: string, context: AuditContext) {
  if (!user.permissions.includes("document:export")) throw new ApiError(403, "accessDenied");
  return withTenant(user.tenantId,user.id,async db=>{
    const patient=(await db.query(`SELECT p.id,p.mrn,concat_ws(' ',p.given_name,p.family_name) AS name,p.dob,p.gender,p.created_at AS "registeredAt" FROM app.patient p WHERE p.id=$1`,[patientId])).rows[0];
    if(!patient)throw new ApiError(404,"patientNotFound");
    const categories=allowed(user);
    const documents=(await db.query(`SELECT d.id,d.category,d.title,d.remarks,d.captured_at AS "capturedAt",d.uploaded_at AS "uploadedAt",d.filename,d.mime,d.hash,d.content,u.full_name AS actor,d.actor_role AS "actorRole",f.name AS clinic,e.checked_in_at AS "visitDate"
      FROM app.clinical_document d JOIN app.encounter e ON e.id=d.encounter_id AND e.tenant_id=d.tenant_id JOIN app.facility f ON f.id=e.facility_id AND f.tenant_id=e.tenant_id JOIN app.user_account u ON u.id=d.actor_id AND u.tenant_id=d.tenant_id
      WHERE d.patient_id=$1 AND e.facility_id=ANY($2::uuid[]) AND d.category=ANY($3::text[]) ORDER BY d.captured_at,d.id`,[patientId,user.facilityIds,categories])).rows;
    const activity=await patientTimelineActivities(db,user,patientId);
    await audit(db,{tenantId:user.tenantId,actorId:user.id,action:"patient_file.exported",entityType:"patient",entityId:patientId,metadata:{documentCount:documents.length,activityCount:activity.length},context});
    return {patient,documents,activity};
  });
}
