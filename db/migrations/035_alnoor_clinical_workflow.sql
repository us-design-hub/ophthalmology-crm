-- Production-backed Al-Noor workflow fields and station roles.
-- Financial, dispensing, stock and revenue functions intentionally remain retired.

ALTER TABLE app.patient
  ADD COLUMN guardian_name text NOT NULL DEFAULT '' CHECK (length(guardian_name) <= 120),
  ADD COLUMN alternate_phone text NOT NULL DEFAULT '' CHECK (length(alternate_phone) <= 30),
  ADD COLUMN alternate_relation text NOT NULL DEFAULT '' CHECK (length(alternate_relation) <= 40),
  ADD COLUMN referred_by text NOT NULL DEFAULT '' CHECK (length(referred_by) <= 120),
  ADD COLUMN programme text NOT NULL DEFAULT 'General' CHECK (length(programme) <= 120),
  ADD COLUMN medical_conditions text[] NOT NULL DEFAULT '{}',
  ADD COLUMN previous_surgery text NOT NULL DEFAULT '' CHECK (length(previous_surgery) <= 1000),
  ADD COLUMN current_medications text NOT NULL DEFAULT '' CHECK (length(current_medications) <= 1000);

ALTER TABLE app.patient ADD CONSTRAINT patient_medical_conditions_limit
  CHECK (cardinality(medical_conditions) <= 20);

GRANT UPDATE(
  given_name,family_name,gender,dob,dob_estimated,phone_e164,city,address,
  preferred_language,next_of_kin_name,next_of_kin_phone,guardian_name,
  alternate_phone,alternate_relation,referred_by,programme,medical_conditions,
  previous_surgery,current_medications,version
) ON app.patient TO openeyes_app;

ALTER TABLE app.workup_review
  ADD COLUMN assessment jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(assessment)='object');

ALTER TABLE app.workup_revision
  ADD COLUMN chief_complaint text NOT NULL DEFAULT '' CHECK (length(chief_complaint) <= 1500),
  ADD COLUMN complaint_duration text NOT NULL DEFAULT '' CHECK (length(complaint_duration) <= 120),
  ADD COLUMN wearing_glasses boolean NOT NULL DEFAULT false;

ALTER TABLE app.workup_eye
  ADD COLUMN technician jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(technician)='object');

INSERT INTO app.permission(code) VALUES ('investigation:write') ON CONFLICT DO NOTHING;

INSERT INTO app.role(tenant_id,code)
SELECT tenant.id,role.code
FROM app.tenant AS tenant
CROSS JOIN (VALUES ('lab_assistant'),('machine_operator'),('ot_coordinator')) AS role(code)
ON CONFLICT DO NOTHING;

INSERT INTO app.role_permission(tenant_id,role_code,permission_code)
SELECT tenant.id,assignment.role_code,assignment.permission_code
FROM app.tenant AS tenant
CROSS JOIN (VALUES
  ('lab_assistant','patient:read'),('lab_assistant','intake:read'),
  ('lab_assistant','workup:read'),('lab_assistant','investigation:write'),('lab_assistant','queue:handoff'),
  ('machine_operator','patient:read'),('machine_operator','intake:read'),
  ('machine_operator','workup:read'),('machine_operator','investigation:write'),('machine_operator','queue:handoff'),
  ('ot_coordinator','patient:read'),('ot_coordinator','surgery:read'),('ot_coordinator','surgery:write'),
  ('pharmacist','patient:read'),('pharmacist','prescription:read')
) AS assignment(role_code,permission_code)
ON CONFLICT DO NOTHING;

INSERT INTO app.role_permission(tenant_id,role_code,permission_code)
SELECT tenant.id,role.code,'investigation:write'
FROM app.tenant AS tenant
CROSS JOIN (VALUES ('nurse'),('senior_technician'),('optometrist')) AS role(code)
ON CONFLICT DO NOTHING;

