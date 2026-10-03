-- Longitudinal diagnosis/problem episodes promoted from signed Doctor Events.
CREATE TABLE app.clinical_problem (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  source_event_id uuid NOT NULL,
  latest_event_id uuid NOT NULL,
  eye text NOT NULL CHECK (eye IN ('OD','OS','OU')),
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 200),
  code_system text CHECK (code_system IN ('ICD-10','SNOMED CT')),
  code text CHECK (code IS NULL OR length(code) BETWEEN 1 AND 40),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','resolved')),
  onset_at timestamptz NOT NULL,
  resolved_at timestamptz,
  resolution_reason text CHECK (resolution_reason IS NULL OR length(resolution_reason) BETWEEN 8 AND 500),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,patient_id) REFERENCES app.patient(tenant_id,id),
  FOREIGN KEY (tenant_id,source_event_id) REFERENCES app.doctor_event(tenant_id,id),
  FOREIGN KEY (tenant_id,latest_event_id) REFERENCES app.doctor_event(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by) REFERENCES app.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by) REFERENCES app.user_account(tenant_id,id),
  CHECK (
    (status='active' AND resolved_at IS NULL AND resolution_reason IS NULL)
    OR
    (status='resolved' AND resolved_at IS NOT NULL AND resolution_reason IS NOT NULL)
  )
);

CREATE UNIQUE INDEX clinical_problem_one_active
  ON app.clinical_problem (
    tenant_id,patient_id,eye,lower(btrim(label)),
    coalesce(code_system,''),coalesce(code,'')
  )
  WHERE status='active';
CREATE INDEX clinical_problem_patient_status
  ON app.clinical_problem(tenant_id,patient_id,status,updated_at DESC);

CREATE TABLE app.clinical_problem_transition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  problem_id uuid NOT NULL,
  from_status text CHECK (from_status IS NULL OR from_status IN ('active','resolved')),
  to_status text NOT NULL CHECK (to_status IN ('active','resolved')),
  reason text NOT NULL CHECK (length(reason) BETWEEN 8 AND 500),
  actor_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,problem_id) REFERENCES app.clinical_problem(tenant_id,id),
  FOREIGN KEY (tenant_id,actor_id) REFERENCES app.user_account(tenant_id,id)
);
CREATE INDEX clinical_problem_transition_problem
  ON app.clinical_problem_transition(tenant_id,problem_id,at DESC);

ALTER TABLE app.clinical_problem ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.clinical_problem FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.clinical_problem
  USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);

ALTER TABLE app.clinical_problem_transition ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.clinical_problem_transition FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.clinical_problem_transition
  USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE FUNCTION app.guard_clinical_problem_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,app AS $fn$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Clinical problem episodes cannot be deleted' USING ERRCODE='42501';
  END IF;
  IF NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.patient_id<>OLD.patient_id
    OR NEW.source_event_id<>OLD.source_event_id OR NEW.eye<>OLD.eye
    OR NEW.label<>OLD.label OR NEW.code_system IS DISTINCT FROM OLD.code_system
    OR NEW.code IS DISTINCT FROM OLD.code OR NEW.onset_at<>OLD.onset_at
    OR NEW.created_by<>OLD.created_by THEN
    RAISE EXCEPTION 'Clinical problem identity is immutable' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION app.guard_clinical_problem_identity() FROM PUBLIC;
CREATE TRIGGER clinical_problem_identity_immutable
  BEFORE UPDATE OR DELETE ON app.clinical_problem
  FOR EACH ROW EXECUTE FUNCTION app.guard_clinical_problem_identity();

CREATE FUNCTION app.guard_clinical_problem_transition() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,app AS $fn$
BEGIN
  RAISE EXCEPTION 'Clinical problem history is immutable' USING ERRCODE='42501';
END
$fn$;
REVOKE ALL ON FUNCTION app.guard_clinical_problem_transition() FROM PUBLIC;
CREATE TRIGGER clinical_problem_transition_immutable
  BEFORE UPDATE OR DELETE ON app.clinical_problem_transition
  FOR EACH ROW EXECUTE FUNCTION app.guard_clinical_problem_transition();

GRANT SELECT,INSERT ON app.clinical_problem,app.clinical_problem_transition TO openeyes_app;
GRANT UPDATE(status,resolved_at,resolution_reason,version,updated_by,updated_at,latest_event_id)
  ON app.clinical_problem TO openeyes_app;

WITH diagnoses AS (
  SELECT
    d.tenant_id,
    e.patient_id,
    d.id AS event_id,
    d.author_id,
    coalesce(d.signed_at,d.updated_at) AS event_at,
    diagnosis->>'eye' AS eye,
    btrim(diagnosis->>'label') AS label,
    nullif(diagnosis->>'codeSystem','') AS code_system,
    nullif(btrim(diagnosis->>'code'),'') AS code
  FROM app.doctor_event d
  JOIN app.encounter e ON e.id=d.encounter_id AND e.tenant_id=d.tenant_id
  CROSS JOIN LATERAL jsonb_array_elements(d.diagnoses) diagnosis
  WHERE d.status='signed'
    AND diagnosis->>'eye' IN ('OD','OS','OU')
    AND length(btrim(diagnosis->>'label')) BETWEEN 1 AND 200
), ranked AS (
  SELECT diagnoses.*,
    min(event_at) OVER (
      PARTITION BY tenant_id,patient_id,eye,lower(label),coalesce(code_system,''),coalesce(code,'')
    ) AS first_at,
    row_number() OVER (
      PARTITION BY tenant_id,patient_id,eye,lower(label),coalesce(code_system,''),coalesce(code,'')
      ORDER BY event_at DESC,event_id DESC
    ) AS recency
  FROM diagnoses
)
INSERT INTO app.clinical_problem
  (tenant_id,patient_id,source_event_id,latest_event_id,eye,label,code_system,code,onset_at,created_by,updated_by,updated_at)
SELECT tenant_id,patient_id,event_id,event_id,eye,label,code_system,code,first_at,author_id,author_id,event_at
FROM ranked
WHERE recency=1
ON CONFLICT DO NOTHING;

INSERT INTO app.clinical_problem_transition
  (tenant_id,problem_id,from_status,to_status,reason,actor_id,at)
SELECT tenant_id,id,NULL,'active','Imported from signed Doctor Event',created_by,onset_at
FROM app.clinical_problem;
