ALTER TABLE app.patient ADD COLUMN version integer NOT NULL DEFAULT 1;
GRANT UPDATE(given_name,family_name,dob,dob_estimated,gender,phone_e164,city,address,preferred_language,next_of_kin_name,next_of_kin_phone,version) ON app.patient TO openeyes_app;
ALTER TABLE app.appointment DROP CONSTRAINT appointment_status_check;
ALTER TABLE app.appointment ADD CONSTRAINT appointment_status_check CHECK(status IN ('booked','checked_in','cancelled','no_show','rescheduled'));
ALTER TABLE app.appointment DROP CONSTRAINT appointment_tenant_id_doctor_id_appointment_date_slot_time_key;
ALTER TABLE app.appointment DROP CONSTRAINT appointment_tenant_id_patient_id_appointment_date_key;
CREATE UNIQUE INDEX appointment_active_slot ON app.appointment(tenant_id,doctor_id,appointment_date,slot_time) WHERE status IN ('booked','checked_in');
CREATE UNIQUE INDEX appointment_active_patient_day ON app.appointment(tenant_id,patient_id,appointment_date) WHERE status IN ('booked','checked_in');
ALTER TABLE app.appointment ADD COLUMN version integer NOT NULL DEFAULT 1, ADD COLUMN change_reason text NOT NULL DEFAULT '', ADD COLUMN replaces_id uuid;
ALTER TABLE app.appointment ADD FOREIGN KEY(tenant_id,replaces_id) REFERENCES app.appointment(tenant_id,id);
GRANT UPDATE(version,change_reason) ON app.appointment TO openeyes_app;
ALTER TABLE app.encounter ADD COLUMN priority text NOT NULL DEFAULT 'routine' CHECK(priority IN ('routine','urgent')), ADD COLUMN closure_reason text NOT NULL DEFAULT '';
GRANT UPDATE(priority,closure_reason) ON app.encounter TO openeyes_app;
INSERT INTO app.permission(code) VALUES('patient:edit'),('appointment:manage'),('queue:manage') ON CONFLICT DO NOTHING;
INSERT INTO app.role_permission(tenant_id,role_code,permission_code)
 SELECT r.tenant_id,r.code,p.permission FROM app.role r CROSS JOIN (VALUES
 ('receptionist','patient:edit'),('hospital_admin','patient:edit'),('receptionist','appointment:manage'),('hospital_admin','appointment:manage'),('receptionist','queue:manage'),('hospital_admin','queue:manage'),('nurse','queue:manage'),('doctor','queue:manage')) AS p(role,permission) WHERE r.code=p.role ON CONFLICT DO NOTHING;
