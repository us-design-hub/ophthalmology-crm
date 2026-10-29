-- Unified, append-only physical-document evidence for the longitudinal patient file.

INSERT INTO app.permission(code) VALUES ('document:read'),('document:upload'),('document:export') ON CONFLICT DO NOTHING;

INSERT INTO app.role_permission(tenant_id,role_code,permission_code)
SELECT r.tenant_id,r.code,g.permission
FROM app.role r
JOIN (VALUES
  ('nurse','document:read'),('nurse','document:upload'),
  ('senior_technician','document:read'),('senior_technician','document:upload'),('senior_technician','document:export'),
  ('doctor','document:read'),('doctor','document:upload'),('doctor','document:export'),
  ('lab_assistant','document:read'),('lab_assistant','document:upload'),
  ('machine_operator','document:read'),('machine_operator','document:upload'),
  ('ot_coordinator','document:read'),('pharmacist','document:read'),('optician','document:read'),
  ('hospital_admin','document:read'),('hospital_admin','document:export'),
  ('auditor','document:read'),('auditor','document:export')
) AS g(role_code,permission) ON g.role_code=r.code
ON CONFLICT DO NOTHING;

CREATE TABLE app.clinical_document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, patient_id uuid NOT NULL, encounter_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('workup','senior_review','doctor_note','prescription','machine_test','lab_result','surgery','external','other')),
  title text NOT NULL CHECK (length(title) BETWEEN 2 AND 160), remarks text NOT NULL DEFAULT '' CHECK (length(remarks) <= 2000),
  captured_at timestamptz NOT NULL, uploaded_at timestamptz NOT NULL DEFAULT now(), actor_id uuid NOT NULL,
  actor_role text NOT NULL CHECK (length(actor_role) BETWEEN 2 AND 60),
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 5242880),
  mime text NOT NULL CHECK (mime IN ('application/pdf','image/png','image/jpeg')),
  filename text NOT NULL CHECK (length(filename) BETWEEN 1 AND 160), hash text NOT NULL CHECK (hash ~ '^[a-f0-9]{64}$'),
  UNIQUE (tenant_id,id), UNIQUE (tenant_id,encounter_id,hash),
  FOREIGN KEY (tenant_id,patient_id) REFERENCES app.patient(tenant_id,id),
  FOREIGN KEY (tenant_id,encounter_id) REFERENCES app.encounter(tenant_id,id),
  FOREIGN KEY (tenant_id,actor_id) REFERENCES app.user_account(tenant_id,id)
);
CREATE INDEX clinical_document_patient_file ON app.clinical_document(tenant_id,patient_id,captured_at DESC,uploaded_at DESC);
CREATE INDEX clinical_document_encounter ON app.clinical_document(tenant_id,encounter_id,captured_at DESC);
ALTER TABLE app.clinical_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.clinical_document FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.clinical_document
  USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT ON app.clinical_document TO openeyes_app;

CREATE FUNCTION app.guard_clinical_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'clinical documents are append-only' USING ERRCODE='42501'; END $$;
CREATE TRIGGER clinical_document_immutable BEFORE UPDATE OR DELETE ON app.clinical_document
  FOR EACH ROW EXECUTE FUNCTION app.guard_clinical_document();
REVOKE ALL ON FUNCTION app.guard_clinical_document() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.guard_clinical_document() TO openeyes_app;
