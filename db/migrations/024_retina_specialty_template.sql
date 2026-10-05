-- Provision the first Retina specialty examination and assign it to Retina clinics.

CREATE FUNCTION app.retina_template_definition() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,app AS $fn$
 SELECT $definition$
{
  "sections": [
    {
      "id": "retina_history",
      "title": "Retina history and risk",
      "description": "Capture the presenting problem, systemic risk, and previous retinal treatment.",
      "fields": [
        {"id":"visit_reason","label":"Reason for attendance","type":"textarea","laterality":"none","required":true,"maxLength":1500,"roles":["doctor","nurse","optometrist"]},
        {"id":"retina_diagnosis","label":"Retinal diagnosis context","type":"select","laterality":"bilateral","required":true,"options":["No retinal disease","Diabetic retinopathy","Diabetic macular oedema","Dry age-related macular degeneration","Neovascular age-related macular degeneration","Retinal vein occlusion","Retinal artery occlusion","Retinal tear","Retinal detachment","Epiretinal membrane","Vitreomacular traction","Macular hole","Other retinal disease"],"roles":["doctor","optometrist"]},
        {"id":"diabetes_status","label":"Diabetes status","type":"select","laterality":"none","required":true,"options":["No diabetes","Type 1 diabetes","Type 2 diabetes","Other diabetes","Unknown"],"roles":["doctor","nurse","optometrist"]},
        {"id":"systemic_risk_summary","label":"Systemic risk and control summary","type":"textarea","laterality":"none","required":false,"maxLength":1200,"roles":["doctor","nurse","optometrist"]},
        {"id":"prior_retina_treatment","label":"Previous injections, laser, or vitreoretinal surgery","type":"textarea","laterality":"bilateral","required":false,"maxLength":1500,"roles":["doctor","optometrist"]}
      ]
    },
    {
      "id": "retina_workup",
      "title": "Visual function and workup review",
      "description": "Review the saved visual acuity, refraction, and pressure measurements before documenting retinal findings.",
      "fields": [
        {"id":"workup_reviewed","label":"Saved workup reviewed","type":"boolean","laterality":"none","required":true,"roles":["doctor","optometrist"]},
        {"id":"workup_interpretation","label":"Visual function interpretation","type":"textarea","laterality":"none","required":true,"maxLength":1200,"roles":["doctor","optometrist"],"visibleWhen":{"fieldId":"workup_reviewed","operator":"equals","value":true}},
        {"id":"amsler_grid","label":"Amsler grid","type":"select","laterality":"bilateral","required":false,"options":["Not assessed","Normal","Metamorphopsia","Scotoma","Unable to assess"],"roles":["doctor","optometrist"]}
      ]
    },
    {
      "id": "retina_examination",
      "title": "Vitreous, macula and peripheral retina",
      "description": "Document each eye independently and bind fundus drawings to this section.",
      "fields": [
        {"id":"vitreous_status","label":"Vitreous status","type":"textarea","laterality":"bilateral","required":true,"maxLength":1000,"roles":["doctor","optometrist"]},
        {"id":"macula_status","label":"Macular findings","type":"textarea","laterality":"bilateral","required":true,"maxLength":1500,"roles":["doctor","optometrist"]},
        {"id":"retinal_vessels","label":"Retinal vessels","type":"textarea","laterality":"bilateral","required":false,"maxLength":1000,"roles":["doctor","optometrist"]},
        {"id":"peripheral_retina","label":"Peripheral retinal findings","type":"textarea","laterality":"bilateral","required":true,"maxLength":1500,"roles":["doctor","optometrist"]},
        {"id":"optic_disc","label":"Optic-disc findings","type":"textarea","laterality":"bilateral","required":false,"maxLength":1000,"roles":["doctor","optometrist"]},
        {"id":"fundus_drawing_reviewed","label":"Fundus drawing completed or reviewed","type":"boolean","laterality":"none","required":false,"roles":["doctor","optometrist"]}
      ]
    },
    {
      "id": "retina_imaging",
      "title": "OCT and retinal imaging",
      "fields": [
        {"id":"oct_macula_status","label":"OCT macula assessment","type":"select","laterality":"bilateral","required":true,"options":["Not available","Normal","Stable abnormality","Possible progression","Confirmed progression","Unable to interpret"],"roles":["doctor","optometrist"]},
        {"id":"central_subfield_thickness","label":"Central subfield thickness","type":"number","laterality":"bilateral","required":false,"min":50,"max":2000,"step":1,"unit":"micrometres","roles":["doctor","optometrist"]},
        {"id":"retinal_fluid","label":"Retinal fluid","type":"select","laterality":"bilateral","required":true,"options":["None","Intraretinal fluid","Subretinal fluid","Intraretinal and subretinal fluid","Sub-RPE fluid","Unable to assess"],"roles":["doctor","optometrist"]},
        {"id":"fundus_imaging_status","label":"Fundus photography or wide-field imaging","type":"select","laterality":"bilateral","required":false,"options":["Not available","Reviewed and stable","Reviewed with new findings","Poor quality","Not required"],"roles":["doctor","optometrist"]},
        {"id":"angiography_status","label":"Fluorescein or OCT angiography","type":"select","laterality":"bilateral","required":false,"options":["Not available","No leakage or ischaemia","Leakage","Ischaemia","Leakage and ischaemia","Unable to interpret","Not required"],"roles":["doctor"]},
        {"id":"imaging_summary","label":"Imaging summary","type":"textarea","laterality":"bilateral","required":false,"maxLength":1500,"roles":["doctor","optometrist"]}
      ]
    },
    {
      "id": "retina_assessment",
      "title": "Severity, activity and progression",
      "fields": [
        {"id":"retina_severity","label":"Retinal disease severity","type":"select","laterality":"bilateral","required":true,"options":["Not applicable","Mild","Moderate","Severe","Sight-threatening","Indeterminate"],"roles":["doctor"]},
        {"id":"retina_activity","label":"Disease activity","type":"select","laterality":"bilateral","required":true,"options":["Inactive","Active","Improving","Indeterminate","Not applicable"],"roles":["doctor"]},
        {"id":"retina_progression","label":"Progression status","type":"select","laterality":"bilateral","required":true,"options":["Not established","Stable","Possible progression","Confirmed progression","Improving"],"roles":["doctor"]},
        {"id":"retina_complication","label":"Urgent retinal complication","type":"select","laterality":"bilateral","required":true,"options":["None","New retinal tear","Retinal detachment","Vitreous haemorrhage","Endophthalmitis concern","Acute vascular occlusion","Other urgent finding"],"roles":["doctor"]}
      ]
    },
    {
      "id": "retina_management",
      "title": "Treatment and follow-up",
      "fields": [
        {"id":"retina_treatment_decision","label":"Treatment decision","type":"select","laterality":"none","required":true,"options":["Observe","Intravitreal injection","Retinal laser","Vitreoretinal surgery","Urgent referral","Other treatment"],"roles":["doctor"]},
        {"id":"treatment_laterality","label":"Treatment laterality","type":"select","laterality":"none","required":true,"options":["Not applicable","OD","OS","OU"],"roles":["doctor"]},
        {"id":"injection_plan","label":"Intravitreal injection plan","type":"textarea","laterality":"none","required":true,"maxLength":1500,"roles":["doctor"],"visibleWhen":{"fieldId":"retina_treatment_decision","operator":"equals","value":"Intravitreal injection"}},
        {"id":"laser_plan","label":"Retinal laser plan","type":"textarea","laterality":"none","required":true,"maxLength":1500,"roles":["doctor"],"visibleWhen":{"fieldId":"retina_treatment_decision","operator":"equals","value":"Retinal laser"}},
        {"id":"surgery_referral_plan","label":"Surgery or urgent referral plan","type":"textarea","laterality":"none","required":false,"maxLength":1500,"roles":["doctor"]},
        {"id":"follow_up_interval","label":"Follow-up interval","type":"select","laterality":"none","required":true,"options":["Same day","1 week","2-4 weeks","6-8 weeks","3 months","4 months","6 months","12 months","As needed"],"roles":["doctor"]},
        {"id":"next_retina_investigation","label":"Investigation required before or at review","type":"select","laterality":"none","required":true,"options":["None","OCT macula","Fundus photography","Wide-field imaging","Fluorescein angiography","OCT angiography","B-scan ultrasound","Multiple investigations"],"roles":["doctor"]},
        {"id":"safety_netting","label":"Safety-netting and escalation instructions","type":"textarea","laterality":"none","required":true,"maxLength":1200,"roles":["doctor"]}
      ]
    },
    {
      "id": "retina_handoff",
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

REVOKE ALL ON FUNCTION app.retina_template_definition() FROM PUBLIC;

INSERT INTO app.examination_template
  (tenant_id,code,version,name,specialty,status,is_default,definition,published_at)
SELECT tenant.id,'retina',1,'Retina assessment','Retina','published',false,
  app.retina_template_definition(),now()
FROM app.tenant tenant
WHERE NOT EXISTS (
  SELECT 1 FROM app.examination_template template
  WHERE template.tenant_id=tenant.id AND template.code='retina' AND template.version=1
);

UPDATE app.facility
SET specialty='Retina'
WHERE type='clinic' AND lower(btrim(name))='retina' AND specialty<>'Retina';

INSERT INTO app.examination_template_assignment
  (tenant_id,template_id,facility_id,specialty,visit_type)
SELECT facility.tenant_id,template.id,facility.id,'Retina',visit_type.name
FROM app.facility facility
JOIN app.examination_template template
  ON template.tenant_id=facility.tenant_id
 AND template.code='retina'
 AND template.version=1
 AND template.status='published'
CROSS JOIN (VALUES ('general'),('new'),('follow_up')) AS visit_type(name)
WHERE facility.active
  AND facility.type='clinic'
  AND lower(facility.specialty)='retina'
ON CONFLICT DO NOTHING;

CREATE FUNCTION app.provision_retina_template() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $fn$
BEGIN
  INSERT INTO app.examination_template
    (tenant_id,code,version,name,specialty,status,is_default,definition,published_at)
  VALUES (
    NEW.id,'retina',1,'Retina assessment','Retina','published',false,
    app.retina_template_definition(),now()
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END
$fn$;

REVOKE ALL ON FUNCTION app.provision_retina_template() FROM PUBLIC;

CREATE TRIGGER tenant_retina_template
  AFTER INSERT ON app.tenant
  FOR EACH ROW EXECUTE FUNCTION app.provision_retina_template();
