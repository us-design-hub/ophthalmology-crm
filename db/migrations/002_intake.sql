CREATE TABLE app.clinic_schedule (
 tenant_id uuid NOT NULL, facility_id uuid NOT NULL, start_minute integer NOT NULL CHECK(start_minute>=0), end_minute integer NOT NULL CHECK(end_minute<=1440 AND end_minute>start_minute), slot_minutes integer NOT NULL CHECK(slot_minutes BETWEEN 5 AND 60),
 PRIMARY KEY(tenant_id,facility_id), FOREIGN KEY(tenant_id,facility_id) REFERENCES app.facility(tenant_id,id)
);
CREATE TABLE app.clinic_doctor (
 tenant_id uuid NOT NULL, facility_id uuid NOT NULL, doctor_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,facility_id,doctor_id), FOREIGN KEY(tenant_id,facility_id) REFERENCES app.clinic_schedule(tenant_id,facility_id), FOREIGN KEY(tenant_id,doctor_id) REFERENCES app.user_account(tenant_id,id)
);
CREATE TABLE app.appointment (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, patient_id uuid NOT NULL, facility_id uuid NOT NULL, doctor_id uuid NOT NULL,
 appointment_date date NOT NULL, slot_time time NOT NULL, status text NOT NULL DEFAULT 'booked' CHECK(status IN ('booked','checked_in')), created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,doctor_id,appointment_date,slot_time), UNIQUE(tenant_id,patient_id,appointment_date), UNIQUE(tenant_id,id,patient_id,facility_id,doctor_id),
 FOREIGN KEY(tenant_id,patient_id) REFERENCES app.patient(tenant_id,id), FOREIGN KEY(tenant_id,facility_id,doctor_id) REFERENCES app.clinic_doctor(tenant_id,facility_id,doctor_id), FOREIGN KEY(tenant_id,created_by) REFERENCES app.user_account(tenant_id,id)
);
CREATE TABLE app.encounter (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, appointment_id uuid NOT NULL, patient_id uuid NOT NULL, facility_id uuid NOT NULL, doctor_id uuid NOT NULL,
 stage text NOT NULL DEFAULT 'waiting' CHECK(stage IN ('waiting','workup','dilation','consultation')), version integer NOT NULL DEFAULT 1 CHECK(version>0),
 checked_in_at timestamptz NOT NULL DEFAULT now(), stage_at timestamptz NOT NULL DEFAULT now(), dilation_ready_at timestamptz, closed_at timestamptz,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,appointment_id), FOREIGN KEY(tenant_id,appointment_id,patient_id,facility_id,doctor_id) REFERENCES app.appointment(tenant_id,id,patient_id,facility_id,doctor_id)
);
CREATE UNIQUE INDEX encounter_one_active_patient ON app.encounter(tenant_id,patient_id) WHERE closed_at IS NULL;
CREATE INDEX encounter_queue ON app.encounter(tenant_id,facility_id,stage_at) WHERE closed_at IS NULL;
CREATE TABLE app.queue_transition (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, encounter_id uuid NOT NULL, from_stage text, to_stage text NOT NULL CHECK(to_stage IN ('waiting','workup','dilation','consultation')),
 encounter_version integer NOT NULL, actor_id uuid NOT NULL, at timestamptz NOT NULL DEFAULT now(), reason text NOT NULL DEFAULT '',
 UNIQUE(tenant_id,encounter_id,encounter_version), FOREIGN KEY(tenant_id,encounter_id) REFERENCES app.encounter(tenant_id,id), FOREIGN KEY(tenant_id,actor_id) REFERENCES app.user_account(tenant_id,id)
);
CREATE TABLE app.workup_revision (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, encounter_id uuid NOT NULL, version integer NOT NULL CHECK(version>0),
 author_id uuid NOT NULL, saved_at timestamptz NOT NULL DEFAULT now(), notes text NOT NULL DEFAULT '' CHECK(length(notes)<=1000),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,encounter_id,version), FOREIGN KEY(tenant_id,encounter_id) REFERENCES app.encounter(tenant_id,id), FOREIGN KEY(tenant_id,author_id) REFERENCES app.user_account(tenant_id,id)
);
CREATE TABLE app.workup_eye (
 tenant_id uuid NOT NULL, revision_id uuid NOT NULL, eye text NOT NULL CHECK(eye IN ('OD','OS')),
 uncorrected text NOT NULL, pinhole text NOT NULL, corrected text NOT NULL, iop numeric NOT NULL CHECK(iop BETWEEN 1 AND 80), method text NOT NULL CHECK(method IN ('Goldmann','NCT','Tonopen')), measured_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,revision_id,eye), FOREIGN KEY(tenant_id,revision_id) REFERENCES app.workup_revision(tenant_id,id),
 CHECK (uncorrected=ANY(ARRAY['6/4','6/5','6/6','6/9','6/12','6/18','6/24','6/36','6/60','3/60','1/60','CF','HM','PL','NPL','not_tested'])),
 CHECK (pinhole=ANY(ARRAY['6/4','6/5','6/6','6/9','6/12','6/18','6/24','6/36','6/60','3/60','1/60','CF','HM','PL','NPL','not_tested'])),
 CHECK (corrected=ANY(ARRAY['6/4','6/5','6/6','6/9','6/12','6/18','6/24','6/36','6/60','3/60','1/60','CF','HM','PL','NPL','not_tested']))
);
DO $policies$
DECLARE item text;
BEGIN
 FOREACH item IN ARRAY ARRAY['clinic_schedule','clinic_doctor','appointment','encounter','queue_transition','workup_revision','workup_eye'] LOOP
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',item);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',item);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I USING (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',item);
 END LOOP;
END $policies$;
GRANT SELECT ON app.clinic_schedule,app.clinic_doctor TO openeyes_app;
GRANT SELECT,INSERT ON app.appointment,app.encounter,app.queue_transition,app.workup_revision,app.workup_eye TO openeyes_app;
GRANT UPDATE(status) ON app.appointment TO openeyes_app;
GRANT UPDATE(stage,version,stage_at,dilation_ready_at) ON app.encounter TO openeyes_app;

INSERT INTO app.permission(code) VALUES ('intake:read'),('appointment:create'),('appointment:checkin'),('queue:workup'),('workup:read'),('workup:write'),('queue:handoff') ON CONFLICT DO NOTHING;
INSERT INTO app.role_permission(tenant_id,role_code,permission_code)
 SELECT r.tenant_id,r.code,p.permission FROM app.role r CROSS JOIN (VALUES
 ('receptionist','intake:read'),('receptionist','appointment:create'),('receptionist','appointment:checkin'),('receptionist','queue:workup'),
 ('hospital_admin','intake:read'),('hospital_admin','appointment:create'),('hospital_admin','appointment:checkin'),('hospital_admin','queue:workup'),
 ('nurse','intake:read'),('nurse','queue:workup'),('nurse','workup:read'),('nurse','workup:write'),('nurse','queue:handoff'),
 ('optometrist','intake:read'),('optometrist','queue:workup'),('optometrist','workup:read'),('optometrist','workup:write'),('optometrist','queue:handoff'),
 ('doctor','intake:read'),('doctor','workup:read')) AS p(role,permission) WHERE r.code=p.role ON CONFLICT DO NOTHING;
