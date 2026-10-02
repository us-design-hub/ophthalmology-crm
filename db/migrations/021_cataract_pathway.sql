-- Add a structured cataract pathway to the existing surgery lifecycle.

CREATE TABLE app.procedure_catalogue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenant(id),
  code text NOT NULL CHECK (code ~ '^[a-z][a-z0-9_-]{2,79}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 3 AND 160),
  specialty text NOT NULL CHECK (length(specialty) BETWEEN 3 AND 80),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code)
);

ALTER TABLE app.procedure_catalogue ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.procedure_catalogue FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.procedure_catalogue
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

INSERT INTO app.procedure_catalogue(tenant_id,code,name,specialty)
SELECT id,'cataract-phaco-iol','Cataract extraction with phacoemulsification and IOL','Cataract'
FROM app.tenant
ON CONFLICT (tenant_id,code) DO NOTHING;

ALTER TABLE app.surgery_case
  ADD COLUMN procedure_catalogue_id uuid,
  ADD CONSTRAINT surgery_case_procedure_catalogue_fk
    FOREIGN KEY (tenant_id,procedure_catalogue_id)
    REFERENCES app.procedure_catalogue(tenant_id,id);

UPDATE app.surgery_case c
SET procedure_catalogue_id=p.id
FROM app.procedure_catalogue p
WHERE p.tenant_id=c.tenant_id
  AND p.code='cataract-phaco-iol'
  AND c.procedure ILIKE '%cataract%';

CREATE TABLE app.surgery_preop_assessment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  eye text NOT NULL CHECK (eye IN ('OD','OS')),
  axial_length numeric(5,2) NOT NULL CHECK (axial_length BETWEEN 15 AND 40),
  keratometry_k1 numeric(5,2) NOT NULL CHECK (keratometry_k1 BETWEEN 20 AND 70),
  keratometry_k2 numeric(5,2) NOT NULL CHECK (keratometry_k2 BETWEEN 20 AND 70),
  target_refraction numeric(5,2) NOT NULL CHECK (target_refraction BETWEEN -20 AND 20),
  iol_model text NOT NULL CHECK (length(iol_model) BETWEEN 2 AND 120),
  iol_power numeric(5,2) NOT NULL CHECK (iol_power BETWEEN -10 AND 60),
  anaesthesia text NOT NULL CHECK (anaesthesia IN ('topical','local','general')),
  biometry_verified boolean NOT NULL,
  medical_clearance boolean NOT NULL,
  pupil_dilation boolean NOT NULL,
  notes text NOT NULL DEFAULT '' CHECK (length(notes)<=2000),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  author_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,case_id),
  FOREIGN KEY (tenant_id,case_id) REFERENCES app.surgery_case(tenant_id,id),
  FOREIGN KEY (tenant_id,author_id) REFERENCES app.user_account(tenant_id,id)
);

CREATE TABLE app.surgery_operation_note (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  eye text NOT NULL CHECK (eye IN ('OD','OS')),
  procedure_performed text NOT NULL CHECK (length(procedure_performed) BETWEEN 3 AND 240),
  anaesthesia text NOT NULL CHECK (anaesthesia IN ('topical','local','general')),
  incision text NOT NULL CHECK (length(incision) BETWEEN 2 AND 160),
  capsulorhexis text NOT NULL CHECK (length(capsulorhexis) BETWEEN 2 AND 160),
  phaco_technique text NOT NULL CHECK (length(phaco_technique) BETWEEN 2 AND 160),
  iol_model text NOT NULL CHECK (length(iol_model) BETWEEN 2 AND 120),
  iol_power numeric(5,2) NOT NULL CHECK (iol_power BETWEEN -10 AND 60),
  complications text NOT NULL DEFAULT '' CHECK (length(complications)<=2000),
  postoperative_instructions text NOT NULL CHECK (length(postoperative_instructions) BETWEEN 3 AND 2000),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  author_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,case_id),
  FOREIGN KEY (tenant_id,case_id) REFERENCES app.surgery_case(tenant_id,id),
  FOREIGN KEY (tenant_id,author_id) REFERENCES app.user_account(tenant_id,id)
);

CREATE TABLE app.surgery_followup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  visit_type text NOT NULL CHECK (visit_type IN ('day_1','week_1','month_1','other')),
  eye text NOT NULL CHECK (eye IN ('OD','OS')),
  uncorrected_acuity text NOT NULL CHECK (length(uncorrected_acuity) BETWEEN 1 AND 40),
  corrected_acuity text NOT NULL DEFAULT '' CHECK (length(corrected_acuity)<=40),
  iop numeric(4,1) NOT NULL CHECK (iop BETWEEN 0 AND 80),
  wound text NOT NULL CHECK (length(wound) BETWEEN 1 AND 500),
  cornea text NOT NULL CHECK (length(cornea) BETWEEN 1 AND 500),
  anterior_chamber text NOT NULL CHECK (length(anterior_chamber) BETWEEN 1 AND 500),
  iol_position text NOT NULL CHECK (length(iol_position) BETWEEN 1 AND 500),
  medications text NOT NULL CHECK (length(medications) BETWEEN 1 AND 1000),
  plan text NOT NULL CHECK (length(plan) BETWEEN 1 AND 1500),
  next_review date,
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  author_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,case_id,visit_type),
  FOREIGN KEY (tenant_id,case_id) REFERENCES app.surgery_case(tenant_id,id),
  FOREIGN KEY (tenant_id,author_id) REFERENCES app.user_account(tenant_id,id)
);

DO $block$
DECLARE item text;
BEGIN
  FOREACH item IN ARRAY ARRAY['surgery_preop_assessment','surgery_operation_note','surgery_followup'] LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',item);
    EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',item);
    EXECUTE format('CREATE POLICY tenant_isolation ON app.%I USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',item);
  END LOOP;
END
$block$;

CREATE FUNCTION app.guard_final_operation_note() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,app AS $fn$
BEGIN
  IF EXISTS (
    SELECT 1 FROM app.surgery_case
    WHERE id=OLD.case_id AND stage IN ('operated','discharged','followup')
  ) THEN
    RAISE EXCEPTION 'Final operation notes are immutable';
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION app.guard_final_operation_note() FROM PUBLIC;
CREATE TRIGGER surgery_operation_note_immutable
  BEFORE UPDATE OR DELETE ON app.surgery_operation_note
  FOR EACH ROW EXECUTE FUNCTION app.guard_final_operation_note();

CREATE FUNCTION app.cataract_template_definition() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,app AS $fn$
 SELECT $definition$
{
 "sections":[
  {"id":"cataract_history","title":"Cataract history and functional impact","fields":[
   {"id":"visual_symptoms","label":"Visual symptoms and duration","type":"textarea","laterality":"none","required":true,"maxLength":1500,"roles":["doctor","optometrist"]},
   {"id":"functional_impact","label":"Functional impact","type":"textarea","laterality":"none","required":true,"maxLength":1500,"roles":["doctor","optometrist"]},
   {"id":"ocular_history","label":"Ocular history","type":"textarea","laterality":"none","required":false,"maxLength":1800,"roles":["doctor","optometrist"]},
   {"id":"systemic_risk","label":"Systemic risks, medicines and allergies","type":"textarea","laterality":"none","required":false,"maxLength":1800,"roles":["doctor","nurse","optometrist"]}
  ]},
  {"id":"cataract_examination","title":"Cataract examination","description":"Record findings for OD and OS separately.","fields":[
   {"id":"lens_status","label":"Lens and cataract morphology","type":"textarea","laterality":"bilateral","required":true,"maxLength":1200,"roles":["doctor","optometrist"]},
   {"id":"corneal_status","label":"Cornea","type":"textarea","laterality":"bilateral","required":true,"maxLength":1000,"roles":["doctor","optometrist"]},
   {"id":"pupil_dilation","label":"Pupil and dilation","type":"textarea","laterality":"bilateral","required":false,"maxLength":800,"roles":["doctor","optometrist"]},
   {"id":"fundus_view","label":"Fundus view and macular status","type":"textarea","laterality":"bilateral","required":true,"maxLength":1200,"roles":["doctor","optometrist"]}
  ]},
  {"id":"cataract_decision","title":"Surgical decision","fields":[
   {"id":"surgery_recommended","label":"Cataract surgery recommended","type":"boolean","laterality":"none","required":true,"roles":["doctor"]},
   {"id":"surgical_eye","label":"Planned surgical eye","type":"select","laterality":"none","required":true,"options":["OD","OS"],"roles":["doctor"],"visibleWhen":{"fieldId":"surgery_recommended","operator":"equals","value":true}},
   {"id":"procedure_plan","label":"Procedure and IOL strategy","type":"textarea","laterality":"none","required":true,"maxLength":1500,"roles":["doctor"],"visibleWhen":{"fieldId":"surgery_recommended","operator":"equals","value":true}},
   {"id":"risk_discussion","label":"Risks, benefits and alternatives discussed","type":"textarea","laterality":"none","required":true,"maxLength":1500,"roles":["doctor"],"visibleWhen":{"fieldId":"surgery_recommended","operator":"equals","value":true}},
   {"id":"outcome","label":"Outcome","type":"select","laterality":"none","required":true,"options":["Surgery planning","Observe","Further investigation","Discharge"],"roles":["doctor"]}
  ]}
 ]
}
 $definition$::jsonb;
$fn$;
REVOKE ALL ON FUNCTION app.cataract_template_definition() FROM PUBLIC;

INSERT INTO app.examination_template
  (tenant_id,code,version,name,specialty,status,is_default,definition,published_at)
SELECT t.id,'cataract',1,'Cataract assessment','Cataract','published',false,
app.cataract_template_definition(),now()
FROM app.tenant t
WHERE NOT EXISTS (
 SELECT 1 FROM app.examination_template e
 WHERE e.tenant_id=t.id AND e.code='cataract' AND e.version=1
);

INSERT INTO app.examination_template_assignment(tenant_id,template_id,facility_id,specialty,visit_type)
SELECT f.tenant_id,t.id,f.id,'Cataract','general'
FROM app.facility f
JOIN app.examination_template t ON t.tenant_id=f.tenant_id AND t.code='cataract' AND t.version=1
WHERE f.active AND lower(f.specialty)='cataract'
ON CONFLICT DO NOTHING;

CREATE FUNCTION app.provision_cataract_template() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $fn$
BEGIN
 INSERT INTO app.procedure_catalogue(tenant_id,code,name,specialty)
 VALUES(NEW.id,'cataract-phaco-iol','Cataract extraction with phacoemulsification and IOL','Cataract')
 ON CONFLICT DO NOTHING;
 INSERT INTO app.examination_template
  (tenant_id,code,version,name,specialty,status,is_default,definition,published_at)
 VALUES(NEW.id,'cataract',1,'Cataract assessment','Cataract','published',false,app.cataract_template_definition(),now())
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION app.provision_cataract_template() FROM PUBLIC;
CREATE TRIGGER tenant_cataract_template
  AFTER INSERT ON app.tenant
  FOR EACH ROW EXECUTE FUNCTION app.provision_cataract_template();

GRANT SELECT ON app.procedure_catalogue TO openeyes_app;
GRANT SELECT,INSERT,UPDATE ON app.surgery_preop_assessment,app.surgery_operation_note,app.surgery_followup TO openeyes_app;
GRANT UPDATE(procedure_catalogue_id) ON app.surgery_case TO openeyes_app;
