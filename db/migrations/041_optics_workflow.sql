-- Doctor-issued spectacle prescriptions and the optician fulfilment worklist.
-- Clinical measurements are immutable after issue; optics staff only update
-- dispensing status and notes. No prices, payments, or stock are recorded.

INSERT INTO app.role(tenant_id, code)
SELECT id, 'optician' FROM app.tenant
ON CONFLICT DO NOTHING;

INSERT INTO app.permission(code) VALUES ('optics:order'), ('optics:write')
ON CONFLICT DO NOTHING;

INSERT INTO app.role_permission(tenant_id, role_code, permission_code)
SELECT role.tenant_id, role.code, grant_row.permission
FROM app.role AS role
JOIN (VALUES
  ('doctor', 'optics:order'),
  ('optician', 'patient:read'),
  ('optician', 'optics:write')
) AS grant_row(role_code, permission) ON grant_row.role_code=role.code
ON CONFLICT DO NOTHING;

CREATE TABLE app.spectacle_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  encounter_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  doctor_event_id uuid NOT NULL,
  prescribed_by uuid NOT NULL,
  prescribed_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','in_progress','ready','collected','cancelled')),
  od_sphere numeric(5,2) NOT NULL CHECK (od_sphere BETWEEN -30 AND 30),
  od_cylinder numeric(5,2) CHECK (od_cylinder BETWEEN -10 AND 10),
  od_axis smallint CHECK (od_axis BETWEEN 0 AND 180),
  od_add numeric(4,2) CHECK (od_add BETWEEN 0 AND 6),
  od_prism text NOT NULL DEFAULT '' CHECK (length(od_prism) <= 40),
  os_sphere numeric(5,2) NOT NULL CHECK (os_sphere BETWEEN -30 AND 30),
  os_cylinder numeric(5,2) CHECK (os_cylinder BETWEEN -10 AND 10),
  os_axis smallint CHECK (os_axis BETWEEN 0 AND 180),
  os_add numeric(4,2) CHECK (os_add BETWEEN 0 AND 6),
  os_prism text NOT NULL DEFAULT '' CHECK (length(os_prism) <= 40),
  pd numeric(4,1) NOT NULL CHECK (pd BETWEEN 40 AND 80),
  lens_type text NOT NULL CHECK (lens_type IN ('distance','near','bifocal','progressive','occupational')),
  instructions text NOT NULL DEFAULT '' CHECK (length(instructions) <= 2000),
  dispensing_note text NOT NULL DEFAULT '' CHECK (length(dispensing_note) <= 1000),
  status_by uuid,
  status_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, encounter_id) REFERENCES app.encounter(tenant_id, id),
  FOREIGN KEY (tenant_id, patient_id) REFERENCES app.patient(tenant_id, id),
  FOREIGN KEY (tenant_id, doctor_event_id) REFERENCES app.doctor_event(tenant_id, id),
  FOREIGN KEY (tenant_id, prescribed_by) REFERENCES app.user_account(tenant_id, id),
  FOREIGN KEY (tenant_id, status_by) REFERENCES app.user_account(tenant_id, id),
  CHECK ((od_cylinder IS NULL OR od_cylinder = 0) OR od_axis IS NOT NULL),
  CHECK ((os_cylinder IS NULL OR os_cylinder = 0) OR os_axis IS NOT NULL)
);

CREATE UNIQUE INDEX spectacle_order_one_active_event
  ON app.spectacle_order(tenant_id, doctor_event_id)
  WHERE status <> 'cancelled';
CREATE INDEX spectacle_order_worklist
  ON app.spectacle_order(tenant_id, status, prescribed_at DESC);
CREATE INDEX spectacle_order_patient
  ON app.spectacle_order(tenant_id, patient_id, prescribed_at DESC);

ALTER TABLE app.spectacle_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.spectacle_order FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.spectacle_order
  USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT, INSERT ON app.spectacle_order TO openeyes_app;
GRANT UPDATE(status, dispensing_note, status_by, status_at, version) ON app.spectacle_order TO openeyes_app;

