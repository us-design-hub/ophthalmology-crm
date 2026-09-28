import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import { configuredTenant } from "./auth";
import { requiredEnv } from "./config";
import { withTenant } from "./db";
import { audit, type AuditContext } from "./audit";
import { ApiError } from "./http";
import { encryptIdentifier, identifierIndex } from "./crypto";
import { todayKarachi } from "@/lib/patients";
import { parseOdooPatient, type OdooPatient } from "@/lib/odoo";

type SyncResult = { status: "created" | "linked" | "updated" | "unchanged"; patientId: string; mrn: string };

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function authenticateOdoo(request: Request) {
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const expected = requiredEnv("ODOO_WEBHOOK_SECRET");
  const suppliedHash = createHash("sha256").update(supplied).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  if (!supplied || !timingSafeEqual(suppliedHash, expectedHash)) throw new ApiError(401, "invalidIntegrationCredential");
}

function parsePayload(value: unknown): OdooPatient {
  const result = parseOdooPatient(value);
  if (!result.success) throw new ApiError(400, "invalidOdooPatient", { fields: result.fields });
  return result.data;
}

async function nextMrn(db: PoolClient, tenantId: string) {
  const year = Number(todayKarachi().slice(0, 4));
  const counter = await db.query("INSERT INTO app.mrn_counter(tenant_id,year,sequence) VALUES($1,$2,1) ON CONFLICT(tenant_id,year) DO UPDATE SET sequence=app.mrn_counter.sequence+1 RETURNING sequence", [tenantId, year]);
  const tenant = await db.query("SELECT mrn_prefix FROM app.tenant WHERE id=$1", [tenantId]);
  return `${tenant.rows[0].mrn_prefix}-${String(year).slice(-2)}-${String(counter.rows[0].sequence).padStart(6, "0")}`;
}

async function integrationContext(db: PoolClient) {
  const email = requiredEnv("ODOO_SERVICE_ACCOUNT_EMAIL").trim().toLowerCase();
  const facilityId = requiredEnv("ODOO_DEFAULT_FACILITY_ID");
  const actor = (await db.query("SELECT id FROM app.user_account WHERE email=$1 AND status='active'", [email])).rows[0];
  const facility = (await db.query("SELECT id FROM app.facility WHERE id=$1 AND active AND type='clinic'", [facilityId])).rows[0];
  if (!actor || !facility) throw new ApiError(503, "odooIntegrationNotConfigured");
  return { actorId: actor.id as string, facilityId: facility.id as string };
}

export async function syncOdooPatient(value: unknown, context: AuditContext): Promise<SyncResult> {
  const input = parsePayload(value);
  const tenant = await configuredTenant();
  const payloadHash = digest(input);
  return withTenant(tenant.id, undefined, async db => {
    const { actorId, facilityId } = await integrationContext(db);
    await db.query("SELECT set_config('app.actor_id',$1,true)", [actorId]);
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`odoo-patient:${tenant.id}:${input.externalId}`]);

    const existingIdentity = (await db.query(
      `SELECT x.patient_id,x.external_updated_at,x.payload_hash,p.mrn
       FROM app.patient_external_identity x
       JOIN app.patient p ON p.id=x.patient_id AND p.tenant_id=x.tenant_id
       WHERE x.source='odoo' AND x.external_id=$1 FOR UPDATE OF x,p`,
      [input.externalId],
    )).rows[0];

    if (existingIdentity) {
      const incomingTime = input.externalUpdatedAt ? Date.parse(input.externalUpdatedAt) : null;
      const storedTime = existingIdentity.external_updated_at ? Date.parse(existingIdentity.external_updated_at) : null;
      if ((incomingTime !== null && storedTime !== null && incomingTime < storedTime) || (existingIdentity.payload_hash === payloadHash && incomingTime === storedTime)) {
        await db.query("UPDATE app.patient_external_identity SET last_synced_at=now() WHERE source='odoo' AND external_id=$1", [input.externalId]);
        await audit(db, { tenantId: tenant.id, actorId, action: "patient.odoo_unchanged", entityType: "patient", entityId: existingIdentity.patient_id, metadata: { externalId: input.externalId }, context });
        return { status: "unchanged", patientId: existingIdentity.patient_id, mrn: existingIdentity.mrn };
      }
      await updatePatient(db, tenant.id, existingIdentity.patient_id, input);
      await db.query("UPDATE app.patient_external_identity SET external_updated_at=$2,last_synced_at=now(),payload_hash=$3 WHERE source='odoo' AND external_id=$1", [input.externalId, input.externalUpdatedAt ?? null, payloadHash]);
      await audit(db, { tenantId: tenant.id, actorId, action: "patient.odoo_updated", entityType: "patient", entityId: existingIdentity.patient_id, metadata: { externalId: input.externalId }, context });
      return { status: "updated", patientId: existingIdentity.patient_id, mrn: existingIdentity.mrn };
    }

    const index = identifierIndex(tenant.id, input.identifierType, input.identifier);
    const candidates = (await db.query(
      `SELECT id,mrn,
        (identifier_blind_index=$1 AND identifier_type<>'guardian_cnic' AND $2<>'guardian_cnic') AS exact_identifier,
        (phone_e164=$3 AND lower(given_name)=lower($4) AND lower(family_name)=lower($5) AND dob=$6) AS exact_demographics
       FROM app.patient
       WHERE (identifier_blind_index=$1 AND identifier_type<>'guardian_cnic' AND $2<>'guardian_cnic')
          OR (phone_e164=$3 AND lower(given_name)=lower($4) AND lower(family_name)=lower($5) AND dob=$6)
       ORDER BY id FOR UPDATE`,
      [index, input.identifierType, input.phone, input.givenName, input.familyName, input.dob],
    )).rows;
    const exactIdentifier = candidates.filter(row => row.exact_identifier);
    const exactDemographics = candidates.filter(row => row.exact_demographics);
    const match = exactIdentifier.length === 1 ? exactIdentifier[0] : exactIdentifier.length === 0 && exactDemographics.length === 1 ? exactDemographics[0] : null;
    if (!match && candidates.length) throw new ApiError(409, "odooPatientMatchConflict", { candidateCount: candidates.length });

    let patientId: string;
    let mrn: string;
    let status: SyncResult["status"];
    if (match) {
      patientId = match.id;
      mrn = match.mrn;
      status = "linked";
      await updatePatient(db, tenant.id, patientId, input);
    } else {
      mrn = await nextMrn(db, tenant.id);
      const created = await db.query(
        `INSERT INTO app.patient(
          tenant_id,mrn,given_name,family_name,dob,dob_estimated,gender,phone_e164,
          identifier_type,identifier_encrypted,identifier_blind_index,identifier_last4,
          city,address,preferred_language,next_of_kin_name,next_of_kin_phone,created_by,created_facility_id
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id`,
        [tenant.id, mrn, input.givenName, input.familyName, input.dob, input.dobEstimated, input.gender, input.phone,
          input.identifierType, encryptIdentifier(tenant.id, input.identifierType, input.identifier), index, input.identifier.slice(-4),
          input.city, input.address, input.preferredLanguage, input.nextOfKinName, input.nextOfKinPhone, actorId, facilityId],
      );
      patientId = created.rows[0].id;
      status = "created";
    }

    await db.query(
      "INSERT INTO app.patient_external_identity(tenant_id,patient_id,source,external_id,external_updated_at,payload_hash) VALUES($1,$2,'odoo',$3,$4,$5)",
      [tenant.id, patientId, input.externalId, input.externalUpdatedAt ?? null, payloadHash],
    );
    await audit(db, { tenantId: tenant.id, actorId, action: `patient.odoo_${status}`, entityType: "patient", entityId: patientId, metadata: { externalId: input.externalId }, context });
    return { status, patientId, mrn };
  });
}

async function updatePatient(db: PoolClient, tenantId: string, patientId: string, input: OdooPatient) {
  const index = identifierIndex(tenantId, input.identifierType, input.identifier);
  try {
    await db.query(
      `UPDATE app.patient SET
        given_name=$2,family_name=$3,dob=$4,dob_estimated=$5,gender=$6,phone_e164=$7,
        identifier_type=$8,identifier_encrypted=$9,identifier_blind_index=$10,identifier_last4=$11,
        city=$12,address=$13,preferred_language=$14,next_of_kin_name=$15,next_of_kin_phone=$16,
        version=version+1
       WHERE id=$1`,
      [patientId, input.givenName, input.familyName, input.dob, input.dobEstimated, input.gender, input.phone,
        input.identifierType, encryptIdentifier(tenantId, input.identifierType, input.identifier), index, input.identifier.slice(-4),
        input.city, input.address, input.preferredLanguage, input.nextOfKinName, input.nextOfKinPhone],
    );
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new ApiError(409, "odooPatientMatchConflict");
    throw error;
  }
}
