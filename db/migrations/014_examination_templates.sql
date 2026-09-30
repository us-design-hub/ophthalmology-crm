-- Versioned, tenant-scoped ophthalmic examination templates and structured answers.
CREATE TABLE app.examination_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenant(id),
  code text NOT NULL CHECK (code ~ '^[a-z][a-z0-9_-]{2,63}$'),
  version integer NOT NULL CHECK (version > 0),
  name text NOT NULL CHECK (length(name) BETWEEN 3 AND 120),
  specialty text NOT NULL CHECK (length(specialty) BETWEEN 3 AND 80),
  status text NOT NULL CHECK (status IN ('draft','published','retired')),
  is_default boolean NOT NULL DEFAULT false,
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code, version),
  CHECK ((status = 'published' AND published_at IS NOT NULL) OR status <> 'published')
);

CREATE UNIQUE INDEX examination_template_one_default
  ON app.examination_template(tenant_id)
  WHERE is_default AND status = 'published';

ALTER TABLE app.examination_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.examination_template FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.examination_template
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

INSERT INTO app.examination_template
  (tenant_id, code, version, name, specialty, status, is_default, definition, published_at)
SELECT
  id,
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
FROM app.tenant;

ALTER TABLE app.doctor_event
  ADD COLUMN examination_template_id uuid,
  ADD COLUMN examination_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT doctor_event_examination_answers_object
    CHECK (jsonb_typeof(examination_answers) = 'object');

ALTER TABLE app.doctor_event DISABLE TRIGGER doctor_event_immutable;

UPDATE app.doctor_event d
SET examination_template_id = t.id,
    examination_answers = jsonb_build_object(
      'ocular_history', '',
      'systemic_history', '',
      'anterior_segment', jsonb_build_object('OD', d.findings->>'OD', 'OS', d.findings->>'OS'),
      'cornea', jsonb_build_object('OD', '', 'OS', ''),
      'lens', jsonb_build_object('OD', '', 'OS', ''),
      'fundus', jsonb_build_object('OD', '', 'OS', ''),
      'optic_disc', jsonb_build_object('OD', '', 'OS', ''),
      'gonioscopy', jsonb_build_object('OD', '', 'OS', ''),
      'motility', jsonb_build_object('OD', '', 'OS', ''),
      'visit_outcome', '',
      'next_steps', '',
      'recall_interval', ''
    )
FROM app.examination_template t
WHERE t.tenant_id = d.tenant_id AND t.is_default AND t.status = 'published';

ALTER TABLE app.doctor_event ENABLE TRIGGER doctor_event_immutable;

ALTER TABLE app.doctor_event
  ALTER COLUMN examination_template_id SET NOT NULL,
  ADD CONSTRAINT doctor_event_examination_template_fk
    FOREIGN KEY (tenant_id, examination_template_id)
    REFERENCES app.examination_template(tenant_id, id);

CREATE INDEX doctor_event_examination_template
  ON app.doctor_event(tenant_id, examination_template_id);

GRANT SELECT ON app.examination_template TO openeyes_app;
GRANT UPDATE(examination_template_id, examination_answers) ON app.doctor_event TO openeyes_app;

