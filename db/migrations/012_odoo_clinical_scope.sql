-- Retire operational roles and permissions from the active clinical product.
-- Accounts remain for historical foreign-key and audit attribution, but cannot sign in.
UPDATE app.user_account AS account
SET status = 'disabled', version = account.version + 1
WHERE account.status = 'active'
  AND EXISTS (
    SELECT 1 FROM app.user_role AS assignment
    WHERE assignment.tenant_id = account.tenant_id
      AND assignment.user_id = account.id
      AND assignment.role_code IN ('pharmacist', 'cashier', 'inventory_officer')
  )
  AND NOT EXISTS (
    SELECT 1 FROM app.user_role AS assignment
    WHERE assignment.tenant_id = account.tenant_id
      AND assignment.user_id = account.id
      AND assignment.role_code NOT IN ('pharmacist', 'cashier', 'inventory_officer')
  );

DELETE FROM app.role_permission
WHERE role_code IN ('pharmacist', 'cashier', 'inventory_officer')
   OR permission_code IN (
     'preview:inventory', 'preview:billing', 'inventory:write',
     'pharmacy:dispense', 'billing:write', 'billing:discount',
     'billing:approve_refund', 'patient:create', 'patient:edit'
   );

-- Stable cross-system identity: an Odoo contact maps to one hospital patient.
CREATE TABLE app.patient_external_identity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  source text NOT NULL CHECK (source IN ('odoo')),
  external_id text NOT NULL CHECK (length(external_id) BETWEEN 1 AND 120),
  external_updated_at timestamptz,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  payload_hash text NOT NULL CHECK (length(payload_hash) = 64),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, source, external_id),
  UNIQUE (tenant_id, patient_id, source),
  FOREIGN KEY (tenant_id, patient_id) REFERENCES app.patient(tenant_id, id)
);

CREATE INDEX patient_external_patient
  ON app.patient_external_identity(tenant_id, patient_id);

ALTER TABLE app.patient_external_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.patient_external_identity FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.patient_external_identity
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON app.patient_external_identity TO openeyes_app;
GRANT UPDATE(patient_id, external_updated_at, last_synced_at, payload_hash)
  ON app.patient_external_identity TO openeyes_app;
