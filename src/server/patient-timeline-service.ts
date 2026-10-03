import 'server-only';

import type { PoolClient } from 'pg';
import type { AuthUser } from '@/lib/access';
import type { PatientTimelineActivity } from '@/lib/clinical';

export async function patientTimelineActivities(
  db: PoolClient,
  user: AuthUser,
  patientId: string,
): Promise<PatientTimelineActivity[]> {
  const result = await db.query<PatientTimelineActivity>(`
    WITH accessible_appointments AS (
      SELECT a.*, f.name AS clinic, u.full_name AS doctor
      FROM app.appointment a
      JOIN app.facility f ON f.id=a.facility_id AND f.tenant_id=a.tenant_id
      JOIN app.user_account u ON u.id=a.doctor_id AND u.tenant_id=a.tenant_id
      WHERE a.patient_id=$1 AND a.facility_id=ANY($2::uuid[])
    ),
    accessible_encounters AS (
      SELECT e.*, a.clinic, a.doctor
      FROM app.encounter e
      JOIN accessible_appointments a ON a.id=e.appointment_id AND a.tenant_id=e.tenant_id
    ),
    latest_workups AS (
      SELECT DISTINCT ON (w.encounter_id)
        w.id,w.encounter_id,w.version,w.author_id,w.saved_at,w.notes
      FROM app.workup_revision w
      JOIN accessible_encounters e ON e.id=w.encounter_id AND e.tenant_id=w.tenant_id
      ORDER BY w.encounter_id,w.version DESC
    ),
    activity AS (
      SELECT
        'appointment:'||a.id::text AS id,
        'appointment'::text AS kind,
        ((a.appointment_date+a.slot_time) AT TIME ZONE 'Asia/Karachi') AS at,
        ('Appointment with '||a.doctor)::text AS summary,
        a.clinic::text AS clinic,
        a.doctor::text AS author,
        a.status::text AS status,
        e.id AS "encounterId",
        jsonb_build_object('date',a.appointment_date,'time',a.slot_time) AS metadata
      FROM accessible_appointments a
      LEFT JOIN accessible_encounters e ON e.appointment_id=a.id

      UNION ALL
      SELECT
        'checkin:'||e.id::text,'checkin',e.checked_in_at,
        'Patient checked in',e.clinic,e.doctor,e.stage,e.id,
        jsonb_build_object('stage',e.stage,'closedAt',e.closed_at)
      FROM accessible_encounters e

      UNION ALL
      SELECT
        'workup:'||w.id::text,'workup',w.saved_at,
        ('Ophthalmic workup saved - version '||w.version)::text,
        e.clinic,u.full_name,'saved',e.id,
        jsonb_build_object('version',w.version,'notes',w.notes)
      FROM latest_workups w
      JOIN accessible_encounters e ON e.id=w.encounter_id
      JOIN app.user_account u ON u.id=w.author_id AND u.tenant_id=e.tenant_id

      UNION ALL
      SELECT
        'event:'||d.id::text,'doctor_event',coalesce(d.signed_at,d.updated_at),
        CASE WHEN d.complaint<>'' THEN d.complaint ELSE 'Doctor Event' END,
        e.clinic,u.full_name,d.status,e.id,
        jsonb_build_object('eventId',d.id,'signedAt',d.signed_at,'synthetic',d.synthetic)
      FROM app.doctor_event d
      JOIN accessible_encounters e ON e.id=d.encounter_id AND e.tenant_id=d.tenant_id
      JOIN app.user_account u ON u.id=d.author_id AND u.tenant_id=d.tenant_id

      UNION ALL
      SELECT
        'drawing:'||d.id::text,'drawing',coalesce(d.signed_at,d.updated_at),
        ('Clinical drawing - '||
          (jsonb_array_length(coalesce(d.drawings#>'{OD,strokes}','[]'::jsonb))
          +jsonb_array_length(coalesce(d.drawings#>'{OS,strokes}','[]'::jsonb))
          +jsonb_array_length(coalesce(d.drawings#>'{OD,markers}','[]'::jsonb))
          +jsonb_array_length(coalesce(d.drawings#>'{OS,markers}','[]'::jsonb)))
          ||' marks')::text,
        e.clinic,u.full_name,d.status,e.id,
        jsonb_build_object('eventId',d.id)
      FROM app.doctor_event d
      JOIN accessible_encounters e ON e.id=d.encounter_id AND e.tenant_id=d.tenant_id
      JOIN app.user_account u ON u.id=d.author_id AND u.tenant_id=d.tenant_id
      WHERE
        jsonb_array_length(coalesce(d.drawings#>'{OD,strokes}','[]'::jsonb))
        +jsonb_array_length(coalesce(d.drawings#>'{OS,strokes}','[]'::jsonb))
        +jsonb_array_length(coalesce(d.drawings#>'{OD,markers}','[]'::jsonb))
        +jsonb_array_length(coalesce(d.drawings#>'{OS,markers}','[]'::jsonb))>0

      UNION ALL
      SELECT
        'prescription:'||r.id::text,'prescription',coalesce(r.signed_at,r.updated_at),
        ('Prescription - '||(SELECT count(*) FROM app.prescription_item i WHERE i.prescription_id=r.id)||' item(s)')::text,
        e.clinic,u.full_name,r.status,e.id,
        jsonb_build_object('prescriptionId',r.id,'signedAt',r.signed_at,'synthetic',r.synthetic)
      FROM app.prescription r
      JOIN app.doctor_event d ON d.id=r.event_id AND d.tenant_id=r.tenant_id
      JOIN accessible_encounters e ON e.id=d.encounter_id AND e.tenant_id=d.tenant_id
      JOIN app.user_account u ON u.id=r.author_id AND u.tenant_id=r.tenant_id

      UNION ALL
      SELECT
        'evidence:'||v.id::text,'prescription_evidence',v.captured_at,
        ('Original prescription evidence - '||v.filename)::text,
        e.clinic,u.full_name,'attached',e.id,
        jsonb_build_object('prescriptionId',r.id,'filename',v.filename,'mime',v.mime)
      FROM app.prescription_evidence v
      JOIN app.prescription r ON r.id=v.prescription_id AND r.tenant_id=v.tenant_id
      JOIN app.doctor_event d ON d.id=r.event_id AND d.tenant_id=r.tenant_id
      JOIN accessible_encounters e ON e.id=d.encounter_id AND e.tenant_id=d.tenant_id
      JOIN app.user_account u ON u.id=v.actor_id AND u.tenant_id=v.tenant_id

      UNION ALL
      SELECT
        'addendum:'||a.id::text,'addendum',a.at,
        CASE WHEN a.event_id IS NOT NULL THEN 'Doctor Event addendum' ELSE 'Prescription addendum' END,
        e.clinic,u.full_name,'appended',e.id,
        jsonb_build_object('recordType',CASE WHEN a.event_id IS NOT NULL THEN 'doctor_event' ELSE 'prescription' END)
      FROM app.clinical_addendum a
      LEFT JOIN app.prescription r ON r.id=a.prescription_id AND r.tenant_id=a.tenant_id
      JOIN app.doctor_event d ON d.id=coalesce(a.event_id,r.event_id) AND d.tenant_id=a.tenant_id
      JOIN accessible_encounters e ON e.id=d.encounter_id AND e.tenant_id=d.tenant_id
      JOIN app.user_account u ON u.id=a.author_id AND u.tenant_id=a.tenant_id

      UNION ALL
      SELECT
        'consent:'||c.id::text,'consent',c.at,
        ('Surgical consent - '||c.eye||' / '||c.filename)::text,
        f.name,u.full_name,'recorded',e.id,
        jsonb_build_object('caseId',s.id,'eye',c.eye,'witness',c.witness)
      FROM app.consent_document c
      JOIN app.surgery_case s ON s.id=c.case_id AND s.tenant_id=c.tenant_id
      JOIN accessible_encounters e ON e.id=s.encounter_id AND e.tenant_id=s.tenant_id
      JOIN app.facility f ON f.id=s.facility_id AND f.tenant_id=s.tenant_id
      JOIN app.user_account u ON u.id=c.actor_id AND u.tenant_id=c.tenant_id

      UNION ALL
      SELECT
        'surgery:'||t.id::text,'surgery',t.at,
        ('Surgery pathway - '||CASE WHEN t.stage='estimate' THEN 'planning' ELSE t.stage END)::text,
        f.name,u.full_name,CASE WHEN t.stage='estimate' THEN 'planning' ELSE t.stage END,e.id,
        jsonb_build_object('caseId',s.id,'eye',t.eye,'procedure',s.procedure,'notes',t.notes)
      FROM app.surgery_transition t
      JOIN app.surgery_case s ON s.id=t.case_id AND s.tenant_id=t.tenant_id
      JOIN accessible_encounters e ON e.id=s.encounter_id AND e.tenant_id=s.tenant_id
      JOIN app.facility f ON f.id=s.facility_id AND f.tenant_id=s.tenant_id
      JOIN app.user_account u ON u.id=t.actor_id AND u.tenant_id=t.tenant_id

      UNION ALL
      SELECT
        'operation:'||n.id::text,'operation_note',n.updated_at,
        ('Operation note - '||n.procedure_performed)::text,
        f.name,u.full_name,'recorded',e.id,
        jsonb_build_object('caseId',s.id,'eye',n.eye,'iolModel',n.iol_model,'iolPower',n.iol_power)
      FROM app.surgery_operation_note n
      JOIN app.surgery_case s ON s.id=n.case_id AND s.tenant_id=n.tenant_id
      JOIN accessible_encounters e ON e.id=s.encounter_id AND e.tenant_id=s.tenant_id
      JOIN app.facility f ON f.id=s.facility_id AND f.tenant_id=s.tenant_id
      JOIN app.user_account u ON u.id=n.author_id AND u.tenant_id=n.tenant_id

      UNION ALL
      SELECT
        'followup:'||v.id::text,'surgery_followup',v.updated_at,
        ('Postoperative follow-up - '||replace(v.visit_type,'_',' '))::text,
        f.name,u.full_name,'recorded',e.id,
        jsonb_build_object('caseId',s.id,'eye',v.eye,'iop',v.iop,'nextReview',v.next_review)
      FROM app.surgery_followup v
      JOIN app.surgery_case s ON s.id=v.case_id AND s.tenant_id=v.tenant_id
      JOIN accessible_encounters e ON e.id=s.encounter_id AND e.tenant_id=s.tenant_id
      JOIN app.facility f ON f.id=s.facility_id AND f.tenant_id=s.tenant_id
      JOIN app.user_account u ON u.id=v.author_id AND u.tenant_id=v.tenant_id

      UNION ALL
      SELECT
        'problem:'||t.id::text,'problem',t.at,
        (p.eye||' - '||p.label||' - '||t.to_status)::text,
        e.clinic,u.full_name,t.to_status,e.id,
        jsonb_build_object('problemId',p.id,'fromStatus',t.from_status,'toStatus',t.to_status,'codeSystem',p.code_system,'code',p.code)
      FROM app.clinical_problem_transition t
      JOIN app.clinical_problem p ON p.id=t.problem_id AND p.tenant_id=t.tenant_id
      JOIN app.doctor_event d ON d.id=p.latest_event_id AND d.tenant_id=p.tenant_id
      JOIN accessible_encounters e ON e.id=d.encounter_id AND e.tenant_id=d.tenant_id
      JOIN app.user_account u ON u.id=t.actor_id AND u.tenant_id=t.tenant_id
    )
    SELECT id,kind,at,summary,clinic,author,status,"encounterId",metadata
    FROM activity
    ORDER BY at DESC,id DESC
    LIMIT 300
  `, [patientId, user.facilityIds]);
  return result.rows;
}
