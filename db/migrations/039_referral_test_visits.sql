-- Machine-test-only visits: patients referred by an outside doctor for tests on
-- the hospital's machines. Reception records the referral and the requested
-- tests; a senior technician confirms them before the patient goes to the
-- machines; the visit closes when the last test is finished and reception
-- prints the results for the referring doctor.

ALTER TABLE app.encounter DROP CONSTRAINT encounter_visit_type_check;
ALTER TABLE app.encounter ADD CONSTRAINT encounter_visit_type_check
  CHECK (visit_type IN ('general','new','follow_up','emergency','post_op','test_only'));
ALTER TABLE app.encounter
  ADD COLUMN referral_doctor text CHECK (referral_doctor IS NULL OR length(referral_doctor) BETWEEN 2 AND 120),
  ADD COLUMN referral_source text NOT NULL DEFAULT '' CHECK (length(referral_source) <= 120),
  ADD CONSTRAINT encounter_referral_test_only CHECK ((visit_type = 'test_only') = (referral_doctor IS NOT NULL));

-- 'requested' tests come from the referral and wait for the senior technician.
ALTER TABLE app.machine_order DROP CONSTRAINT machine_order_status_check;
ALTER TABLE app.machine_order ADD CONSTRAINT machine_order_status_check
  CHECK (status IN ('requested','awaiting_approval','ordered','done','not_done','declined'));
ALTER TABLE app.machine_order DROP CONSTRAINT machine_order_check;
ALTER TABLE app.machine_order ADD CONSTRAINT machine_order_open_unresulted
  CHECK ((status IN ('requested','awaiting_approval','ordered')) = (resulted_at IS NULL));
DROP INDEX app.machine_order_open;
CREATE UNIQUE INDEX machine_order_open ON app.machine_order(tenant_id, encounter_id, machine_id, eye) WHERE status IN ('requested','awaiting_approval','ordered');

-- The referral letter, as a photo or PDF; up to three per visit.
CREATE TABLE app.referral_document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  encounter_id uuid NOT NULL,
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 5242880),
  mime text NOT NULL CHECK (mime IN ('image/jpeg','image/png','application/pdf')),
  filename text NOT NULL CHECK (length(filename) BETWEEN 1 AND 160),
  hash text NOT NULL CHECK (hash ~ '^[a-f0-9]{64}$'),
  actor_id uuid NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, encounter_id, hash),
  FOREIGN KEY (tenant_id, encounter_id) REFERENCES app.encounter(tenant_id, id),
  FOREIGN KEY (tenant_id, actor_id) REFERENCES app.user_account(tenant_id, id)
);
ALTER TABLE app.referral_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.referral_document FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.referral_document
  USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT, INSERT ON app.referral_document TO openeyes_app;
