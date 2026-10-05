-- Provision the first Glaucoma specialty examination and assign it to Glaucoma clinics.

CREATE FUNCTION app.glaucoma_template_definition() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,app AS $fn$
 SELECT $definition$
{
  "sections": [
    {
      "id": "glaucoma_history",
      "title": "Glaucoma history and treatment",
      "description": "Capture risk, prior treatment, and current therapy before assessing progression.",
      "fields": [
        {"id":"visit_reason","label":"Reason for attendance","type":"textarea","laterality":"none","required":true,"maxLength":1500,"roles":["doctor","nurse","optometrist"]},
        {"id":"glaucoma_diagnosis","label":"Glaucoma diagnosis context","type":"select","laterality":"bilateral","required":true,"options":["Not affected","Glaucoma suspect","Ocular hypertension","Primary open-angle glaucoma","Primary angle-closure glaucoma","Secondary glaucoma","Normal-tension glaucoma","Childhood glaucoma","Other glaucoma"],"roles":["doctor","optometrist"]},
        {"id":"family_history","label":"Family history of glaucoma","type":"select","laterality":"none","required":false,"options":["None known","First-degree relative","Other relative","Unknown"],"roles":["doctor","nurse","optometrist"]},
        {"id":"prior_glaucoma_procedures","label":"Prior laser or glaucoma surgery","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor","optometrist"]},
        {"id":"glaucoma_medications","label":"Current glaucoma medications","type":"textarea","laterality":"none","required":false,"maxLength":1500,"roles":["doctor","nurse","optometrist"]},
        {"id":"medication_adherence","label":"Medication adherence","type":"select","laterality":"none","required":true,"options":["Not applicable","Good","Variable","Poor","Unable to assess"],"roles":["doctor","nurse","optometrist"]}
      ]
    },
    {
      "id": "glaucoma_workup",
      "title": "Pressure, pachymetry and workup review",
      "description": "Measured IOP remains in the saved bilateral workup. Record the clinical target and interpretation here.",
      "fields": [
        {"id":"workup_reviewed","label":"Saved workup reviewed","type":"boolean","laterality":"none","required":true,"roles":["doctor","optometrist"]},
        {"id":"workup_interpretation","label":"Workup interpretation","type":"textarea","laterality":"none","required":true,"maxLength":1200,"roles":["doctor","optometrist"],"visibleWhen":{"fieldId":"workup_reviewed","operator":"equals","value":true}},
        {"id":"target_iop","label":"Target IOP","type":"number","laterality":"bilateral","required":false,"min":1,"max":60,"step":1,"unit":"mmHg","roles":["doctor"]},
        {"id":"central_corneal_thickness","label":"Central corneal thickness","type":"number","laterality":"bilateral","required":false,"min":300,"max":800,"step":1,"unit":"micrometres","roles":["doctor","optometrist"]}
      ]
    },
    {
      "id": "glaucoma_examination",
      "title": "Angle and optic nerve assessment",
      "description": "Document each eye independently and bind optic-disc drawings to this section.",
      "fields": [
        {"id":"gonioscopy_grade","label":"Gonioscopy grade","type":"select","laterality":"bilateral","required":true,"options":["Not assessed","0 - Closed","1 - Very narrow","2 - Narrow","3 - Open","4 - Wide open","Unable to assess"],"roles":["doctor"]},
        {"id":"cup_disc_ratio","label":"Vertical cup-to-disc ratio","type":"number","laterality":"bilateral","required":false,"min":0,"max":1,"step":0.05,"roles":["doctor","optometrist"]},
        {"id":"neuroretinal_rim","label":"Neuroretinal rim and optic-disc appearance","type":"textarea","laterality":"bilateral","required":true,"maxLength":1200,"roles":["doctor","optometrist"]},
        {"id":"disc_haemorrhage","label":"Disc haemorrhage","type":"select","laterality":"bilateral","required":true,"options":["Absent","Present","Unable to assess"],"roles":["doctor","optometrist"]},
        {"id":"anterior_segment","label":"Anterior segment and drainage-device findings","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor","optometrist"]}
      ]
    },
    {
      "id": "glaucoma_investigations",
      "title": "Visual field and OCT",
      "fields": [
        {"id":"visual_field_status","label":"Visual-field assessment","type":"select","laterality":"bilateral","required":true,"options":["Not available","Reliable and stable","Reliable with possible progression","Reliable with confirmed progression","Unreliable"],"roles":["doctor","optometrist"]},
        {"id":"visual_field_summary","label":"Visual-field summary","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor","optometrist"]},
        {"id":"oct_rnfl_status","label":"OCT RNFL assessment","type":"select","laterality":"bilateral","required":true,"options":["Not available","Within normal limits","Borderline","Stable loss","Possible progression","Confirmed progression","Unreliable"],"roles":["doctor","optometrist"]},
        {"id":"oct_rnfl_summary","label":"OCT RNFL / GCC summary","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor","optometrist"]},
        {"id":"optic_disc_photography","label":"Optic-disc photography reviewed","type":"boolean","laterality":"none","required":false,"roles":["doctor","optometrist"]}
      ]
    },
    {
      "id": "glaucoma_assessment",
      "title": "Stage and progression",
      "fields": [
        {"id":"glaucoma_stage","label":"Glaucoma stage","type":"select","laterality":"bilateral","required":true,"options":["Not applicable","Suspect","Mild","Moderate","Severe","End-stage","Indeterminate"],"roles":["doctor"]},
        {"id":"progression_status","label":"Progression status","type":"select","laterality":"bilateral","required":true,"options":["Not established","Stable","Possible progression","Confirmed progression"],"roles":["doctor"]},
        {"id":"pressure_assessment","label":"Pressure relative to target","type":"select","laterality":"bilateral","required":true,"options":["Target not set","At target","Above target","Below target","Unable to assess"],"roles":["doctor"]}
      ]
    },
    {
      "id": "glaucoma_management",
      "title": "Management and recall",
      "fields": [
        {"id":"treatment_change","label":"Treatment changed today","type":"boolean","laterality":"none","required":true,"roles":["doctor"]},
        {"id":"treatment_change_details","label":"Treatment change and rationale","type":"textarea","laterality":"none","required":true,"maxLength":1800,"roles":["doctor"],"visibleWhen":{"fieldId":"treatment_change","operator":"equals","value":true}},
        {"id":"laser_surgery_plan","label":"Laser or surgery plan","type":"textarea","laterality":"none","required":false,"maxLength":1500,"roles":["doctor"]},
        {"id":"follow_up_interval","label":"Follow-up interval","type":"select","laterality":"none","required":true,"options":["1 week","2-4 weeks","6-8 weeks","3 months","4 months","6 months","12 months","As needed"],"roles":["doctor"]},
        {"id":"next_investigation","label":"Investigation required before or at review","type":"select","laterality":"none","required":true,"options":["None","IOP check","Visual field","OCT RNFL / GCC","Optic-disc photography","Gonioscopy","Pachymetry","Multiple investigations"],"roles":["doctor"]},
        {"id":"safety_netting","label":"Safety-netting and escalation instructions","type":"textarea","laterality":"none","required":true,"maxLength":1200,"roles":["doctor"]}
      ]
    },
    {
      "id": "glaucoma_handoff",
      "title": "Team handoff",
      "fields": [
        {"id":"nursing_handoff","label":"Nursing handoff note","type":"textarea","laterality":"none","required":false,"maxLength":1000,"roles":["nurse"]},
        {"id":"optometry_handoff","label":"Optometry handoff note","type":"textarea","laterality":"none","required":false,"maxLength":1000,"roles":["optometrist"]}
      ]
    }
  ]
}
 $definition$::jsonb;
$fn$;

REVOKE ALL ON FUNCTION app.glaucoma_template_definition() FROM PUBLIC;

INSERT INTO app.examination_template
  (tenant_id,code,version,name,specialty,status,is_default,definition,published_at)
SELECT tenant.id,'glaucoma',1,'Glaucoma assessment','Glaucoma','published',false,
  app.glaucoma_template_definition(),now()
FROM app.tenant tenant
WHERE NOT EXISTS (
  SELECT 1 FROM app.examination_template template
  WHERE template.tenant_id=tenant.id AND template.code='glaucoma' AND template.version=1
);

UPDATE app.facility
SET specialty='Glaucoma'
WHERE type='clinic' AND lower(btrim(name))='glaucoma' AND specialty<>'Glaucoma';

INSERT INTO app.examination_template_assignment
  (tenant_id,template_id,facility_id,specialty,visit_type)
SELECT facility.tenant_id,template.id,facility.id,'Glaucoma',visit_type.name
FROM app.facility facility
JOIN app.examination_template template
  ON template.tenant_id=facility.tenant_id
 AND template.code='glaucoma'
 AND template.version=1
 AND template.status='published'
CROSS JOIN (VALUES ('general'),('new'),('follow_up')) AS visit_type(name)
WHERE facility.active
  AND facility.type='clinic'
  AND lower(facility.specialty)='glaucoma'
ON CONFLICT DO NOTHING;

CREATE FUNCTION app.provision_glaucoma_template() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $fn$
BEGIN
  INSERT INTO app.examination_template
    (tenant_id,code,version,name,specialty,status,is_default,definition,published_at)
  VALUES (
    NEW.id,'glaucoma',1,'Glaucoma assessment','Glaucoma','published',false,
    app.glaucoma_template_definition(),now()
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END
$fn$;

REVOKE ALL ON FUNCTION app.provision_glaucoma_template() FROM PUBLIC;

CREATE TRIGGER tenant_glaucoma_template
  AFTER INSERT ON app.tenant
  FOR EACH ROW EXECUTE FUNCTION app.provision_glaucoma_template();
