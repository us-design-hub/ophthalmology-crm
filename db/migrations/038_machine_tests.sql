-- Machine tests: an editable list of the hospital's machines, ordered for a
-- visit by the senior technician (at workup review) or the doctor (during the
-- consultation), and recorded by the machine operator with an optional report.
-- A visit's own pathway becomes workup, then dilation when a test needs it,
-- then machine tests ('testing'), then the doctor.

CREATE TABLE app.machine (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenant(id),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 80),
  purpose text NOT NULL DEFAULT '' CHECK (length(purpose) <= 160),
  needs_dilation boolean NOT NULL DEFAULT false,
  -- Tests with injected dye (angiography) need a doctor's approval before running.
  needs_doctor_approval boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 100,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, name)
);
-- Tests a clinic usually needs; pre-ticked for the senior technician to confirm.
CREATE TABLE app.machine_suggestion (
  tenant_id uuid NOT NULL,
  facility_id uuid NOT NULL,
  machine_id uuid NOT NULL,
  PRIMARY KEY (tenant_id, facility_id, machine_id),
  FOREIGN KEY (tenant_id, facility_id) REFERENCES app.facility(tenant_id, id),
  FOREIGN KEY (tenant_id, machine_id) REFERENCES app.machine(tenant_id, id) ON DELETE CASCADE
);
CREATE TABLE app.machine_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  encounter_id uuid NOT NULL,
  machine_id uuid NOT NULL,
  eye text NOT NULL CHECK (eye IN ('OD','OS','OU')),
  status text NOT NULL DEFAULT 'ordered' CHECK (status IN ('awaiting_approval','ordered','done','not_done','declined')),
  ordered_by uuid NOT NULL,
  ordered_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  findings text NOT NULL DEFAULT '' CHECK (length(findings) <= 2000),
  key_values text NOT NULL DEFAULT '' CHECK (length(key_values) <= 400),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 240),
  resulted_by uuid,
  resulted_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, encounter_id) REFERENCES app.encounter(tenant_id, id),
  FOREIGN KEY (tenant_id, machine_id) REFERENCES app.machine(tenant_id, id),
  FOREIGN KEY (tenant_id, ordered_by) REFERENCES app.user_account(tenant_id, id),
  FOREIGN KEY (tenant_id, approved_by) REFERENCES app.user_account(tenant_id, id),
  FOREIGN KEY (tenant_id, resulted_by) REFERENCES app.user_account(tenant_id, id),
  CHECK ((status IN ('awaiting_approval','ordered')) = (resulted_at IS NULL)),
  CHECK (status <> 'done' OR length(findings) >= 3)
);
-- One open order per machine and eye on a visit.
CREATE UNIQUE INDEX machine_order_open ON app.machine_order(tenant_id, encounter_id, machine_id, eye) WHERE status IN ('awaiting_approval','ordered');
CREATE INDEX machine_order_worklist ON app.machine_order(tenant_id, status, ordered_at);
CREATE TABLE app.machine_report (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  order_id uuid NOT NULL,
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 5242880),
  mime text NOT NULL CHECK (mime IN ('image/jpeg','image/png','application/pdf')),
  filename text NOT NULL CHECK (length(filename) BETWEEN 1 AND 160),
  hash text NOT NULL CHECK (hash ~ '^[a-f0-9]{64}$'),
  actor_id uuid NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, order_id, hash),
  FOREIGN KEY (tenant_id, order_id) REFERENCES app.machine_order(tenant_id, id),
  FOREIGN KEY (tenant_id, actor_id) REFERENCES app.user_account(tenant_id, id)
);

DO $policies$ DECLARE item text; BEGIN
  FOREACH item IN ARRAY ARRAY['machine','machine_suggestion','machine_order','machine_report'] LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', item);
    EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY', item);
    EXECUTE format('CREATE POLICY tenant_isolation ON app.%I USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)', item);
  END LOOP;
END $policies$;
GRANT SELECT, INSERT ON app.machine, app.machine_order, app.machine_report TO openeyes_app;
GRANT SELECT, INSERT, DELETE ON app.machine_suggestion TO openeyes_app;
GRANT UPDATE(name, purpose, needs_dilation, needs_doctor_approval, active, display_order, revision) ON app.machine TO openeyes_app;
GRANT UPDATE(status, approved_by, approved_at, findings, key_values, note, resulted_by, resulted_at, version) ON app.machine_order TO openeyes_app;
-- Ordering tests reshapes the visit's own pathway (dilation first when needed).
GRANT UPDATE(pathway_steps) ON app.encounter TO openeyes_app;

-- Example machines and starting clinic suggestions for a hospital; hospitals
-- rename, add or switch these off in Administration. Setup scripts call this for
-- hospitals created after this migration. Safe to run again.
CREATE FUNCTION app.provision_example_machines(hospital uuid) RETURNS void
LANGUAGE sql SET search_path=pg_catalog,app AS $fn$
  INSERT INTO app.machine(tenant_id, name, purpose, needs_dilation, needs_doctor_approval, display_order)
  SELECT hospital, example.name, example.purpose, example.dilation, example.approval, example.position
  FROM (VALUES
    ('OCT', 'Retina and optic nerve scan', false, false, 10),
    ('Visual field analyser', 'Glaucoma and nerve damage', false, false, 20),
    ('Fundus camera', 'Retina photographs', true, false, 30),
    ('Biometry (IOL Master / A-scan)', 'Lens power before cataract surgery', false, false, 40),
    ('Corneal topography', 'Cornea shape', false, false, 50),
    ('B-scan ultrasound', 'Inside the eye when the view is blocked', false, false, 60),
    ('Fluorescein angiography (FFA)', 'Retinal blood vessels, with dye injection', true, true, 70)
  ) AS example(name, purpose, dilation, approval, position)
  ON CONFLICT DO NOTHING;
  -- Starting suggestions match the clinics' previous fixed steps.
  INSERT INTO app.machine_suggestion(tenant_id, facility_id, machine_id)
  SELECT f.tenant_id, f.id, m.id
  FROM app.facility f JOIN app.machine m ON m.tenant_id = f.tenant_id
  WHERE f.tenant_id = hospital AND f.type = 'clinic' AND (
    (lower(f.specialty) = 'glaucoma' AND m.name IN ('Visual field analyser', 'OCT')) OR
    (lower(f.specialty) = 'retina' AND m.name IN ('OCT', 'Fundus camera')))
  ON CONFLICT DO NOTHING;
$fn$;
REVOKE ALL ON FUNCTION app.provision_example_machines(uuid) FROM PUBLIC;
SELECT app.provision_example_machines(id) FROM app.tenant;

-- machine:order is held by those who decide on tests; machine:write records them.
INSERT INTO app.permission(code) VALUES ('machine:order'), ('machine:write') ON CONFLICT DO NOTHING;
INSERT INTO app.role_permission(tenant_id, role_code, permission_code)
SELECT role.tenant_id, role.code, grant_row.permission
FROM app.role AS role
JOIN (VALUES ('senior_technician','machine:order'), ('doctor','machine:order'), ('machine_operator','machine:write')) AS grant_row(role_code, permission)
  ON grant_row.role_code = role.code
ON CONFLICT DO NOTHING;
