import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { assertDemoDatabase } from './env';
import { canonicalJson,contentHash } from '../src/server/clinical-hash';
import { todayKarachi } from '../src/lib/patients';
const catalogue=[['Carboxymethylcellulose sodium','0.5%','lubricant'],['Sodium hyaluronate','0.1%','lubricant'],['Timolol','0.5%','beta_blocker'],['Latanoprost','0.005%','prostaglandin'],['Moxifloxacin','0.5%','antibiotic'],['Prednisolone acetate','1%','corticosteroid'],['Tropicamide','1%','mydriatic'],['Cyclopentolate','1%','mydriatic']];
async function main(){const db=new pg.Client({connectionString:assertDemoDatabase().toString()});await db.connect();try{
 await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(724912004)');const tenant=(await db.query("SELECT * FROM app.tenant WHERE code='DEMO'")).rows[0];if(!tenant?.is_demo)throw new Error('Demo tenant required');
 const tid=tenant.id;
 for(const [name,strength,group] of catalogue)await db.query('INSERT INTO app.formulary(tenant_id,name,strength,therapy_group) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[tid,name,strength,group]);
 await db.query("UPDATE app.user_account SET licence_number='DEMO-'||upper(split_part(email,'.',1))||'-001' WHERE tenant_id=$1 AND licence_number='' AND EXISTS(SELECT 1 FROM app.user_role r WHERE r.user_id=app.user_account.id AND r.role_code='doctor')",[tid]);
 if((await db.query('SELECT 1 FROM app.doctor_event WHERE tenant_id=$1 AND synthetic LIMIT 1',[tid])).rowCount){await db.query('COMMIT');console.log('Clinical seed preserved existing historical records and drafts.');return;}
 const facility=(await db.query("SELECT id FROM app.facility WHERE tenant_id=$1 AND name='General Ophthalmology'",[tid])).rows[0].id;
 const doctor=(await db.query("SELECT * FROM app.user_account WHERE tenant_id=$1 AND email='sara.khan@demo.openeyes.local'",[tid])).rows[0];
 const nurse=(await db.query("SELECT id,full_name FROM app.user_account WHERE tenant_id=$1 AND email='nadia.raza@demo.openeyes.local'",[tid])).rows[0];
 // Only the original numbered demo patients receive synthetic imported histories.
 const patients=(await db.query("SELECT * FROM app.patient WHERE tenant_id=$1 AND mrn ~ '^DEH-[0-9]{2}-[0-9]{6}$' AND right(mrn,6)::int<=60 ORDER BY mrn",[tid])).rows;
 let count=0;
 for(const [index,patient] of patients.entries()){
  const visits=[0,6,7].includes(index)?6:4;
  for(let visit=0;visit<visits;visit++){
   const day=new Date(new Date(`${todayKarachi()}T00:00:00Z`).getTime()-(30+visit*85+index)*86400000).toISOString().slice(0,10);
   const minute=540+index*5; // Imported source appointments are synthetic historical records, not live slot bookings.
   const time=`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
   const start=new Date(`${day}T${time}:00+05:00`),measured=new Date(start.getTime()+5*60000),signedAt=new Date(start.getTime()+25*60000);
   const appointment=(await db.query("INSERT INTO app.appointment(tenant_id,patient_id,facility_id,doctor_id,appointment_date,slot_time,status,created_by) VALUES($1,$2,$3,$4,$5,$6,'checked_in',$4) RETURNING id",[tid,patient.id,facility,doctor.id,day,time])).rows[0].id;
   const encounter=(await db.query("INSERT INTO app.encounter(tenant_id,appointment_id,patient_id,facility_id,doctor_id,stage,version,checked_in_at,stage_at,closed_at) VALUES($1,$2,$3,$4,$5,'consultation',4,$6,$7,$8) RETURNING id",[tid,appointment,patient.id,facility,doctor.id,start,new Date(start.getTime()+15*60000),signedAt])).rows[0].id;
   for(let step=0;step<3;step++)await db.query("INSERT INTO app.queue_transition(tenant_id,encounter_id,from_stage,to_stage,encounter_version,actor_id,at,reason) VALUES($1,$2,$3,$4,$5,$6,$7,'Synthetic imported history')",[tid,encounter,[null,'waiting','workup'][step],['waiting','workup','consultation'][step],step+1,step? nurse.id:doctor.id,new Date(start.getTime()+step*7*60000)]);
   const revision=(await db.query("INSERT INTO app.workup_revision(tenant_id,encounter_id,version,author_id,notes,saved_at) VALUES($1,$2,1,$3,'Synthetic historical measurements',$4) RETURNING id",[tid,encounter,nurse.id,new Date(start.getTime()+10*60000)])).rows[0].id;
   const eye={uncorrected:'6/12',pinhole:'6/9',corrected:'6/9',iop:16,method:'NCT',measuredAt:measured.toISOString()};
   for(const eyeName of ['OD','OS'])await db.query("INSERT INTO app.workup_eye(tenant_id,revision_id,eye,uncorrected,pinhole,corrected,iop,method,measured_at) VALUES($1,$2,$3,'6/12','6/9','6/9',16,'NCT',$4)",[tid,revision,eyeName,measured]);
   const eventId=randomUUID();const clinical={complaint:'Synthetic follow-up visit for demo history.',findings:{OD:'Synthetic anterior and posterior segment observations recorded.',OS:'Synthetic anterior and posterior segment observations recorded.'},diagnoses:[{eye:'OU',label:['Age-related cataract','Dry eye','Diabetic retinopathy'][index%3]}],plans:[{id:randomUUID(),eye:'OD',anatomySite:'lens',intent:'observation',notes:'Synthetic plan example; no clinical recommendation.'}],referral:'',followUp:'Synthetic follow-up recorded.'};
   await db.query('INSERT INTO app.doctor_event(id,tenant_id,encounter_id,author_id,complaint,findings,diagnoses,referral,follow_up,synthetic) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true)',[eventId,tid,encounter,doctor.id,clinical.complaint,JSON.stringify(clinical.findings),JSON.stringify(clinical.diagnoses),clinical.referral,clinical.followUp]);
   const plan=clinical.plans[0];await db.query('INSERT INTO app.event_plan(id,tenant_id,event_id,eye,anatomy_site,intent,notes) VALUES($1,$2,$3,$4,$5,$6,$7)',[plan.id,tid,eventId,plan.eye,plan.anatomySite,plan.intent,plan.notes]);
   const snapshot={schemaVersion:1,kind:'event',id:eventId,version:1,tenantId:tid,hospital:tenant.name,encounterId:encounter,patient:{id:patient.id,name:`${patient.given_name} ${patient.family_name}`,mrn:patient.mrn,dob:patient.dob.toISOString?.().slice(0,10)??patient.dob,gender:patient.gender,flags:[]},prescriber:{id:doctor.id,name:doctor.full_name,licence:doctor.licence_number},synthetic:true,...clinical,workup:{id:revision,encounterId:encounter,version:1,authorId:nurse.id,author:nurse.full_name,savedAt:new Date(start.getTime()+10*60000).toISOString(),notes:'Synthetic historical measurements',OD:eye,OS:eye}};
   await db.query("UPDATE app.doctor_event SET status='signed',signed_at=$2,signed_by=$3,snapshot_text=$4,content_hash=$5 WHERE id=$1",[eventId,signedAt,doctor.id,canonicalJson(snapshot),contentHash(snapshot)]);
   await db.query("INSERT INTO app.audit_log(tenant_id,actor_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'clinical.seeded','doctor_event',$3,'{\"synthetic\":true}')",[tid,doctor.id,eventId]);count++;
  }
 }
 await db.query('COMMIT');console.log(`Seeded ${count} synthetic historical visits and ${catalogue.length} example formulary items. Existing active encounters are unchanged.`);
}catch(error){await db.query('ROLLBACK');throw error;}finally{await db.end();}}
main().catch(error=>{console.error('Clinical seed failed:',error.code??error.message);process.exitCode=1;});
