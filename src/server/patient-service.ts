import "server-only";
import { z } from "zod";
import type { PoolClient } from "pg";
import { withTenant } from "./db";
import { audit, type AuditContext } from "./audit";
import { ApiError } from "./http";
import { encryptIdentifier, identifierIndex, matchesReview, signReview } from "./crypto";
import { ageFromDob, IDENTIFIER_TYPES, normalizeIdentifier, normalizePhone, patientInputSchema, todayKarachi, type PatientDetail, type PatientInput, type PatientList, type PatientSummary } from "../lib/patients";
import type { AuthUser } from "../lib/access";

const summaryColumns = `p.id,p.version,p.mrn,p.given_name AS "givenName",p.family_name AS "familyName",p.gender,p.dob,
  p.dob_estimated AS "dobEstimated",p.phone_e164 AS phone,p.identifier_type AS "identifierType",
  concat('•••• ',p.identifier_last4) AS "identifierMasked",p.city,p.created_at AS "createdAt",
  coalesce((SELECT json_agg(json_build_object('type',f.type,'value',f.value) ORDER BY f.created_at,f.id) FROM app.patient_flag f WHERE f.patient_id=p.id AND f.tenant_id=p.tenant_id AND f.resolved_at IS NULL),'[]'::json) AS flags`;

export function parsePatientInput(value: unknown): PatientInput {
  const input = patientInputSchema.safeParse(value);
  if (!input.success) throw new ApiError(400, "validationFailed", { fields: Object.fromEntries(input.error.issues.map(issue => [issue.path.join("."), issue.message])) });
  return { ...input.data, givenName: input.data.givenName.replace(/\s+/g, " "), familyName: input.data.familyName.replace(/\s+/g, " "),
    identifier: normalizeIdentifier(input.data.identifier, input.data.identifierType), nextOfKinPhone: input.data.nextOfKinPhone ? normalizePhone(input.data.nextOfKinPhone)! : "" };
}
const listSchema = z.object({ query: z.string().trim().max(100).default(""), page: z.number().int().min(1).max(10000).default(1) }).strict();
export async function listPatients(user: AuthUser, value: unknown, context: AuditContext): Promise<PatientList> {
  const parsed = listSchema.safeParse(value);
  if (!parsed.success) throw new ApiError(400, "invalidRequest");
  const { query, page } = parsed.data;
  return withTenant(user.tenantId, user.id, async db => {
    const params: unknown[] = [];
    let where = "true";
    if (query) {
      const escaped = query.replace(/[\\%_]/g, "\\$&");
      const normalizedPhone = normalizePhone(query);
      params.push(`%${escaped}%`, normalizedPhone ?? query.replace(/[^\d+]/g, ""), [identifierIndex(user.tenantId, "cnic", normalizeIdentifier(query, "cnic")), identifierIndex(user.tenantId, "passport", normalizeIdentifier(query, "passport"))]);
      where = `(concat_ws(' ',p.given_name,p.family_name) ILIKE $1 OR p.mrn ILIKE $1 OR (length($2::text)>=3 AND p.phone_e164 LIKE '%'||$2||'%') OR p.identifier_blind_index=ANY($3::text[]))`;
    }
    const count = await db.query(`SELECT count(*)::int AS total FROM app.patient p WHERE ${where}`, params);
    const result = await db.query(`SELECT ${summaryColumns} FROM app.patient p WHERE ${where} ORDER BY p.created_at DESC,p.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, 20, (page - 1) * 20]);
    await audit(db, { tenantId: user.tenantId, actorId: user.id, action: query ? "patient.search" : "patient.list", entityType: "patient", metadata: { returnedRows: result.rowCount, page }, context });
    return { patients: result.rows as PatientSummary[], total: count.rows[0].total, page, pageSize: 20 };
  });
}
export async function getPatient(user: AuthUser, id: string, context: AuditContext): Promise<PatientDetail> {
  if (!z.uuid().safeParse(id).success) throw new ApiError(404, "patientNotFound");
  return withTenant(user.tenantId, user.id, async db => {
    const result = await db.query(`SELECT ${summaryColumns},p.address,p.preferred_language AS "preferredLanguage",p.next_of_kin_name AS "nextOfKinName",p.next_of_kin_phone AS "nextOfKinPhone" FROM app.patient p WHERE p.id=$1`, [id]);
    await audit(db, { tenantId: user.tenantId, actorId: user.id, action: result.rowCount ? "patient.read" : "patient.not_found", entityType: "patient", entityId: result.rowCount ? id : undefined, context });
    return result.rows[0] as PatientDetail | undefined;
  }).then(patient => { if (!patient) throw new ApiError(404, "patientNotFound"); return patient; });
}

async function findDuplicates(db: PoolClient, user: AuthUser, input: PatientInput) {
  const index = identifierIndex(user.tenantId, input.identifierType, input.identifier);
  const result = await db.query(`SELECT ${summaryColumns},
    (p.identifier_blind_index=$1 AND p.identifier_type<>'guardian_cnic' AND $2<>'guardian_cnic') AS "exactIdentifier"
    FROM app.patient p WHERE (p.identifier_blind_index=$1 AND p.identifier_type<>'guardian_cnic' AND $2<>'guardian_cnic') OR p.phone_e164=$3
    OR (lower(p.given_name)=lower($4) AND lower(p.family_name)=lower($5) AND p.dob=$6)
    ORDER BY p.id`, [index, input.identifierType, input.phone, input.givenName, input.familyName, input.dob]);
  return result.rows as (PatientSummary & { exactIdentifier: boolean })[];
}
function reviewSignature(user: AuthUser, input: PatientInput, ids: string[], expiresAt: number) {
  const { duplicateReason: _reason, duplicateReviewToken: _token, ...fields } = input;
  return signReview({ tenantId: user.tenantId, actorId: user.id, fields, candidateIds: [...ids].sort(), expiresAt });
}
export async function reviewPatient(user: AuthUser, input: PatientInput, context: AuditContext) {
  return withTenant(user.tenantId, user.id, async db => {
    const candidates = await findDuplicates(db, user, input);
    const expiresAt = Date.now() + 5 * 60_000;
    const token = `${expiresAt}.${reviewSignature(user, input, candidates.map(row => row.id), expiresAt)}`;
    await audit(db, { tenantId: user.tenantId, actorId: user.id, action: "patient.duplicate_check", entityType: "patient", metadata: { candidateCount: candidates.length }, context });
    return { candidates, exactMatch: candidates.some(row => row.exactIdentifier), reviewToken: token };
  });
}
export async function createPatient(user: AuthUser, input: PatientInput, context: AuditContext): Promise<PatientSummary> {
  if (!user.facilityIds.length) throw new ApiError(403, "facilityRequired");
  return withTenant(user.tenantId, user.id, async db => {
    // Serialize review + create per hospital so concurrent duplicate checks cannot both insert.
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`patient-registration:${user.tenantId}`]);
    const candidates = await findDuplicates(db, user, input);
    if (candidates.some(row => row.exactIdentifier)) throw new ApiError(409, "duplicateIdentifier", { candidates });
    const [expiry, signature] = (input.duplicateReviewToken ?? "").split(".");
    const expiresAt = Number(expiry);
    if (!signature || !Number.isFinite(expiresAt) || expiresAt < Date.now() || expiresAt > Date.now() + 5 * 60_000 || !matchesReview(signature, reviewSignature(user, input, candidates.map(row => row.id), expiresAt))) {
      throw new ApiError(409, "reviewRequired");
    }
    if (candidates.length && (!input.duplicateReason || input.duplicateReason.length < 8)) throw new ApiError(400, "duplicateReasonRequired");
    const year = Number(todayKarachi().slice(0, 4));
    const counter = await db.query("INSERT INTO app.mrn_counter(tenant_id,year,sequence) VALUES($1,$2,1) ON CONFLICT(tenant_id,year) DO UPDATE SET sequence=app.mrn_counter.sequence+1 RETURNING sequence", [user.tenantId, year]);
    const tenant = await db.query("SELECT mrn_prefix FROM app.tenant WHERE id=$1", [user.tenantId]);
    const mrn = `${tenant.rows[0].mrn_prefix}-${String(year).slice(-2)}-${String(counter.rows[0].sequence).padStart(6, "0")}`;
    const result = await db.query(`INSERT INTO app.patient(tenant_id,mrn,given_name,family_name,dob,dob_estimated,gender,phone_e164,identifier_type,identifier_encrypted,identifier_blind_index,identifier_last4,city,address,preferred_language,next_of_kin_name,next_of_kin_phone,created_by,created_facility_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id`, [
      user.tenantId, mrn, input.givenName, input.familyName, input.dob, input.dobEstimated, input.gender, input.phone, input.identifierType,
      encryptIdentifier(user.tenantId, input.identifierType, input.identifier), identifierIndex(user.tenantId, input.identifierType, input.identifier), input.identifier.slice(-4),
      input.city, input.address, input.preferredLanguage, input.nextOfKinName, input.nextOfKinPhone, user.id, user.facilityIds[0],
    ]);
    const id = result.rows[0].id as string;
    for (const type of ["allergy", "risk"] as const) if (input[type]) await db.query("INSERT INTO app.patient_flag(tenant_id,patient_id,type,value,created_by) VALUES($1,$2,$3,$4,$5)", [user.tenantId, id, type, input[type], user.id]);
    await audit(db, { tenantId: user.tenantId, actorId: user.id, action: "patient.created", entityType: "patient", entityId: id, metadata: { duplicateCount: candidates.length, ...(candidates.length ? { duplicateReason: input.duplicateReason } : {}) }, context });
    return (await db.query(`SELECT ${summaryColumns} FROM app.patient p WHERE p.id=$1`, [id])).rows[0] as PatientSummary;
  });
}

export async function editPatient(user:AuthUser,id:string,value:unknown,context:AuditContext){
 if(!user.permissions.includes('patient:edit'))throw new ApiError(403,'accessDenied');
 const schema=z.object({version:z.number().int().positive(),givenName:z.string().trim().min(1).max(80),familyName:z.string().trim().max(80),gender:z.enum(['female','male','other','unknown']),dob:z.iso.date(),dobEstimated:z.boolean(),phone:z.string().max(40),city:z.string().trim().max(80),address:z.string().trim().max(240),preferredLanguage:z.enum(['en','ur']),nextOfKinName:z.string().trim().max(100),nextOfKinPhone:z.string().max(30),reason:z.string().trim().min(8).max(240),duplicateReason:z.string().trim().max(240).default(''),identifierType:z.enum(IDENTIFIER_TYPES).optional(),identifier:z.string().trim().max(30).optional()}).strict();
 const parsed=schema.safeParse(value);if(!parsed.success||!z.uuid().safeParse(id).success)throw new ApiError(400,'validationFailed');const d=parsed.data;
 const phone=normalizePhone(d.phone),kin=d.nextOfKinPhone?normalizePhone(d.nextOfKinPhone):'';
 if(!phone||kin===null||d.dob>todayKarachi()||Number(todayKarachi().slice(0,4))-Number(d.dob.slice(0,4))>120)throw new ApiError(400,'validationFailed');
 return withTenant(user.tenantId,user.id,async db=>{await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`patient-registration:${user.tenantId}`]);const old=(await db.query('SELECT * FROM app.patient WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!old)throw new ApiError(404,'patientNotFound');if(old.version!==d.version)throw new ApiError(409,'recordChanged');
 const identifierType=d.identifier?d.identifierType:old.identifier_type;if(!identifierType||(identifierType==='guardian_cnic'&&ageFromDob(d.dob)>=18))throw new ApiError(400,'guardianMinorOnly');
 if(d.identifier){const normalized=normalizeIdentifier(d.identifier,identifierType);if(identifierType==='passport'?!/^[A-Z0-9]{6,20}$/.test(normalized):!/^\d{13}$/.test(normalized))throw new ApiError(400,'invalidIdentifier');const index=identifierIndex(user.tenantId,identifierType,normalized);if(identifierType!=='guardian_cnic'&&(await db.query("SELECT 1 FROM app.patient WHERE id<>$1 AND identifier_blind_index=$2 AND identifier_type<>'guardian_cnic'",[id,index])).rowCount)throw new ApiError(409,'duplicateIdentifier');await db.query('UPDATE app.patient SET identifier_type=$2,identifier_encrypted=$3,identifier_blind_index=$4,identifier_last4=$5 WHERE id=$1',[id,identifierType,encryptIdentifier(user.tenantId,identifierType,normalized),index,normalized.slice(-4)]);}

 const duplicates=(await db.query("SELECT id,mrn FROM app.patient WHERE id<>$1 AND (phone_e164=$2 OR (lower(given_name)=lower($3) AND lower(family_name)=lower($4) AND dob=$5))",[id,phone,d.givenName,d.familyName,d.dob])).rows;
 if(duplicates.length&&d.duplicateReason.length<8)throw new ApiError(409,'duplicateReasonRequired',{candidates:duplicates});
 await db.query('UPDATE app.patient SET given_name=$2,family_name=$3,gender=$4,dob=$5,dob_estimated=$6,phone_e164=$7,city=$8,address=$9,preferred_language=$10,next_of_kin_name=$11,next_of_kin_phone=$12,version=version+1 WHERE id=$1',[id,d.givenName,d.familyName,d.gender,d.dob,d.dobEstimated,phone,d.city,d.address,d.preferredLanguage,d.nextOfKinName,kin]);
 await audit(db,{tenantId:user.tenantId,actorId:user.id,action:'patient.updated',entityType:'patient',entityId:id,metadata:{version:d.version+1,reason:d.reason,duplicateCount:duplicates.length,duplicateReason:d.duplicateReason,fields:Object.keys(d).filter(k=>!['reason','duplicateReason','version'].includes(k))},context});return {version:d.version+1};});
}
