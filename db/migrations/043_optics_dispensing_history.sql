-- Optional, append-only history for glasses actually supplied by hospital optics.
-- A referral does not imply a hospital dispense: patients may use an outside shop.

INSERT INTO app.permission(code) VALUES ('optics:dispense') ON CONFLICT DO NOTHING;

INSERT INTO app.role_permission(tenant_id,role_code,permission_code)
SELECT tenant_id,code,'optics:dispense' FROM app.role WHERE code='optician'
ON CONFLICT DO NOTHING;

CREATE TABLE app.spectacle_dispense (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  referral_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  dispensed_by uuid NOT NULL,
  dispensed_at date NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
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
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, referral_id) REFERENCES app.spectacle_order(tenant_id, id),
  FOREIGN KEY (tenant_id, patient_id) REFERENCES app.patient(tenant_id, id),
  FOREIGN KEY (tenant_id, dispensed_by) REFERENCES app.user_account(tenant_id, id),
  CHECK ((od_cylinder IS NULL OR od_cylinder = 0) OR od_axis IS NOT NULL),
  CHECK ((os_cylinder IS NULL OR os_cylinder = 0) OR os_axis IS NOT NULL)
);

CREATE INDEX spectacle_dispense_patient_history
  ON app.spectacle_dispense(tenant_id, patient_id, dispensed_at DESC, recorded_at DESC);
CREATE INDEX spectacle_dispense_referral
  ON app.spectacle_dispense(tenant_id, referral_id, dispensed_at DESC);

ALTER TABLE app.spectacle_dispense ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.spectacle_dispense FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.spectacle_dispense
  USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);

GRANT SELECT,INSERT ON app.spectacle_dispense TO openeyes_app;
