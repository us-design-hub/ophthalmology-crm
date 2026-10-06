-- Structured diagnostic investigations and immutable supporting evidence.

CREATE TABLE app.investigation_result (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  encounter_id uuid NOT NULL,
  stage text NOT NULL CHECK (stage IN ('testing','imaging')),
  kind text NOT NULL CHECK (kind IN ('visual_field','oct_rnfl','pachymetry','gonioscopy','oct_macula','fundus_photo','fluorescein_angiography')),
  eye text NOT NULL CHECK (eye IN ('OD','OS','OU')),
  performed_at timestamptz NOT NULL,
  device text NOT NULL DEFAULT '' CHECK (length(device) <= 120),
  findings text NOT NULL CHECK (length(findings) BETWEEN 3 AND 2000),
  measurements jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(measurements)='object'),
  author_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,encounter_id) REFERENCES app.encounter(tenant_id,id),
  FOREIGN KEY (tenant_id,author_id) REFERENCES app.user_account(tenant_id,id),
  CHECK ((stage='testing' AND kind IN ('visual_field','oct_rnfl','pachymetry','gonioscopy')) OR
         (stage='imaging' AND kind IN ('oct_macula','fundus_photo','fluorescein_angiography')))
);

CREATE INDEX investigation_result_encounter_idx ON app.investigation_result(tenant_id,encounter_id,performed_at DESC);
ALTER TABLE app.investigation_result ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.investigation_result FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.investigation_result
  USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE TABLE app.investigation_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  investigation_id uuid NOT NULL,
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 5242880),
  mime text NOT NULL CHECK (mime IN ('image/jpeg','image/png','application/pdf')),
  filename text NOT NULL CHECK (length(filename) BETWEEN 1 AND 160),
  hash text NOT NULL CHECK (hash ~ '^[a-f0-9]{64}$'),
  actor_id uuid NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,investigation_id,hash),
  FOREIGN KEY (tenant_id,investigation_id) REFERENCES app.investigation_result(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,actor_id) REFERENCES app.user_account(tenant_id,id)
);

ALTER TABLE app.investigation_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.investigation_evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.investigation_evidence
  USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE FUNCTION app.guard_investigation_result() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,app AS $fn$
DECLARE encounter_stage text; parent_id uuid; parent_tenant uuid;
BEGIN
  IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Investigation results are append-only' USING ERRCODE='42501'; END IF;
  parent_id:=CASE WHEN TG_OP='DELETE' THEN OLD.encounter_id ELSE NEW.encounter_id END;
  parent_tenant:=CASE WHEN TG_OP='DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
  SELECT stage INTO encounter_stage FROM app.encounter WHERE id=parent_id AND tenant_id=parent_tenant FOR UPDATE;
  IF encounter_stage IS DISTINCT FROM (CASE WHEN TG_OP='DELETE' THEN OLD.stage ELSE NEW.stage END) THEN
    RAISE EXCEPTION 'Investigation results are locked after the pathway advances' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $fn$;

CREATE TRIGGER investigation_result_guard
  BEFORE INSERT OR UPDATE OR DELETE ON app.investigation_result
  FOR EACH ROW EXECUTE FUNCTION app.guard_investigation_result();
REVOKE ALL ON FUNCTION app.guard_investigation_result() FROM PUBLIC;

CREATE FUNCTION app.guard_investigation_evidence() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,app AS $fn$
DECLARE current_stage text; result_stage text; parent_id uuid; parent_tenant uuid;
BEGIN
  IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Investigation evidence is immutable' USING ERRCODE='42501'; END IF;
  parent_id:=CASE WHEN TG_OP='DELETE' THEN OLD.investigation_id ELSE NEW.investigation_id END;
  parent_tenant:=CASE WHEN TG_OP='DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
  SELECT e.stage,r.stage INTO current_stage,result_stage
  FROM app.investigation_result r JOIN app.encounter e ON e.id=r.encounter_id AND e.tenant_id=r.tenant_id
  WHERE r.id=parent_id AND r.tenant_id=parent_tenant FOR UPDATE OF e;
  IF current_stage IS DISTINCT FROM result_stage THEN
    RAISE EXCEPTION 'Investigation evidence is locked after the pathway advances' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $fn$;

CREATE TRIGGER investigation_evidence_guard
  BEFORE INSERT OR UPDATE OR DELETE ON app.investigation_evidence
  FOR EACH ROW EXECUTE FUNCTION app.guard_investigation_evidence();
REVOKE ALL ON FUNCTION app.guard_investigation_evidence() FROM PUBLIC;

GRANT SELECT,INSERT,DELETE ON app.investigation_result TO openeyes_app;
GRANT SELECT,INSERT,DELETE ON app.investigation_evidence TO openeyes_app;
