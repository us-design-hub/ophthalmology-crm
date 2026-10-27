-- Reception-first registration: the system MR number is the patient's main
-- identifier, national ID and phone can follow later, a visit may wait for a
-- doctor, and emergencies are fast-tracked to the consultation list.

-- National ID is optional. The four ID columns are filled together or not at all.
ALTER TABLE app.patient
  ALTER COLUMN identifier_type DROP NOT NULL,
  ALTER COLUMN identifier_encrypted DROP NOT NULL,
  ALTER COLUMN identifier_blind_index DROP NOT NULL,
  ALTER COLUMN identifier_last4 DROP NOT NULL,
  ALTER COLUMN phone_e164 DROP NOT NULL;
ALTER TABLE app.patient ADD CONSTRAINT patient_identifier_complete CHECK (
  (identifier_type IS NULL) = (identifier_encrypted IS NULL)
  AND (identifier_type IS NULL) = (identifier_blind_index IS NULL)
  AND (identifier_type IS NULL) = (identifier_last4 IS NULL));

-- MR numbers shown when reception opens the form. A held number belongs to one
-- receptionist until saved; a released or expired hold is reissued before any
-- new number, so cancelled forms leave no gaps.
CREATE TABLE app.mrn_hold (
  tenant_id uuid NOT NULL REFERENCES app.tenant(id),
  year integer NOT NULL,
  sequence bigint NOT NULL CHECK (sequence > 0),
  holder_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, year, sequence),
  FOREIGN KEY (tenant_id, holder_id) REFERENCES app.user_account(tenant_id, id)
);
CREATE INDEX mrn_hold_holder ON app.mrn_hold(tenant_id, holder_id);
ALTER TABLE app.mrn_hold ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.mrn_hold FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.mrn_hold
  USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON app.mrn_hold TO openeyes_app;

-- A visit can be queued before a doctor is chosen. The composite foreign keys
-- are not checked while doctor_id is null, and consultation requires a doctor.
ALTER TABLE app.appointment ALTER COLUMN doctor_id DROP NOT NULL;
ALTER TABLE app.encounter ALTER COLUMN doctor_id DROP NOT NULL;
GRANT UPDATE(doctor_id) ON app.appointment TO openeyes_app;
GRANT UPDATE(doctor_id) ON app.encounter TO openeyes_app;

-- Emergency triage reason, recorded at the desk.
ALTER TABLE app.encounter ADD COLUMN emergency_reason text CHECK (
  emergency_reason IN ('chemical_injury','trauma','sudden_vision_loss','pain_red_eye'));
GRANT UPDATE(emergency_reason) ON app.encounter TO openeyes_app;
