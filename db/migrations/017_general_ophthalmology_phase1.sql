-- Complete the Phase 1 General Ophthalmology baseline and make it the active assignment.
INSERT INTO app.examination_template
  (tenant_id, code, version, name, specialty, status, is_default, definition, published_at)
SELECT
  t.id,
  'general-ophthalmology',
  2,
  'General Ophthalmology',
  'Ophthalmology',
  'published',
  false,
  $definition$
  {
    "sections": [
      {
        "id": "visit_history",
        "title": "Presenting complaint and history",
        "description": "Capture the reason for attendance and relevant ocular and systemic context.",
        "fields": [
          {"id":"visit_reason","label":"Reason for attendance","type":"textarea","laterality":"none","required":true,"maxLength":1500,"roles":["doctor","nurse","optometrist"]},
          {"id":"symptom_onset","label":"Onset and duration","type":"text","laterality":"none","required":false,"maxLength":200,"roles":["doctor","nurse","optometrist"]},
          {"id":"ocular_history","label":"Ocular history","type":"textarea","laterality":"none","required":false,"maxLength":2000,"roles":["doctor","optometrist"]},
          {"id":"systemic_history","label":"Systemic history","type":"textarea","laterality":"none","required":false,"maxLength":2000,"roles":["doctor","nurse","optometrist"]},
          {"id":"medication_history","label":"Medication and allergy review","type":"textarea","laterality":"none","required":false,"maxLength":1500,"roles":["doctor","nurse","optometrist"]}
        ]
      },
      {
        "id": "workup_review",
        "title": "Visual acuity, pressure and refraction review",
        "description": "The measured workup remains in its signed revision; record the clinical review here.",
        "fields": [
          {"id":"workup_reviewed","label":"Workup reviewed","type":"boolean","laterality":"none","required":false,"roles":["doctor","optometrist"]},
          {"id":"workup_comment","label":"Workup interpretation","type":"textarea","laterality":"none","required":false,"maxLength":1200,"roles":["doctor","optometrist"],"visibleWhen":{"fieldId":"workup_reviewed","operator":"equals","value":true}}
        ]
      },
      {
        "id": "anterior_segment",
        "title": "Anterior segment examination",
        "description": "Document OD and OS separately.",
        "fields": [
          {"id":"lids_adnexa","label":"Lids and adnexa","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor","optometrist"]},
          {"id":"conjunctiva","label":"Conjunctiva and sclera","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor","optometrist"]},
          {"id":"cornea","label":"Cornea","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor","optometrist"]},
          {"id":"anterior_chamber","label":"Anterior chamber","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor","optometrist"]},
          {"id":"iris","label":"Iris and pupil","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor","optometrist"]},
          {"id":"lens","label":"Lens and cataract","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor","optometrist"]}
        ]
      },
      {
        "id": "posterior_segment",
        "title": "Posterior segment and motility",
        "description": "Record vitreous, retina, macula, disc and motility findings by eye.",
        "fields": [
          {"id":"vitreous","label":"Vitreous","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor","optometrist"]},
          {"id":"fundus","label":"Fundus and retina","type":"textarea","laterality":"bilateral","required":false,"maxLength":2000,"roles":["doctor","optometrist"]},
          {"id":"macula","label":"Macula","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor","optometrist"]},
          {"id":"optic_disc","label":"Optic disc","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor","optometrist"]},
          {"id":"gonioscopy","label":"Gonioscopy","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor"]},
          {"id":"motility","label":"Motility and alignment","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor","optometrist"]}
        ]
      },
      {
        "id": "investigations",
        "title": "Investigations",
        "fields": [
          {"id":"investigation_required","label":"Investigation required","type":"boolean","laterality":"none","required":false,"roles":["doctor","optometrist"]},
          {"id":"requested_investigations","label":"Requested investigations","type":"textarea","laterality":"none","required":true,"maxLength":1500,"roles":["doctor","optometrist"],"visibleWhen":{"fieldId":"investigation_required","operator":"equals","value":true}}
        ]
      },
      {
        "id": "outcome",
        "title": "Diagnosis, management and outcome",
        "description": "Diagnoses and anatomy-linked plans remain structured elsewhere in the Doctor Event.",
        "fields": [
          {"id":"visit_outcome","label":"Visit outcome","type":"select","laterality":"none","required":true,"options":["Follow-up","Discharge","Investigation","Procedure planning","Surgery planning","External referral"],"roles":["doctor"]},
          {"id":"next_steps","label":"Management and next steps","type":"textarea","laterality":"none","required":true,"maxLength":1500,"roles":["doctor"],"visibleWhen":{"fieldId":"visit_outcome","operator":"answered"}},
          {"id":"recall_interval","label":"Recall interval","type":"text","laterality":"none","required":true,"maxLength":120,"roles":["doctor"],"visibleWhen":{"fieldId":"visit_outcome","operator":"equals","value":"Follow-up"}},
          {"id":"referral_details","label":"External referral details","type":"textarea","laterality":"none","required":true,"maxLength":1000,"roles":["doctor"],"visibleWhen":{"fieldId":"visit_outcome","operator":"equals","value":"External referral"}},
          {"id":"surgery_plan","label":"Surgery planning notes","type":"textarea","laterality":"none","required":true,"maxLength":1200,"roles":["doctor"],"visibleWhen":{"fieldId":"visit_outcome","operator":"equals","value":"Surgery planning"}}
        ]
      },
      {
        "id": "team_handoff",
        "title": "Team handoff",
        "fields": [
          {"id":"nursing_handoff","label":"Nursing handoff note","type":"textarea","laterality":"none","required":false,"maxLength":1000,"roles":["nurse"]},
          {"id":"optometry_handoff","label":"Optometry handoff note","type":"textarea","laterality":"none","required":false,"maxLength":1000,"roles":["optometrist"]}
        ]
      }
    ]
  }
  $definition$::jsonb,
  now()
FROM app.tenant t
WHERE NOT EXISTS (
  SELECT 1 FROM app.examination_template existing
  WHERE existing.tenant_id=t.id
    AND existing.code='general-ophthalmology'
    AND existing.version=2
);

UPDATE app.examination_template_assignment assignment
SET template_id=target.id, updated_at=now()
FROM app.examination_template current_template
JOIN app.examination_template target
  ON target.tenant_id=current_template.tenant_id
 AND target.code=current_template.code
 AND target.version=2
 AND target.status='published'
WHERE assignment.template_id=current_template.id
  AND assignment.tenant_id=current_template.tenant_id
  AND current_template.code='general-ophthalmology'
  AND current_template.version<2
  AND assignment.active;

CREATE OR REPLACE FUNCTION app.provision_default_examination_template() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $fn$
BEGIN
  INSERT INTO app.examination_template
    (tenant_id, code, version, name, specialty, status, is_default, definition, published_at)
  VALUES (
    NEW.id,
    'general-ophthalmology',
    2,
    'General Ophthalmology',
    'Ophthalmology',
    'published',
    true,
    $definition$
    {
      "sections": [
        {
          "id": "visit_history",
          "title": "Presenting complaint and history",
          "fields": [
            {"id":"visit_reason","label":"Reason for attendance","type":"textarea","laterality":"none","required":true,"maxLength":1500,"roles":["doctor","nurse","optometrist"]},
            {"id":"symptom_onset","label":"Onset and duration","type":"text","laterality":"none","required":false,"maxLength":200,"roles":["doctor","nurse","optometrist"]},
            {"id":"ocular_history","label":"Ocular history","type":"textarea","laterality":"none","required":false,"maxLength":2000,"roles":["doctor","optometrist"]},
            {"id":"systemic_history","label":"Systemic history","type":"textarea","laterality":"none","required":false,"maxLength":2000,"roles":["doctor","nurse","optometrist"]},
            {"id":"medication_history","label":"Medication and allergy review","type":"textarea","laterality":"none","required":false,"maxLength":1500,"roles":["doctor","nurse","optometrist"]}
          ]
        },
        {
          "id": "workup_review",
          "title": "Visual acuity, pressure and refraction review",
          "fields": [
            {"id":"workup_reviewed","label":"Workup reviewed","type":"boolean","laterality":"none","required":false,"roles":["doctor","optometrist"]},
            {"id":"workup_comment","label":"Workup interpretation","type":"textarea","laterality":"none","required":false,"maxLength":1200,"roles":["doctor","optometrist"],"visibleWhen":{"fieldId":"workup_reviewed","operator":"equals","value":true}}
          ]
        },
        {
          "id": "anterior_segment",
          "title": "Anterior segment examination",
          "fields": [
            {"id":"lids_adnexa","label":"Lids and adnexa","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor","optometrist"]},
            {"id":"conjunctiva","label":"Conjunctiva and sclera","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor","optometrist"]},
            {"id":"cornea","label":"Cornea","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor","optometrist"]},
            {"id":"anterior_chamber","label":"Anterior chamber","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor","optometrist"]},
            {"id":"iris","label":"Iris and pupil","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor","optometrist"]},
            {"id":"lens","label":"Lens and cataract","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor","optometrist"]}
          ]
        },
        {
          "id": "posterior_segment",
          "title": "Posterior segment and motility",
          "fields": [
            {"id":"vitreous","label":"Vitreous","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor","optometrist"]},
            {"id":"fundus","label":"Fundus and retina","type":"textarea","laterality":"bilateral","required":false,"maxLength":2000,"roles":["doctor","optometrist"]},
            {"id":"macula","label":"Macula","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor","optometrist"]},
            {"id":"optic_disc","label":"Optic disc","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor","optometrist"]},
            {"id":"gonioscopy","label":"Gonioscopy","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor"]},
            {"id":"motility","label":"Motility and alignment","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200,"roles":["doctor","optometrist"]}
          ]
        },
        {
          "id": "investigations",
          "title": "Investigations",
          "fields": [
            {"id":"investigation_required","label":"Investigation required","type":"boolean","laterality":"none","required":false,"roles":["doctor","optometrist"]},
            {"id":"requested_investigations","label":"Requested investigations","type":"textarea","laterality":"none","required":true,"maxLength":1500,"roles":["doctor","optometrist"],"visibleWhen":{"fieldId":"investigation_required","operator":"equals","value":true}}
          ]
        },
        {
          "id": "outcome",
          "title": "Diagnosis, management and outcome",
          "fields": [
            {"id":"visit_outcome","label":"Visit outcome","type":"select","laterality":"none","required":true,"options":["Follow-up","Discharge","Investigation","Procedure planning","Surgery planning","External referral"],"roles":["doctor"]},
            {"id":"next_steps","label":"Management and next steps","type":"textarea","laterality":"none","required":true,"maxLength":1500,"roles":["doctor"],"visibleWhen":{"fieldId":"visit_outcome","operator":"answered"}},
            {"id":"recall_interval","label":"Recall interval","type":"text","laterality":"none","required":true,"maxLength":120,"roles":["doctor"],"visibleWhen":{"fieldId":"visit_outcome","operator":"equals","value":"Follow-up"}},
            {"id":"referral_details","label":"External referral details","type":"textarea","laterality":"none","required":true,"maxLength":1000,"roles":["doctor"],"visibleWhen":{"fieldId":"visit_outcome","operator":"equals","value":"External referral"}},
            {"id":"surgery_plan","label":"Surgery planning notes","type":"textarea","laterality":"none","required":true,"maxLength":1200,"roles":["doctor"],"visibleWhen":{"fieldId":"visit_outcome","operator":"equals","value":"Surgery planning"}}
          ]
        },
        {
          "id": "team_handoff",
          "title": "Team handoff",
          "fields": [
            {"id":"nursing_handoff","label":"Nursing handoff note","type":"textarea","laterality":"none","required":false,"maxLength":1000,"roles":["nurse"]},
            {"id":"optometry_handoff","label":"Optometry handoff note","type":"textarea","laterality":"none","required":false,"maxLength":1000,"roles":["optometrist"]}
          ]
        }
      ]
    }
    $definition$::jsonb,
    now()
  )
  ON CONFLICT (tenant_id, code, version) DO NOTHING;
  RETURN NEW;
END $fn$;