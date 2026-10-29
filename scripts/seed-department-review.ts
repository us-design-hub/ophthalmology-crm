import { productionClient } from "./production-env";

async function main(){
 const db=productionClient("openeyes-department-review-seed");await db.connect();
 try{await db.query("BEGIN");await db.query("SELECT pg_advisory_xact_lock(724912046)");
  const tenants=(await db.query("SELECT id,name FROM app.tenant WHERE is_demo")).rows;
  if(tenants.length!==1)throw new Error("Exactly one demo tenant is required");const tenant=tenants[0],tid=tenant.id;
  const existing=(await db.query("SELECT metadata FROM app.audit_log WHERE tenant_id=$1 AND action='review.department_seed' ORDER BY at DESC LIMIT 1",[tid])).rows[0];
  if(existing){const m=existing.metadata;const check=(await db.query(`SELECT
    (SELECT count(*)::int FROM app.lab_order WHERE encounter_id=$1 AND status='pending') AS labs,
    (SELECT count(*)::int FROM app.machine_order WHERE encounter_id=$2 AND status='ordered') AS machines,
    (SELECT count(*)::int FROM app.spectacle_order WHERE doctor_event_id=$3 AND status<>'cancelled') AS optics`,[m.labEncounter,m.machineEncounter,m.opticsEvent])).rows[0];await db.query("COMMIT");console.log(`Department review data already exists: ${check.optics} optics referral, ${check.labs} lab orders, ${check.machines} machine orders.`);return;}
  const doctor=(await db.query(`SELECT u.id,u.full_name FROM app.user_account u JOIN app.user_role r ON r.tenant_id=u.tenant_id AND r.user_id=u.id
    WHERE u.tenant_id=$1 AND r.role_code='doctor' AND u.status='active' ORDER BY (u.email='hamza.ali@demo.openeyes.local') DESC,u.email LIMIT 1`,[tid])).rows[0];
  const actor=(await db.query(`SELECT u.id FROM app.user_account u JOIN app.user_role r ON r.tenant_id=u.tenant_id AND r.user_id=u.id
    WHERE u.tenant_id=$1 AND r.role_code='hospital_admin' AND u.status='active' LIMIT 1`,[tid])).rows[0]??doctor;
  const facility=(await db.query(`SELECT f.id,f.name,s.start_minute,s.end_minute,s.slot_minutes FROM app.facility f JOIN app.clinic_schedule s ON s.tenant_id=f.tenant_id AND s.facility_id=f.id
    JOIN app.user_facility uf ON uf.tenant_id=f.tenant_id AND uf.facility_id=f.id AND uf.user_id=$2 WHERE f.tenant_id=$1 AND f.active AND f.type='clinic' ORDER BY (lower(f.specialty)='general ophthalmology') DESC,f.name LIMIT 1`,[tid,doctor.id])).rows[0];
  if(!doctor||!facility)throw new Error("An active demo doctor and clinic are required");
  const patients=(await db.query(`SELECT p.id,p.mrn FROM app.patient p WHERE p.tenant_id=$1
    AND NOT EXISTS(SELECT 1 FROM app.encounter e WHERE e.tenant_id=p.tenant_id AND e.patient_id=p.id AND e.closed_at IS NULL)
    AND NOT EXISTS(SELECT 1 FROM app.appointment a WHERE a.tenant_id=p.tenant_id AND a.patient_id=p.id AND a.appointment_date=(now() AT TIME ZONE 'Asia/Karachi')::date)
    ORDER BY p.created_at,p.id LIMIT 2`,[tid])).rows;
  if(patients.length<2)throw new Error("Two demo patients without active visits are required");
  const used=new Set<string>();
  async function createVisit(patient:{id:string;mrn:string},stage:"workup"|"testing",index:number){
   const slots=(await db.query(`SELECT make_time((minute/60)::int,(minute%60)::int,0)::time AS slot FROM generate_series($3::int,$4::int-$5::int,$5::int) minute
     WHERE NOT EXISTS(SELECT 1 FROM app.appointment a WHERE a.tenant_id=$1 AND a.doctor_id=$2 AND a.appointment_date=(now() AT TIME ZONE 'Asia/Karachi')::date AND a.slot_time=make_time((minute/60)::int,(minute%60)::int,0)::time)
     ORDER BY minute DESC`,[tid,doctor.id,facility.start_minute,facility.end_minute,facility.slot_minutes])).rows;
   const slot=slots.find(row=>!used.has(String(row.slot)))?.slot;if(!slot)throw new Error("No demo appointment slot is available");used.add(String(slot));
   const appointment=(await db.query(`INSERT INTO app.appointment(tenant_id,patient_id,facility_id,doctor_id,appointment_date,slot_time,status,created_by,change_reason)
     VALUES($1,$2,$3,$4,(now() AT TIME ZONE 'Asia/Karachi')::date,$5,'checked_in',$4,'Synthetic department review visit') RETURNING id`,[tid,patient.id,facility.id,doctor.id,slot])).rows[0];
   const version=stage==='testing'?3:2;const encounter=(await db.query(`INSERT INTO app.encounter(tenant_id,appointment_id,patient_id,facility_id,doctor_id,stage,pathway_steps,version,checked_in_at,stage_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()-make_interval(mins=>$9),now()-interval '2 minutes') RETURNING id`,[tid,appointment.id,patient.id,facility.id,doctor.id,stage,stage==='testing'?['workup','testing']:['workup'],version,20+index*5])).rows[0];
   const stages=stage==='testing'?['waiting','workup','testing']:['waiting','workup'];for(let step=0;step<stages.length;step++)await db.query(`INSERT INTO app.queue_transition(tenant_id,encounter_id,from_stage,to_stage,encounter_version,actor_id,at,reason)
     VALUES($1,$2,$3,$4,$5,$6,now()-make_interval(mins=>$7),'Synthetic department review visit')`,[tid,encounter.id,step?stages[step-1]:null,stages[step],step+1,actor.id,15-step*5]);
   return encounter.id as string;
  }
  const labEncounter=await createVisit(patients[0],"workup",0);for(const test of ['bp','sugar'])await db.query("INSERT INTO app.lab_order(tenant_id,encounter_id,test,reasons,ordered_by) VALUES($1,$2,$3,ARRAY['manual'],$4) ON CONFLICT DO NOTHING",[tid,labEncounter,test,doctor.id]);
  await db.query("SELECT app.provision_example_machines($1)",[tid]);const machines=(await db.query("SELECT id FROM app.machine WHERE tenant_id=$1 AND active AND NOT needs_dilation AND NOT needs_doctor_approval ORDER BY display_order LIMIT 2",[tid])).rows;
  if(!machines.length)throw new Error("At least one active demo machine is required");const machineEncounter=await createVisit(patients[1],"testing",1);
  for(const [index,machine] of machines.entries())await db.query("INSERT INTO app.machine_order(tenant_id,encounter_id,machine_id,eye,status,ordered_by) VALUES($1,$2,$3,$4,'ordered',$5) ON CONFLICT DO NOTHING",[tid,machineEncounter,machine.id,index?'OS':'OD',doctor.id]);
  const optics=(await db.query(`SELECT d.id AS event_id,d.author_id,e.id AS encounter_id,e.patient_id FROM app.doctor_event d JOIN app.encounter e ON e.tenant_id=d.tenant_id AND e.id=d.encounter_id
    WHERE d.tenant_id=$1 AND d.status='signed' AND NOT EXISTS(SELECT 1 FROM app.spectacle_order o WHERE o.tenant_id=d.tenant_id AND o.doctor_event_id=d.id AND o.status<>'cancelled') ORDER BY d.signed_at DESC LIMIT 1`,[tid])).rows[0];
  if(!optics)throw new Error("A signed synthetic Doctor Event is required for optics review");
  await db.query(`INSERT INTO app.spectacle_order(tenant_id,encounter_id,patient_id,doctor_event_id,prescribed_by,doctor_suggestion,
    od_sphere,od_cylinder,od_axis,od_add,od_prism,os_sphere,os_cylinder,os_axis,os_add,os_prism,pd,lens_type,instructions,referral_note)
    VALUES($1,$2,$3,$4,$5,true,-1.25,-0.50,90,NULL,'',-1.00,-0.25,80,NULL,'',62.5,'distance','Anti-reflective lenses suggested.','Synthetic optics review example.')`,[tid,optics.encounter_id,optics.patient_id,optics.event_id,optics.author_id]);
  await db.query("INSERT INTO app.audit_log(tenant_id,actor_id,action,entity_type,metadata) VALUES($1,$2,'review.department_seed','demo_review',$3)",[tid,actor.id,JSON.stringify({synthetic:true,labEncounter,machineEncounter,opticsEvent:optics.event_id})]);
  await db.query("COMMIT");console.log(`Seeded review data for optics, lab, and machines in ${tenant.name}.`);
 }catch(error){await db.query("ROLLBACK");throw error;}finally{await db.end();}
}
main().catch(error=>{console.error(`Department review seed failed: ${error instanceof Error?error.message:"unknown error"}`);process.exitCode=1;});
