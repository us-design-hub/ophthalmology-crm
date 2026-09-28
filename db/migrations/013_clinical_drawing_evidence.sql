-- Persistent iPad anatomy sheets and handwritten prescription evidence.
ALTER TABLE app.doctor_event
  ADD COLUMN drawings jsonb NOT NULL DEFAULT '{"OD":{"template":"fundus","strokes":[]},"OS":{"template":"fundus","strokes":[]}}'::jsonb,
  ADD CONSTRAINT doctor_event_drawings_object CHECK (jsonb_typeof(drawings) = 'object');

GRANT UPDATE(drawings) ON app.doctor_event TO openeyes_app;

CREATE TABLE app.prescription_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  prescription_id uuid NOT NULL,
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 5242880),
  mime text NOT NULL CHECK (mime IN ('image/jpeg','image/png','application/pdf')),
  filename text NOT NULL CHECK (length(filename) BETWEEN 1 AND 160),
  hash text NOT NULL CHECK (hash ~ '^[a-f0-9]{64}$'),
  actor_id uuid NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, prescription_id, hash),
  FOREIGN KEY (tenant_id, prescription_id) REFERENCES app.prescription(tenant_id, id),
  FOREIGN KEY (tenant_id, actor_id) REFERENCES app.user_account(tenant_id, id)
);

ALTER TABLE app.prescription_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.prescription_evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.prescription_evidence
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE FUNCTION app.guard_prescription_evidence() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,app AS $fn$
DECLARE parent_id uuid; parent_tenant uuid; current_status text;
BEGIN
  IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Evidence is immutable' USING ERRCODE='42501'; END IF;
  IF TG_OP='DELETE' THEN parent_id:=OLD.prescription_id;parent_tenant:=OLD.tenant_id;
  ELSE parent_id:=NEW.prescription_id;parent_tenant:=NEW.tenant_id; END IF;
  SELECT status INTO current_status FROM app.prescription
    WHERE id=parent_id AND tenant_id=parent_tenant FOR UPDATE;
  IF current_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Signed prescription evidence is immutable' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $fn$;

CREATE TRIGGER prescription_evidence_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON app.prescription_evidence
  FOR EACH ROW EXECUTE FUNCTION app.guard_prescription_evidence();
REVOKE ALL ON FUNCTION app.guard_prescription_evidence() FROM PUBLIC;
GRANT SELECT,INSERT,DELETE ON app.prescription_evidence TO openeyes_app;
