-- Assign an accountable operating surgeon to every surgical case and index the daily theatre list.

ALTER TABLE app.surgery_case ADD COLUMN surgeon_id uuid;

UPDATE app.surgery_case c
SET surgeon_id=e.doctor_id
FROM app.encounter e
WHERE e.tenant_id=c.tenant_id AND e.id=c.encounter_id;

ALTER TABLE app.surgery_case
  ALTER COLUMN surgeon_id SET NOT NULL,
  ADD CONSTRAINT surgery_case_surgeon_fk
    FOREIGN KEY (tenant_id,surgeon_id) REFERENCES app.user_account(tenant_id,id);

CREATE INDEX surgery_case_theatre_worklist
  ON app.surgery_case(tenant_id,facility_id,scheduled_at,stage)
  WHERE stage<>'cancelled';

GRANT UPDATE(surgeon_id) ON app.surgery_case TO openeyes_app;
