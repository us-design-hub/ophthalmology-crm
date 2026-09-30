-- Ensure every future hospital receives the published General Ophthalmology template.
CREATE FUNCTION app.provision_default_examination_template() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $fn$
BEGIN
  INSERT INTO app.examination_template
    (tenant_id, code, version, name, specialty, status, is_default, definition, published_at)
  VALUES (
    NEW.id,
    'general-ophthalmology',
    1,
    'General Ophthalmology',
    'Ophthalmology',
    'published',
    true,
    $definition$
    {
      "sections": [
        {
          "id": "history",
          "title": "Clinical history",
          "description": "Record ocular and systemic context for this visit.",
          "fields": [
            {"id":"ocular_history","label":"Ocular history","type":"textarea","laterality":"none","required":false,"maxLength":2000},
            {"id":"systemic_history","label":"Systemic history","type":"textarea","laterality":"none","required":false,"maxLength":2000}
          ]
        },
        {
          "id": "ocular_examination",
          "title": "Ocular examination",
          "description": "Document each eye independently. OD remains before OS.",
          "fields": [
            {"id":"anterior_segment","label":"Anterior segment","type":"textarea","laterality":"bilateral","required":false,"maxLength":2000},
            {"id":"cornea","label":"Cornea","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200},
            {"id":"lens","label":"Lens / cataract","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200},
            {"id":"fundus","label":"Fundus","type":"textarea","laterality":"bilateral","required":false,"maxLength":2000},
            {"id":"optic_disc","label":"Optic disc","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200},
            {"id":"gonioscopy","label":"Gonioscopy","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200},
            {"id":"motility","label":"Motility","type":"textarea","laterality":"bilateral","required":false,"maxLength":1200}
          ]
        },
        {
          "id": "outcome",
          "title": "Outcome and next steps",
          "description": "Capture the disposition separately from the free-text management plan.",
          "fields": [
            {"id":"visit_outcome","label":"Visit outcome","type":"select","laterality":"none","required":false,"options":["Follow-up","Discharge","Investigation","Procedure planning","Surgery planning","External referral"]},
            {"id":"next_steps","label":"Next steps","type":"textarea","laterality":"none","required":false,"maxLength":1500},
            {"id":"recall_interval","label":"Recall interval","type":"text","laterality":"none","required":false,"maxLength":120}
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

REVOKE ALL ON FUNCTION app.provision_default_examination_template() FROM PUBLIC;

CREATE TRIGGER tenant_default_examination_template
  AFTER INSERT ON app.tenant
  FOR EACH ROW EXECUTE FUNCTION app.provision_default_examination_template();

