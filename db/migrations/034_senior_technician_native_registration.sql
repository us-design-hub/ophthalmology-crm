-- Add senior-technician review and make native registration the only patient-entry path.

INSERT INTO app.permission(code) VALUES ('workup:review') ON CONFLICT DO NOTHING;

INSERT INTO app.role(tenant_id,code)
SELECT id,'senior_technician' FROM app.tenant
ON CONFLICT DO NOTHING;

INSERT INTO app.role_permission(tenant_id,role_code,permission_code)
SELECT tenant.id,'senior_technician',permission.code
FROM app.tenant AS tenant
CROSS JOIN unnest(ARRAY[
  'reports:read','surgery:read','surgery:write','history:write','queue:manage',
  'patient:read','intake:read','queue:workup','workup:read','workup:write',
  'workup:review','queue:handoff','clinical:read'
]) AS permission(code)
ON CONFLICT DO NOTHING;

-- Technicians record the workup. Senior technicians own approval and handoff.
DELETE FROM app.role_permission
WHERE role_code='nurse' AND permission_code IN ('queue:manage','queue:handoff');

-- Patient registration and demographic correction now happen in this application.
INSERT INTO app.role_permission(tenant_id,role_code,permission_code)
SELECT tenant.id,role.code,permission.code
FROM app.tenant AS tenant
CROSS JOIN (VALUES ('receptionist'),('hospital_admin')) AS role(code)
CROSS JOIN (VALUES ('patient:create'),('patient:edit')) AS permission(code)
ON CONFLICT DO NOTHING;

CREATE TABLE app.workup_review (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  encounter_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  reviewer_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approved','returned')),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 1000),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,revision_id),
  FOREIGN KEY(tenant_id,encounter_id) REFERENCES app.encounter(tenant_id,id),
  FOREIGN KEY(tenant_id,revision_id) REFERENCES app.workup_revision(tenant_id,id),
  FOREIGN KEY(tenant_id,reviewer_id) REFERENCES app.user_account(tenant_id,id),
  CHECK (decision='approved' OR length(btrim(notes)) >= 8)
);

CREATE INDEX workup_review_encounter
  ON app.workup_review(tenant_id,encounter_id,reviewed_at DESC);

ALTER TABLE app.workup_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.workup_review FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.workup_review
  USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);

GRANT SELECT,INSERT ON app.workup_review TO openeyes_app;

-- Retire the former integration login so it cannot create sessions after deployment.
UPDATE app.user_account
SET status='disabled', version=version+1
WHERE status='active'
  AND full_name='Odoo integration'
  AND designation='Non-interactive integration identity';

-- Retain prior integration provenance as a locked archive, with no runtime access.
REVOKE ALL ON app.patient_external_identity FROM openeyes_app;
ALTER TABLE app.patient_external_identity RENAME TO retired_patient_external_identity;
COMMENT ON TABLE app.retired_patient_external_identity IS
  'Historical Odoo identity mappings retained for audit provenance; no active integration uses this table.';
