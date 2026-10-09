-- Structured longitudinal history and tenant-configurable visit outcomes.

ALTER TABLE app.patient_history
  ADD COLUMN title text NOT NULL DEFAULT 'Clinical history',
  ADD COLUMN status text NOT NULL DEFAULT 'active',
  ADD COLUMN laterality text NOT NULL DEFAULT 'none',
  ADD COLUMN onset_date date,
  ADD COLUMN resolved_date date,
  ADD CONSTRAINT patient_history_title_check CHECK (length(title) BETWEEN 2 AND 160),
  ADD CONSTRAINT patient_history_status_check CHECK (status IN ('active','resolved')),
  ADD CONSTRAINT patient_history_laterality_check CHECK (laterality IN ('none','OD','OS','OU')),
  ADD CONSTRAINT patient_history_resolution_check CHECK (
    (status='active' AND resolved_date IS NULL)
    OR (status='resolved' AND resolved_date IS NOT NULL)
  ),
  ADD CONSTRAINT patient_history_dates_check CHECK (
    onset_date IS NULL OR resolved_date IS NULL OR resolved_date >= onset_date
  );

UPDATE app.patient_history
SET title=initcap(category)
WHERE title='Clinical history';

CREATE TABLE app.clinical_outcome (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  code text NOT NULL CHECK (code ~ '^[a-z][a-z0-9_]{1,59}$'),
  label text NOT NULL CHECK (length(label) BETWEEN 2 AND 120),
  active boolean NOT NULL DEFAULT true,
  requires_recall boolean NOT NULL DEFAULT false,
  requires_notes boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order BETWEEN 0 AND 1000),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,code),
  FOREIGN KEY(tenant_id) REFERENCES app.tenant(id)
);

ALTER TABLE app.clinical_outcome ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.clinical_outcome FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.clinical_outcome
  USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);

GRANT SELECT,INSERT ON app.clinical_outcome TO openeyes_app;
GRANT UPDATE(label,active,requires_recall,requires_notes,display_order,revision,updated_at)
  ON app.clinical_outcome TO openeyes_app;

CREATE FUNCTION app.seed_clinical_outcomes(target_tenant uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
  INSERT INTO app.clinical_outcome
    (tenant_id,code,label,requires_recall,requires_notes,display_order)
  VALUES
    (target_tenant,'follow_up','Follow-up',true,true,10),
    (target_tenant,'discharge','Discharge',false,false,20),
    (target_tenant,'investigation','Further investigation',true,true,30),
    (target_tenant,'procedure_planning','Procedure planning',true,true,40),
    (target_tenant,'surgery_planning','Surgery planning',true,true,50),
    (target_tenant,'external_referral','External referral',true,true,60)
  ON CONFLICT (tenant_id,code) DO NOTHING;
$$;
REVOKE ALL ON FUNCTION app.seed_clinical_outcomes(uuid) FROM PUBLIC;

SELECT app.seed_clinical_outcomes(id) FROM app.tenant;

CREATE FUNCTION app.provision_clinical_outcomes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
  PERFORM app.seed_clinical_outcomes(NEW.id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app.provision_clinical_outcomes() FROM PUBLIC;
CREATE TRIGGER tenant_clinical_outcomes
  AFTER INSERT ON app.tenant
  FOR EACH ROW EXECUTE FUNCTION app.provision_clinical_outcomes();

ALTER TABLE app.doctor_event
  ADD COLUMN outcome_id uuid,
  ADD COLUMN outcome_code text,
  ADD COLUMN outcome_label text,
  ADD COLUMN outcome_notes text NOT NULL DEFAULT '',
  ADD COLUMN recall_date date,
  ADD CONSTRAINT doctor_event_outcome_fk
    FOREIGN KEY(tenant_id,outcome_id) REFERENCES app.clinical_outcome(tenant_id,id),
  ADD CONSTRAINT doctor_event_outcome_identity_check CHECK (
    (outcome_id IS NULL AND outcome_code IS NULL AND outcome_label IS NULL)
    OR (outcome_id IS NOT NULL AND outcome_code IS NOT NULL AND outcome_label IS NOT NULL)
  ),
  ADD CONSTRAINT doctor_event_outcome_notes_check CHECK (length(outcome_notes) <= 2000);

GRANT UPDATE(outcome_id,outcome_code,outcome_label,outcome_notes,recall_date)
  ON app.doctor_event TO openeyes_app;
