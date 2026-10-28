-- Lab tests at the visit: blood pressure and blood sugar, done by the lab
-- assistant alongside the queue rather than as a queue stage. Orders are
-- raised automatically at check-in from the patient's history or added by
-- clinical staff; results are flagged when outside the normal range.

CREATE TABLE app.lab_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  encounter_id uuid NOT NULL,
  test text NOT NULL CHECK (test IN ('bp','sugar')),
  -- Why the test was ordered: a rule code, or 'manual' for staff orders.
  reasons text[] NOT NULL CHECK (cardinality(reasons) BETWEEN 1 AND 6),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','not_done')),
  ordered_by uuid,
  ordered_at timestamptz NOT NULL DEFAULT now(),
  result jsonb CHECK (result IS NULL OR jsonb_typeof(result)='object'),
  abnormal boolean,
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 240),
  resulted_by uuid,
  resulted_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, encounter_id, test),
  FOREIGN KEY (tenant_id, encounter_id) REFERENCES app.encounter(tenant_id, id),
  FOREIGN KEY (tenant_id, ordered_by) REFERENCES app.user_account(tenant_id, id),
  FOREIGN KEY (tenant_id, resulted_by) REFERENCES app.user_account(tenant_id, id),
  CHECK ((status = 'pending') = (resulted_at IS NULL)),
  CHECK (status <> 'done' OR (result IS NOT NULL AND abnormal IS NOT NULL))
);
CREATE INDEX lab_order_worklist ON app.lab_order(tenant_id, status, ordered_at);
ALTER TABLE app.lab_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.lab_order FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.lab_order
  USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT, INSERT ON app.lab_order TO openeyes_app;
GRANT UPDATE(reasons, status, result, abnormal, note, resulted_by, resulted_at, version) ON app.lab_order TO openeyes_app;

-- lab:write records results (lab assistant); lab:order adds a test for a patient.
INSERT INTO app.permission(code) VALUES ('lab:write'), ('lab:order') ON CONFLICT DO NOTHING;
INSERT INTO app.role_permission(tenant_id, role_code, permission_code)
SELECT role.tenant_id, role.code, grant_row.permission
FROM app.role AS role
JOIN (VALUES ('lab_assistant','lab:write'), ('nurse','lab:order'), ('senior_technician','lab:order'),
             ('optometrist','lab:order'), ('doctor','lab:order')) AS grant_row(role_code, permission)
  ON grant_row.role_code = role.code
ON CONFLICT DO NOTHING;
