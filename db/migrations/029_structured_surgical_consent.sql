-- Add immutable, versioned surgical consent with explicit confirmation and withdrawal events.

CREATE TABLE app.surgery_consent_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  version integer NOT NULL CHECK (version>0),
  eye text NOT NULL CHECK (eye IN ('OD','OS')),
  procedure_snapshot text NOT NULL CHECK (length(procedure_snapshot) BETWEEN 3 AND 240),
  statement_version text NOT NULL CHECK (length(statement_version) BETWEEN 3 AND 80),
  signatory_type text NOT NULL CHECK (signatory_type IN ('patient','guardian')),
  signatory_name text NOT NULL CHECK (length(signatory_name) BETWEEN 2 AND 160),
  relationship text NOT NULL DEFAULT '' CHECK (length(relationship)<=120),
  witness_name text NOT NULL CHECK (length(witness_name) BETWEEN 2 AND 160),
  witness_role text NOT NULL CHECK (length(witness_role) BETWEEN 2 AND 120),
  evidence_hash text NOT NULL CHECK (evidence_hash ~ '^[0-9a-f]{64}$'),
  record_hash text NOT NULL CHECK (record_hash ~ '^[0-9a-f]{64}$'),
  source text NOT NULL DEFAULT 'structured' CHECK (source IN ('structured','legacy')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,case_id,version),
  FOREIGN KEY (tenant_id,case_id) REFERENCES app.surgery_case(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by) REFERENCES app.user_account(tenant_id,id),
  CHECK ((signatory_type='guardian' AND length(relationship)>=2) OR (signatory_type='patient' AND relationship=''))
);

CREATE TABLE app.surgery_consent_event (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL,
  consent_version_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('created','confirmed','withdrawn')),
  reason text NOT NULL DEFAULT '' CHECK (
    (action='withdrawn' AND length(reason) BETWEEN 8 AND 500)
    OR (action<>'withdrawn' AND reason='')
  ),
  actor_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,consent_version_id,action),
  FOREIGN KEY (tenant_id,consent_version_id) REFERENCES app.surgery_consent_version(tenant_id,id),
  FOREIGN KEY (tenant_id,actor_id) REFERENCES app.user_account(tenant_id,id)
);

ALTER TABLE app.consent_document ADD COLUMN consent_version_id uuid;

WITH ranked AS (
  SELECT d.*,row_number() OVER(PARTITION BY d.tenant_id,d.case_id ORDER BY d.at,d.id)::integer AS consent_version
  FROM app.consent_document d
)
INSERT INTO app.surgery_consent_version
  (id,tenant_id,case_id,version,eye,procedure_snapshot,statement_version,signatory_type,signatory_name,relationship,witness_name,witness_role,evidence_hash,record_hash,source,created_by,created_at)
SELECT r.id,r.tenant_id,r.case_id,r.consent_version,r.eye,c.procedure,'legacy-upload-v1','patient','Legacy signed consent','',r.witness,'Recorded witness',r.hash,r.hash,'legacy',r.actor_id,r.at
FROM ranked r JOIN app.surgery_case c ON c.tenant_id=r.tenant_id AND c.id=r.case_id;

INSERT INTO app.surgery_consent_event(tenant_id,consent_version_id,action,actor_id,at)
SELECT tenant_id,id,'created',created_by,created_at FROM app.surgery_consent_version WHERE source='legacy';
INSERT INTO app.surgery_consent_event(tenant_id,consent_version_id,action,actor_id,at)
SELECT tenant_id,id,'confirmed',created_by,created_at FROM app.surgery_consent_version WHERE source='legacy';

UPDATE app.consent_document SET consent_version_id=id;
ALTER TABLE app.consent_document
  ALTER COLUMN consent_version_id SET NOT NULL,
  ADD CONSTRAINT consent_document_version_fk
    FOREIGN KEY (tenant_id,consent_version_id) REFERENCES app.surgery_consent_version(tenant_id,id),
  ADD CONSTRAINT consent_document_one_evidence UNIQUE (tenant_id,consent_version_id);

DO $policies$
DECLARE item text;
BEGIN
  FOREACH item IN ARRAY ARRAY['surgery_consent_version','surgery_consent_event'] LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',item);
    EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',item);
    EXECUTE format('CREATE POLICY tenant_isolation ON app.%I USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',item);
  END LOOP;
END
$policies$;

CREATE FUNCTION app.guard_surgery_consent_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,app AS $fn$
BEGIN
  RAISE EXCEPTION 'Surgical consent history is immutable';
END
$fn$;
REVOKE ALL ON FUNCTION app.guard_surgery_consent_immutable() FROM PUBLIC;

CREATE TRIGGER surgery_consent_version_immutable
  BEFORE UPDATE OR DELETE ON app.surgery_consent_version
  FOR EACH ROW EXECUTE FUNCTION app.guard_surgery_consent_immutable();
CREATE TRIGGER surgery_consent_event_immutable
  BEFORE UPDATE OR DELETE ON app.surgery_consent_event
  FOR EACH ROW EXECUTE FUNCTION app.guard_surgery_consent_immutable();

CREATE FUNCTION app.validate_surgery_consent_event() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,app AS $fn$
DECLARE consent app.surgery_consent_version%ROWTYPE;
BEGIN
  SELECT * INTO consent FROM app.surgery_consent_version WHERE id=NEW.consent_version_id;
  IF NEW.action='created' AND NEW.actor_id<>consent.created_by THEN
    RAISE EXCEPTION 'Consent creator mismatch';
  END IF;
  IF NEW.action IN ('confirmed','withdrawn') AND consent.source='structured' AND NOT EXISTS (
    SELECT 1 FROM app.user_role WHERE tenant_id=NEW.tenant_id AND user_id=NEW.actor_id AND role_code='doctor'
  ) THEN
    RAISE EXCEPTION 'A doctor must confirm or withdraw consent';
  END IF;
  IF NEW.action='confirmed' AND NOT EXISTS (
    SELECT 1 FROM app.surgery_consent_event WHERE consent_version_id=NEW.consent_version_id AND action='created'
  ) THEN RAISE EXCEPTION 'Consent must be created before confirmation'; END IF;
  IF NEW.action='withdrawn' AND NOT EXISTS (
    SELECT 1 FROM app.surgery_consent_event WHERE consent_version_id=NEW.consent_version_id AND action='confirmed'
  ) THEN RAISE EXCEPTION 'Consent must be confirmed before withdrawal'; END IF;
  IF consent.source='structured' AND NEW.action IN ('confirmed','withdrawn') AND consent.version<>(
    SELECT max(version) FROM app.surgery_consent_version WHERE case_id=consent.case_id
  ) THEN RAISE EXCEPTION 'Only the current consent version can change state'; END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION app.validate_surgery_consent_event() FROM PUBLIC;
CREATE TRIGGER surgery_consent_event_valid
  BEFORE INSERT ON app.surgery_consent_event
  FOR EACH ROW EXECUTE FUNCTION app.validate_surgery_consent_event();

CREATE INDEX surgery_consent_case_versions ON app.surgery_consent_version(tenant_id,case_id,version DESC);
CREATE INDEX surgery_consent_event_history ON app.surgery_consent_event(tenant_id,consent_version_id,sequence DESC);

GRANT SELECT,INSERT ON app.surgery_consent_version,app.surgery_consent_event TO openeyes_app;
GRANT USAGE,SELECT ON SEQUENCE app.surgery_consent_event_sequence_seq TO openeyes_app;

