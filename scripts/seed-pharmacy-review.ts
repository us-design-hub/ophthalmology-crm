import { randomUUID } from "node:crypto";
import { canonicalJson,contentHash } from "../src/server/clinical-hash";
import { productionClient } from "./production-env";

async function main(){
 const db=productionClient("openeyes-pharmacy-review-seed");await db.connect();
 try{await db.query("BEGIN");await db.query("SELECT pg_advisory_xact_lock(724912047)");
  const tenants=(await db.query("SELECT id,name FROM app.tenant WHERE is_demo")).rows;
  if(tenants.length!==1)throw new Error("Exactly one demo tenant is required");const tenant=tenants[0],tid=tenant.id;
  const existing=(await db.query("SELECT metadata FROM app.audit_log WHERE tenant_id=$1 AND action='review.pharmacy_seed' ORDER BY at DESC LIMIT 1",[tid])).rows[0];
  if(existing){const prescriptionId=existing.metadata.prescriptionId;const count=(await db.query("SELECT count(*)::int AS count FROM app.prescription WHERE tenant_id=$1 AND id=$2 AND status='signed'",[tid,prescriptionId])).rows[0].count;await db.query("COMMIT");console.log(`Pharmacy review data already exists: ${count} signed prescription.`);return;}
  const pharmacist=(await db.query(`SELECT u.id,u.full_name FROM app.user_account u JOIN app.user_role r ON r.tenant_id=u.tenant_id AND r.user_id=u.id
    WHERE u.tenant_id=$1 AND r.role_code='pharmacist' AND u.status='active' ORDER BY u.email LIMIT 1`,[tid])).rows[0];
  if(!pharmacist)throw new Error("An active demo pharmacy account is required");
  const record=(await db.query(`SELECT d.id AS event_id,d.author_id,e.id AS encounter_id,e.patient_id,
    p.given_name||' '||p.family_name AS patient_name,p.mrn,p.dob,p.gender,
    u.full_name AS doctor_name,u.licence_number,f.name AS clinic
    FROM app.doctor_event d
    JOIN app.encounter e ON e.tenant_id=d.tenant_id AND e.id=d.encounter_id
    JOIN app.patient p ON p.tenant_id=e.tenant_id AND p.id=e.patient_id
    JOIN app.user_account u ON u.tenant_id=d.tenant_id AND u.id=d.author_id
    JOIN app.facility f ON f.tenant_id=e.tenant_id AND f.id=e.facility_id
    JOIN app.user_facility uf ON uf.tenant_id=e.tenant_id AND uf.facility_id=e.facility_id AND uf.user_id=$2
    WHERE d.tenant_id=$1 AND d.status='signed'
      AND NOT EXISTS(SELECT 1 FROM app.prescription r WHERE r.tenant_id=d.tenant_id AND r.event_id=d.id)
    ORDER BY d.signed_at DESC LIMIT 1`,[tid,pharmacist.id])).rows[0];
  if(!record)throw new Error("A signed Doctor Event without a prescription is required in a pharmacy-assigned clinic");
  const drug=(await db.query(`SELECT id,name,strength,therapy_group FROM app.formulary WHERE tenant_id=$1 AND active
    ORDER BY (lower(name) LIKE '%moxifloxacin%') DESC,(lower(name) LIKE '%lubricant%') DESC,name LIMIT 1`,[tid])).rows[0];
  if(!drug)throw new Error("An active formulary medicine is required");
  const prescriptionId=randomUUID(),itemId=randomUUID();
  const item={id:itemId,quantity:1,drugId:drug.id,name:drug.name,strength:drug.strength,therapyGroup:drug.therapy_group,eye:"OU",dose:"1 drop",route:"Ophthalmic",frequency:"Four times daily",duration:"7 days",instructions:"Use as directed. Synthetic pharmacy review example.",instructionsUr:"",taperSchedule:[]};
  const snapshot={schemaVersion:1,kind:"prescription",id:prescriptionId,version:1,tenantId:tid,hospital:tenant.name,encounterId:record.encounter_id,
   patient:{id:record.patient_id,name:record.patient_name,mrn:record.mrn,dob:record.dob,gender:record.gender,flags:[]},
   prescriber:{id:record.author_id,name:record.doctor_name,licence:record.licence_number},synthetic:true,eventId:record.event_id,
   eventHash:(await db.query("SELECT content_hash FROM app.doctor_event WHERE tenant_id=$1 AND id=$2",[tid,record.event_id])).rows[0].content_hash,items:[item],evidence:[]};
  const snapshotText=canonicalJson(snapshot),hash=contentHash(snapshot);
  await db.query("INSERT INTO app.prescription(id,tenant_id,event_id,author_id,synthetic) VALUES($1,$2,$3,$4,true)",[prescriptionId,tid,record.event_id,record.author_id]);
  await db.query(`INSERT INTO app.prescription_item(id,tenant_id,prescription_id,position,drug_id,name,strength,therapy_group,eye,dose,route,frequency,duration,instructions,instructions_ur,quantity,taper_schedule)
    VALUES($1,$2,$3,0,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,[itemId,tid,prescriptionId,drug.id,drug.name,drug.strength,drug.therapy_group,item.eye,item.dose,item.route,item.frequency,item.duration,item.instructions,item.instructionsUr,item.quantity,JSON.stringify(item.taperSchedule)]);
  await db.query("UPDATE app.prescription SET status='signed',signed_at=now(),signed_by=$2,snapshot_text=$3,content_hash=$4,updated_at=now() WHERE id=$1",[prescriptionId,record.author_id,snapshotText,hash]);
  await db.query("INSERT INTO app.audit_log(tenant_id,actor_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'review.pharmacy_seed','prescription',$3,$4)",[tid,pharmacist.id,prescriptionId,JSON.stringify({synthetic:true,prescriptionId,eventId:record.event_id,encounterId:record.encounter_id,clinic:record.clinic})]);
  await db.query("COMMIT");console.log(`Seeded one signed prescription for pharmacy review in ${tenant.name}.`);
 }catch(error){await db.query("ROLLBACK");throw error;}finally{await db.end();}
}
main().catch(error=>{console.error(`Pharmacy review seed failed: ${error instanceof Error?error.message:"unknown error"}`);process.exitCode=1;});
