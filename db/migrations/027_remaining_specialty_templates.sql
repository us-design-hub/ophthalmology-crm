-- Complete the initial specialty template set and provision Cornea and Optometry clinics.

CREATE FUNCTION app.cornea_template_definition() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,app AS $fn$
 SELECT $definition$
{
  "sections": [
    {"id":"cornea_history","title":"Cornea history and risk","description":"Capture the presenting problem, contact-lens history, and previous corneal treatment.","fields":[
      {"id":"visit_reason","label":"Reason for attendance","type":"textarea","laterality":"none","required":true,"maxLength":1500,"roles":["doctor","nurse","optometrist"]},
      {"id":"corneal_diagnosis_context","label":"Corneal diagnosis context","type":"select","laterality":"bilateral","required":true,"options":["No corneal disease","Dry eye or ocular surface disease","Keratitis","Corneal ulcer","Keratoconus or ectasia","Dystrophy or degeneration","Graft or transplant follow-up","Trauma","Post-refractive surgery","Other corneal disease"],"roles":["doctor","optometrist"]},
      {"id":"contact_lens_use","label":"Contact-lens use","type":"select","laterality":"none","required":true,"options":["None","Soft lenses","Rigid gas-permeable lenses","Scleral lenses","Therapeutic lens","Unknown"],"roles":["doctor","nurse","optometrist"]},
      {"id":"prior_corneal_procedures","label":"Previous corneal procedures","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor","optometrist"]},
      {"id":"corneal_risk_summary","label":"Risk and medication summary","type":"textarea","laterality":"none","required":false,"maxLength":1200,"roles":["doctor","nurse","optometrist"]}
    ]},
    {"id":"cornea_workup","title":"Visual function and corneal measurements","description":"Review the saved workup and record measurements used for longitudinal comparison.","fields":[
      {"id":"workup_reviewed","label":"Saved workup reviewed","type":"boolean","laterality":"none","required":true,"roles":["doctor","optometrist"]},
      {"id":"workup_interpretation","label":"Visual function interpretation","type":"textarea","laterality":"none","required":true,"maxLength":1200,"roles":["doctor","optometrist"],"visibleWhen":{"fieldId":"workup_reviewed","operator":"equals","value":true}},
      {"id":"central_corneal_thickness","label":"Central corneal thickness","type":"number","laterality":"bilateral","required":false,"min":300,"max":800,"step":1,"unit":"micrometres","roles":["doctor","optometrist"]},
      {"id":"corneal_topography_status","label":"Topography or tomography assessment","type":"select","laterality":"bilateral","required":true,"options":["Not available","Normal","Stable abnormality","Possible progression","Confirmed progression","Poor quality","Not required"],"roles":["doctor","optometrist"]},
      {"id":"corneal_sensation","label":"Corneal sensation","type":"select","laterality":"bilateral","required":false,"options":["Not assessed","Normal","Reduced","Absent","Unable to assess"],"roles":["doctor","optometrist"]}
    ]},
    {"id":"cornea_examination","title":"Ocular surface and corneal examination","description":"Document each corneal layer and the anterior chamber independently by eye.","fields":[
      {"id":"tear_film_lids","label":"Tear film, lids, and adnexa","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor","optometrist"]},
      {"id":"conjunctiva_sclera","label":"Conjunctiva and sclera","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor","optometrist"]},
      {"id":"corneal_epithelium","label":"Corneal epithelium","type":"textarea","laterality":"bilateral","required":true,"maxLength":1500,"roles":["doctor","optometrist"]},
      {"id":"corneal_stroma","label":"Corneal stroma","type":"textarea","laterality":"bilateral","required":true,"maxLength":1500,"roles":["doctor","optometrist"]},
      {"id":"corneal_endothelium","label":"Endothelium and Descemet membrane","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor","optometrist"]},
      {"id":"fluorescein_staining","label":"Fluorescein staining","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor","optometrist"]},
      {"id":"anterior_chamber","label":"Anterior chamber","type":"textarea","laterality":"bilateral","required":true,"maxLength":1200,"roles":["doctor","optometrist"]}
    ]},
    {"id":"cornea_assessment","title":"Severity, activity, and graft status","fields":[
      {"id":"corneal_severity","label":"Corneal disease severity","type":"select","laterality":"bilateral","required":true,"options":["Not applicable","Mild","Moderate","Severe","Sight-threatening","Indeterminate"],"roles":["doctor"]},
      {"id":"corneal_activity","label":"Disease activity","type":"select","laterality":"bilateral","required":true,"options":["Inactive","Active","Improving","Indeterminate","Not applicable"],"roles":["doctor"]},
      {"id":"corneal_progression","label":"Progression status","type":"select","laterality":"bilateral","required":true,"options":["Not established","Stable","Possible progression","Confirmed progression","Improving"],"roles":["doctor"]},
      {"id":"graft_status","label":"Corneal graft status","type":"select","laterality":"bilateral","required":true,"options":["No graft","Clear and stable","Possible rejection","Confirmed rejection","Graft failure","Unable to assess"],"roles":["doctor"]},
      {"id":"urgent_corneal_complication","label":"Urgent corneal complication","type":"select","laterality":"bilateral","required":true,"options":["None","Microbial keratitis concern","Impending or actual perforation","Acute graft rejection","Chemical injury","Other urgent finding"],"roles":["doctor"]}
    ]},
    {"id":"cornea_management","title":"Treatment and follow-up","fields":[
      {"id":"cornea_treatment_decision","label":"Treatment decision","type":"select","laterality":"none","required":true,"options":["Observe","Medical treatment","Contact-lens management","Corneal procedure","Surgery planning","Urgent referral"],"roles":["doctor"]},
      {"id":"cornea_treatment_plan","label":"Treatment or procedure plan","type":"textarea","laterality":"none","required":true,"maxLength":1500,"roles":["doctor"],"visibleWhen":{"fieldId":"cornea_treatment_decision","operator":"answered"}},
      {"id":"follow_up_interval","label":"Follow-up interval","type":"select","laterality":"none","required":true,"options":["Same day","24-48 hours","1 week","2-4 weeks","6-8 weeks","3 months","6 months","12 months","As needed"],"roles":["doctor"]},
      {"id":"next_corneal_investigation","label":"Investigation required before or at review","type":"select","laterality":"none","required":true,"options":["None","Pachymetry","Topography or tomography","Anterior-segment OCT","Specular microscopy","Microbiology","Multiple investigations"],"roles":["doctor"]},
      {"id":"safety_netting","label":"Safety-netting and escalation instructions","type":"textarea","laterality":"none","required":true,"maxLength":1200,"roles":["doctor"]}
    ]},
    {"id":"cornea_handoff","title":"Team handoff","fields":[
      {"id":"nursing_handoff","label":"Nursing handoff note","type":"textarea","laterality":"none","required":false,"maxLength":1000,"roles":["nurse"]},
      {"id":"optometry_handoff","label":"Optometry handoff note","type":"textarea","laterality":"none","required":false,"maxLength":1000,"roles":["optometrist"]}
    ]}
  ]
}
 $definition$::jsonb;
$fn$;

CREATE FUNCTION app.optometry_template_definition() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,app AS $fn$
 SELECT $definition$
{
  "sections": [
    {"id":"optometry_history","title":"Visual needs and optometry history","fields":[
      {"id":"visit_reason","label":"Reason for attendance","type":"textarea","laterality":"none","required":true,"maxLength":1500,"roles":["doctor","nurse","optometrist"]},
      {"id":"visual_needs","label":"Visual needs and occupation","type":"textarea","laterality":"none","required":true,"maxLength":1200,"roles":["doctor","optometrist"]},
      {"id":"current_eyewear","label":"Current eyewear and wearing history","type":"textarea","laterality":"none","required":false,"maxLength":1200,"roles":["doctor","optometrist"]},
      {"id":"contact_lens_history","label":"Contact-lens history","type":"textarea","laterality":"none","required":false,"maxLength":1200,"roles":["doctor","optometrist"]},
      {"id":"visual_symptoms","label":"Visual symptoms","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor","nurse","optometrist"]}
    ]},
    {"id":"optometry_refraction","title":"Refraction and best-corrected vision","description":"Record the interpretation of the signed workup and the final subjective refraction by eye.","fields":[
      {"id":"workup_reviewed","label":"Saved workup reviewed","type":"boolean","laterality":"none","required":true,"roles":["doctor","optometrist"]},
      {"id":"subjective_refraction","label":"Subjective refraction","type":"text","laterality":"bilateral","required":true,"maxLength":180,"roles":["doctor","optometrist"]},
      {"id":"best_corrected_va","label":"Best-corrected visual acuity","type":"select","laterality":"bilateral","required":true,"options":["6/4","6/5","6/6","6/9","6/12","6/18","6/24","6/36","6/60","3/60","1/60","CF","HM","PL","NPL","Not tested"],"roles":["doctor","optometrist"]},
      {"id":"near_add","label":"Near addition","type":"number","laterality":"bilateral","required":false,"min":0,"max":6,"step":0.25,"unit":"D","roles":["doctor","optometrist"]},
      {"id":"refraction_outcome","label":"Refraction outcome","type":"select","laterality":"none","required":true,"options":["No change","Improved with refraction","Limited by ocular pathology","Unreliable result","Unable to complete"],"roles":["doctor","optometrist"]}
    ]},
    {"id":"binocular_vision","title":"Binocular vision and ocular motility","fields":[
      {"id":"cover_test_distance","label":"Cover test at distance","type":"text","laterality":"none","required":false,"maxLength":300,"roles":["doctor","optometrist"]},
      {"id":"cover_test_near","label":"Cover test at near","type":"text","laterality":"none","required":false,"maxLength":300,"roles":["doctor","optometrist"]},
      {"id":"ocular_motility","label":"Ocular motility","type":"textarea","laterality":"bilateral","required":false,"maxLength":1000,"roles":["doctor","optometrist"]},
      {"id":"stereoacuity","label":"Stereoacuity","type":"text","laterality":"none","required":false,"maxLength":200,"roles":["doctor","optometrist"]},
      {"id":"accommodation_convergence","label":"Accommodation and convergence","type":"textarea","laterality":"none","required":false,"maxLength":800,"roles":["doctor","optometrist"]}
    ]},
    {"id":"contact_lens_assessment","title":"Contact-lens assessment","fields":[
      {"id":"contact_lens_assessed","label":"Contact lenses assessed","type":"boolean","laterality":"none","required":true,"roles":["doctor","optometrist"]},
      {"id":"contact_lens_fit","label":"Lens type, fit, and ocular response","type":"textarea","laterality":"bilateral","required":true,"maxLength":1200,"roles":["doctor","optometrist"],"visibleWhen":{"fieldId":"contact_lens_assessed","operator":"equals","value":true}},
      {"id":"contact_lens_plan","label":"Contact-lens plan and hygiene advice","type":"textarea","laterality":"none","required":true,"maxLength":1200,"roles":["doctor","optometrist"],"visibleWhen":{"fieldId":"contact_lens_assessed","operator":"equals","value":true}}
    ]},
    {"id":"optometry_outcome","title":"Prescription, referral, and follow-up","fields":[
      {"id":"spectacle_prescription_issued","label":"Spectacle prescription issued","type":"boolean","laterality":"none","required":true,"roles":["doctor","optometrist"]},
      {"id":"prescription_type","label":"Prescription type","type":"select","laterality":"none","required":true,"options":["Distance","Near","Bifocal","Progressive","Occupational","Prism","Not applicable"],"roles":["doctor","optometrist"],"visibleWhen":{"fieldId":"spectacle_prescription_issued","operator":"equals","value":true}},
      {"id":"clinical_referral_required","label":"Clinical referral required","type":"boolean","laterality":"none","required":true,"roles":["doctor","optometrist"]},
      {"id":"clinical_referral_reason","label":"Referral reason and urgency","type":"textarea","laterality":"none","required":true,"maxLength":1200,"roles":["doctor","optometrist"],"visibleWhen":{"fieldId":"clinical_referral_required","operator":"equals","value":true}},
      {"id":"follow_up_interval","label":"Follow-up interval","type":"select","laterality":"none","required":true,"options":["Same day","1 week","2-4 weeks","3 months","6 months","12 months","24 months","As needed"],"roles":["doctor","optometrist"]},
      {"id":"optometry_safety_netting","label":"Advice and safety-netting","type":"textarea","laterality":"none","required":true,"maxLength":1200,"roles":["doctor","optometrist"]}
    ]},
    {"id":"optometry_handoff","title":"Team handoff","fields":[
      {"id":"nursing_handoff","label":"Nursing handoff note","type":"textarea","laterality":"none","required":false,"maxLength":1000,"roles":["nurse"]},
      {"id":"optometry_handoff_note","label":"Optometry handoff note","type":"textarea","laterality":"none","required":false,"maxLength":1000,"roles":["optometrist"]}
    ]}
  ]
}
 $definition$::jsonb;
$fn$;

CREATE FUNCTION app.general_follow_up_template_definition() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,app AS $fn$
 SELECT $definition$
{
  "sections": [
    {"id":"follow_up_history","title":"Interval history and treatment adherence","fields":[
      {"id":"visit_reason","label":"Reason for follow-up","type":"textarea","laterality":"none","required":true,"maxLength":1500,"roles":["doctor","nurse","optometrist"]},
      {"id":"symptom_change","label":"Change since the previous visit","type":"select","laterality":"none","required":true,"options":["Improved","Stable","Worse","New symptoms","Unable to determine"],"roles":["doctor","nurse","optometrist"]},
      {"id":"interval_history","label":"Interval ocular and systemic history","type":"textarea","laterality":"none","required":true,"maxLength":1800,"roles":["doctor","nurse","optometrist"]},
      {"id":"treatment_adherence","label":"Treatment adherence","type":"select","laterality":"none","required":true,"options":["Not applicable","As prescribed","Partial","Not taking","Unable to determine"],"roles":["doctor","nurse","optometrist"]},
      {"id":"adverse_effects","label":"Adverse effects or treatment concerns","type":"textarea","laterality":"none","required":false,"maxLength":1200,"roles":["doctor","nurse","optometrist"]}
    ]},
    {"id":"follow_up_workup","title":"Workup and investigation review","fields":[
      {"id":"workup_reviewed","label":"Saved workup reviewed","type":"boolean","laterality":"none","required":true,"roles":["doctor","optometrist"]},
      {"id":"workup_interpretation","label":"Change in visual acuity, pressure, or refraction","type":"textarea","laterality":"none","required":true,"maxLength":1200,"roles":["doctor","optometrist"],"visibleWhen":{"fieldId":"workup_reviewed","operator":"equals","value":true}},
      {"id":"prior_investigations_reviewed","label":"Previous investigations reviewed","type":"boolean","laterality":"none","required":true,"roles":["doctor","optometrist"]},
      {"id":"investigation_interpretation","label":"Investigation interpretation","type":"textarea","laterality":"none","required":true,"maxLength":1200,"roles":["doctor","optometrist"],"visibleWhen":{"fieldId":"prior_investigations_reviewed","operator":"equals","value":true}}
    ]},
    {"id":"follow_up_examination","title":"Focused bilateral examination","fields":[
      {"id":"anterior_segment","label":"Anterior segment","type":"textarea","laterality":"bilateral","required":true,"maxLength":1500,"roles":["doctor","optometrist"]},
      {"id":"lens_status","label":"Lens and cataract","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor","optometrist"]},
      {"id":"fundus_status","label":"Fundus and macula","type":"textarea","laterality":"bilateral","required":true,"maxLength":1500,"roles":["doctor","optometrist"]},
      {"id":"optic_disc_status","label":"Optic disc","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor","optometrist"]}
    ]},
    {"id":"follow_up_assessment","title":"Clinical course and response","fields":[
      {"id":"clinical_course","label":"Clinical course","type":"select","laterality":"bilateral","required":true,"options":["Resolved","Improving","Stable","Possible progression","Confirmed progression","New finding","Indeterminate"],"roles":["doctor"]},
      {"id":"treatment_response","label":"Treatment response","type":"select","laterality":"bilateral","required":true,"options":["Not applicable","Good","Partial","Poor","Intolerant","Indeterminate"],"roles":["doctor"]},
      {"id":"new_clinical_concern","label":"New clinical concern","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor"]}
    ]},
    {"id":"follow_up_management","title":"Management and recall","fields":[
      {"id":"management_decision","label":"Management decision","type":"select","laterality":"none","required":true,"options":["Continue unchanged","Change treatment","Further investigation","Procedure planning","Surgery planning","External referral","Discharge"],"roles":["doctor"]},
      {"id":"management_plan","label":"Management plan","type":"textarea","laterality":"none","required":true,"maxLength":1500,"roles":["doctor"],"visibleWhen":{"fieldId":"management_decision","operator":"answered"}},
      {"id":"follow_up_interval","label":"Follow-up interval","type":"select","laterality":"none","required":true,"options":["Same day","1 week","2-4 weeks","6-8 weeks","3 months","6 months","12 months","As needed","Discharged"],"roles":["doctor"]},
      {"id":"next_investigation","label":"Investigation required before or at review","type":"textarea","laterality":"none","required":false,"maxLength":1000,"roles":["doctor"]},
      {"id":"safety_netting","label":"Safety-netting and escalation instructions","type":"textarea","laterality":"none","required":true,"maxLength":1200,"roles":["doctor"]}
    ]},
    {"id":"follow_up_handoff","title":"Team handoff","fields":[
      {"id":"nursing_handoff","label":"Nursing handoff note","type":"textarea","laterality":"none","required":false,"maxLength":1000,"roles":["nurse"]},
      {"id":"optometry_handoff","label":"Optometry handoff note","type":"textarea","laterality":"none","required":false,"maxLength":1000,"roles":["optometrist"]}
    ]}
  ]
}
 $definition$::jsonb;
$fn$;

REVOKE ALL ON FUNCTION app.cornea_template_definition() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.optometry_template_definition() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.general_follow_up_template_definition() FROM PUBLIC;

INSERT INTO app.examination_template
  (tenant_id,code,version,name,specialty,status,is_default,definition,published_at)
SELECT tenant.id,definition.code,1,definition.name,definition.specialty,'published',false,definition.body,now()
FROM app.tenant tenant
CROSS JOIN LATERAL (VALUES
  ('cornea','Cornea assessment','Cornea',app.cornea_template_definition()),
  ('optometry','Optometry assessment','Optometry',app.optometry_template_definition()),
  ('general-follow-up','General follow-up assessment','Ophthalmology',app.general_follow_up_template_definition())
) AS definition(code,name,specialty,body)
ON CONFLICT (tenant_id,code,version) DO NOTHING;

INSERT INTO app.facility(tenant_id,name,type,specialty,pathway_steps,pathway_target_minutes)
SELECT tenant.id,clinic.name,'clinic',clinic.specialty,clinic.steps,clinic.target_minutes
FROM app.tenant tenant
CROSS JOIN (VALUES
  ('Cornea','Cornea',ARRAY['workup','testing']::text[],35),
  ('Optometry','Optometry',ARRAY['workup']::text[],25)
) AS clinic(name,specialty,steps,target_minutes)
ON CONFLICT (tenant_id,name) DO NOTHING;

UPDATE app.facility facility
SET specialty=clinic.specialty,
    pathway_steps=clinic.steps,
    pathway_target_minutes=clinic.target_minutes
FROM (VALUES
  ('Cornea','Cornea',ARRAY['workup','testing']::text[],35),
  ('Optometry','Optometry',ARRAY['workup']::text[],25)
) AS clinic(name,specialty,steps,target_minutes)
WHERE facility.type='clinic' AND lower(btrim(facility.name))=lower(clinic.name);

INSERT INTO app.clinic_schedule(tenant_id,facility_id,start_minute,end_minute,slot_minutes)
SELECT tenant_id,id,540,1020,15 FROM app.facility
WHERE active AND type='clinic' AND lower(specialty) IN ('cornea','optometry')
ON CONFLICT DO NOTHING;

INSERT INTO app.clinic_doctor(tenant_id,facility_id,doctor_id)
SELECT facility.tenant_id,facility.id,account.id
FROM app.facility facility
JOIN app.user_account account ON account.tenant_id=facility.tenant_id AND account.status='active'
JOIN app.user_role role ON role.tenant_id=account.tenant_id AND role.user_id=account.id AND role.role_code='doctor'
WHERE facility.active AND facility.type='clinic' AND lower(facility.specialty) IN ('cornea','optometry')
ON CONFLICT DO NOTHING;

INSERT INTO app.user_facility(tenant_id,user_id,facility_id)
SELECT facility.tenant_id,account.id,facility.id
FROM app.facility facility
JOIN app.user_account account ON account.tenant_id=facility.tenant_id AND account.status='active'
WHERE facility.active AND facility.type='clinic' AND lower(facility.specialty) IN ('cornea','optometry')
  AND EXISTS (
    SELECT 1 FROM app.user_role role
    WHERE role.tenant_id=account.tenant_id AND role.user_id=account.id
      AND role.role_code IN ('receptionist','nurse','optometrist','doctor','hospital_admin')
  )
ON CONFLICT DO NOTHING;

INSERT INTO app.examination_template_assignment
  (tenant_id,template_id,facility_id,specialty,visit_type)
SELECT facility.tenant_id,template.id,facility.id,facility.specialty,visit_type.name
FROM app.facility facility
JOIN app.examination_template template
  ON template.tenant_id=facility.tenant_id
 AND template.code=lower(facility.specialty)
 AND template.version=1
 AND template.status='published'
CROSS JOIN (VALUES ('general'),('new'),('follow_up')) AS visit_type(name)
WHERE facility.active AND facility.type='clinic' AND lower(facility.specialty) IN ('cornea','optometry')
ON CONFLICT DO NOTHING;

UPDATE app.examination_template_assignment assignment
SET template_id=template.id,specialty='Ophthalmology',updated_at=now()
FROM app.facility facility
JOIN app.examination_template template
  ON template.tenant_id=facility.tenant_id
 AND template.code='general-follow-up'
 AND template.version=1
 AND template.status='published'
WHERE assignment.tenant_id=facility.tenant_id
  AND assignment.facility_id=facility.id
  AND assignment.visit_type='follow_up'
  AND assignment.active
  AND facility.active
  AND facility.type='clinic'
  AND lower(btrim(facility.name))='general ophthalmology';

INSERT INTO app.examination_template_assignment
  (tenant_id,template_id,facility_id,specialty,visit_type)
SELECT facility.tenant_id,template.id,facility.id,'Ophthalmology','follow_up'
FROM app.facility facility
JOIN app.examination_template template
  ON template.tenant_id=facility.tenant_id
 AND template.code='general-follow-up'
 AND template.version=1
 AND template.status='published'
WHERE facility.active AND facility.type='clinic' AND lower(btrim(facility.name))='general ophthalmology'
  AND NOT EXISTS (
    SELECT 1 FROM app.examination_template_assignment assignment
    WHERE assignment.tenant_id=facility.tenant_id
      AND assignment.facility_id=facility.id
      AND assignment.specialty='Ophthalmology'
      AND assignment.visit_type='follow_up'
      AND assignment.active
  );

CREATE FUNCTION app.provision_remaining_specialty_templates() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $fn$
BEGIN
  INSERT INTO app.examination_template
    (tenant_id,code,version,name,specialty,status,is_default,definition,published_at)
  VALUES
    (NEW.id,'cornea',1,'Cornea assessment','Cornea','published',false,app.cornea_template_definition(),now()),
    (NEW.id,'optometry',1,'Optometry assessment','Optometry','published',false,app.optometry_template_definition(),now()),
    (NEW.id,'general-follow-up',1,'General follow-up assessment','Ophthalmology','published',false,app.general_follow_up_template_definition(),now())
  ON CONFLICT (tenant_id,code,version) DO NOTHING;
  RETURN NEW;
END
$fn$;

REVOKE ALL ON FUNCTION app.provision_remaining_specialty_templates() FROM PUBLIC;

CREATE TRIGGER tenant_remaining_specialty_templates
  AFTER INSERT ON app.tenant
  FOR EACH ROW EXECUTE FUNCTION app.provision_remaining_specialty_templates();
