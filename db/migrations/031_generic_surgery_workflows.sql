-- Store procedure-driven surgical forms as append-only, versioned clinical records.

CREATE TABLE app.surgery_workflow_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  procedure_catalogue_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('preop','operation','followup')),
  record_key text NOT NULL CHECK (record_key ~ '^[a-z][a-z0-9_]{1,59}$'),
  eye text NOT NULL CHECK (eye IN ('OD','OS')),
  version integer NOT NULL CHECK (version>0),
  answers jsonb NOT NULL CHECK (jsonb_typeof(answers)='object'),
  definition_snapshot jsonb NOT NULL CHECK (jsonb_typeof(definition_snapshot)='object'),
  author_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,case_id,kind,record_key,version),
  FOREIGN KEY(tenant_id,case_id) REFERENCES app.surgery_case(tenant_id,id),
  FOREIGN KEY(tenant_id,procedure_catalogue_id) REFERENCES app.procedure_catalogue(tenant_id,id),
  FOREIGN KEY(tenant_id,author_id) REFERENCES app.user_account(tenant_id,id)
);

CREATE INDEX surgery_workflow_current
  ON app.surgery_workflow_record(tenant_id,case_id,kind,record_key,version DESC);
ALTER TABLE app.surgery_workflow_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.surgery_workflow_record FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.surgery_workflow_record
  USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);

INSERT INTO app.surgery_workflow_record
 (tenant_id,case_id,procedure_catalogue_id,kind,record_key,eye,version,answers,definition_snapshot,author_id,created_at)
SELECT a.tenant_id,a.case_id,c.procedure_catalogue_id,'preop','preop',a.eye,a.version,
 jsonb_build_object(
  'axial_length',a.axial_length,'keratometry_k1',a.keratometry_k1,'keratometry_k2',a.keratometry_k2,
  'target_refraction',a.target_refraction,'iol_model',a.iol_model,'iol_power',a.iol_power,'anaesthesia',a.anaesthesia,
  'biometry_verified',a.biometry_verified,'medical_clearance',a.medical_clearance,'pupil_dilation',a.pupil_dilation,'notes',a.notes),
 p.definition,a.author_id,a.updated_at
FROM app.surgery_preop_assessment a
JOIN app.surgery_case c ON c.tenant_id=a.tenant_id AND c.id=a.case_id
JOIN app.procedure_catalogue p ON p.tenant_id=c.tenant_id AND p.id=c.procedure_catalogue_id;

INSERT INTO app.surgery_workflow_record
 (tenant_id,case_id,procedure_catalogue_id,kind,record_key,eye,version,answers,definition_snapshot,author_id,created_at)
SELECT n.tenant_id,n.case_id,c.procedure_catalogue_id,'operation','operation',n.eye,n.version,
 jsonb_build_object(
  'procedure_performed',n.procedure_performed,'anaesthesia',n.anaesthesia,'incision',n.incision,
  'capsulorhexis',n.capsulorhexis,'phaco_technique',n.phaco_technique,'iol_model',n.iol_model,
  'iol_power',n.iol_power,'complications',n.complications,'postoperative_instructions',n.postoperative_instructions),
 p.definition,n.author_id,n.updated_at
FROM app.surgery_operation_note n
JOIN app.surgery_case c ON c.tenant_id=n.tenant_id AND c.id=n.case_id
JOIN app.procedure_catalogue p ON p.tenant_id=c.tenant_id AND p.id=c.procedure_catalogue_id;

INSERT INTO app.surgery_workflow_record
 (tenant_id,case_id,procedure_catalogue_id,kind,record_key,eye,version,answers,definition_snapshot,author_id,created_at)
SELECT f.tenant_id,f.case_id,c.procedure_catalogue_id,'followup',f.visit_type,f.eye,f.version,
 jsonb_build_object(
  'uncorrected_acuity',f.uncorrected_acuity,'corrected_acuity',f.corrected_acuity,'iop',f.iop,
  'wound',f.wound,'cornea',f.cornea,'anterior_chamber',f.anterior_chamber,'iol_position',f.iol_position,
  'medications',f.medications,'plan',f.plan,'next_review',f.next_review),
 p.definition,f.author_id,f.updated_at
FROM app.surgery_followup f
JOIN app.surgery_case c ON c.tenant_id=f.tenant_id AND c.id=f.case_id
JOIN app.procedure_catalogue p ON p.tenant_id=c.tenant_id AND p.id=c.procedure_catalogue_id;

CREATE FUNCTION app.guard_surgery_workflow_record() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,app AS $fn$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Surgery workflow records are append-only'; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM app.surgery_case c
  WHERE c.tenant_id=NEW.tenant_id AND c.id=NEW.case_id
    AND c.procedure_catalogue_id=NEW.procedure_catalogue_id AND c.eye=NEW.eye
 ) THEN RAISE EXCEPTION 'Workflow record does not match its surgery case'; END IF;
 IF NEW.kind='operation' AND EXISTS (
  SELECT 1 FROM app.surgery_case c WHERE c.id=NEW.case_id AND c.stage IN ('operated','discharged','followup')
 ) THEN RAISE EXCEPTION 'Final operation records are immutable'; END IF;
 RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION app.guard_surgery_workflow_record() FROM PUBLIC;
CREATE TRIGGER surgery_workflow_record_guard
 BEFORE INSERT OR UPDATE OR DELETE ON app.surgery_workflow_record
 FOR EACH ROW EXECUTE FUNCTION app.guard_surgery_workflow_record();

CREATE OR REPLACE FUNCTION app.cataract_procedure_definition() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,app AS $fn$
 SELECT $definition$
{
 "allowedEyes":["OD","OS"],
 "preoperativeChecks":["biometry_verified","medical_clearance","pupil_dilation"],
 "preoperativeFields":[
  {"code":"axial_length","label":"Axial length (mm)","type":"number","required":true,"min":15,"max":40,"step":0.01},
  {"code":"keratometry_k1","label":"Keratometry K1 (D)","type":"number","required":true,"min":20,"max":70,"step":0.01},
  {"code":"keratometry_k2","label":"Keratometry K2 (D)","type":"number","required":true,"min":20,"max":70,"step":0.01},
  {"code":"target_refraction","label":"Target refraction (D)","type":"number","required":true,"min":-20,"max":20,"step":0.01},
  {"code":"iol_model","label":"IOL model","type":"text","required":true,"maxLength":120},
  {"code":"iol_power","label":"IOL power (D)","type":"number","required":true,"min":-10,"max":60,"step":0.01},
  {"code":"anaesthesia","label":"Planned anaesthesia","type":"select","required":true,"options":["topical","local","general"]},
  {"code":"notes","label":"Preoperative notes","type":"textarea","required":false,"maxLength":2000}
 ],
 "operationNoteFields":[
  {"code":"procedure_performed","label":"Procedure performed","type":"text","required":true,"maxLength":240},
  {"code":"anaesthesia","label":"Anaesthesia","type":"select","required":true,"options":["topical","local","general"]},
  {"code":"incision","label":"Incision","type":"text","required":true,"maxLength":160},
  {"code":"capsulorhexis","label":"Capsulorhexis","type":"text","required":true,"maxLength":160},
  {"code":"phaco_technique","label":"Phaco technique","type":"text","required":true,"maxLength":160},
  {"code":"iol_model","label":"IOL model","type":"text","required":true,"maxLength":120},
  {"code":"iol_power","label":"IOL power","type":"number","required":true,"min":-10,"max":60,"step":0.01},
  {"code":"complications","label":"Complications","type":"textarea","required":true,"maxLength":2000},
  {"code":"postoperative_instructions","label":"Postoperative instructions","type":"textarea","required":true,"maxLength":2000}
 ],
 "followupSchedule":[
  {"code":"day_1","label":"Day 1","daysAfter":1,"required":true},
  {"code":"week_1","label":"Week 1","daysAfter":7,"required":true},
  {"code":"month_1","label":"Month 1","daysAfter":30,"required":true},
  {"code":"other","label":"Additional follow-up","daysAfter":0,"required":false}
 ],
 "followupFields":[
  {"code":"uncorrected_acuity","label":"Unaided visual acuity","type":"text","required":true,"maxLength":40},
  {"code":"corrected_acuity","label":"Corrected visual acuity","type":"text","required":false,"maxLength":40},
  {"code":"iop","label":"IOP (mmHg)","type":"number","required":true,"min":0,"max":80,"step":0.1},
  {"code":"wound","label":"Wound","type":"text","required":true,"maxLength":500},
  {"code":"cornea","label":"Cornea","type":"text","required":true,"maxLength":500},
  {"code":"anterior_chamber","label":"Anterior chamber","type":"text","required":true,"maxLength":500},
  {"code":"iol_position","label":"IOL position","type":"text","required":true,"maxLength":500},
  {"code":"medications","label":"Medications","type":"textarea","required":true,"maxLength":1000},
  {"code":"plan","label":"Plan","type":"textarea","required":true,"maxLength":1500},
  {"code":"next_review","label":"Next review date","type":"date","required":false}
 ]
}
 $definition$::jsonb;
$fn$;

WITH retired AS (
 UPDATE app.procedure_catalogue
 SET status='retired',active=false,revision=revision+1,updated_at=now()
 WHERE code='cataract-phaco-iol' AND status='published' AND NOT (definition ? 'preoperativeFields')
 RETURNING tenant_id,code
)
INSERT INTO app.procedure_catalogue(tenant_id,code,version,name,specialty,status,active,definition,published_at)
SELECT r.tenant_id,r.code,
 (SELECT max(p.version)+1 FROM app.procedure_catalogue p WHERE p.tenant_id=r.tenant_id AND p.code=r.code),
 'Cataract extraction with phacoemulsification and IOL','Cataract','published',true,app.cataract_procedure_definition(),now()
FROM retired r;

GRANT SELECT,INSERT ON app.surgery_workflow_record TO openeyes_app;
