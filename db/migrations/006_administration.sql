ALTER TABLE app.tenant ADD COLUMN settings jsonb NOT NULL DEFAULT '{}', ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE app.tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.tenant FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_lookup ON app.tenant FOR SELECT USING (true);
CREATE POLICY tenant_update ON app.tenant FOR UPDATE USING(id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(id=nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT UPDATE(name,mrn_prefix,settings,version) ON app.tenant TO openeyes_app;
ALTER TABLE app.facility ADD COLUMN active boolean NOT NULL DEFAULT true, ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE app.user_account ADD COLUMN version integer NOT NULL DEFAULT 1, ADD COLUMN must_change_password boolean NOT NULL DEFAULT false, ADD COLUMN licence_expiry date;
ALTER TABLE app.clinic_schedule ADD COLUMN weekdays integer[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6], ADD COLUMN closed_dates date[] NOT NULL DEFAULT '{}';
GRANT INSERT ON app.facility,app.user_account,app.user_role,app.user_facility,app.clinic_schedule,app.clinic_doctor TO openeyes_app;
GRANT DELETE ON app.user_role,app.user_facility,app.clinic_doctor TO openeyes_app;
GRANT UPDATE(name,active,version) ON app.facility TO openeyes_app;
GRANT UPDATE(email,full_name,designation,licence_number,licence_expiry,status,password_hash,must_change_password,version) ON app.user_account TO openeyes_app;
GRANT UPDATE(start_minute,end_minute,slot_minutes,weekdays,closed_dates) ON app.clinic_schedule TO openeyes_app;
INSERT INTO app.permission(code) VALUES('admin:read'),('staff:write'),('account:create'),('account:manage'),('settings:write') ON CONFLICT DO NOTHING;
INSERT INTO app.role_permission(tenant_id,role_code,permission_code)
 SELECT r.tenant_id,r.code,p.permission FROM app.role r CROSS JOIN (VALUES
 ('hospital_admin','admin:read'),('hospital_admin','staff:write'),('hospital_admin','account:create'),('hospital_admin','settings:write'),
 ('security_admin','admin:read'),('security_admin','staff:write'),('security_admin','account:create'),('security_admin','account:manage'),('auditor','admin:read')
 ) AS p(role,permission) WHERE r.code=p.role ON CONFLICT DO NOTHING;

ALTER TABLE app.clinic_doctor ADD COLUMN active boolean NOT NULL DEFAULT true;
GRANT UPDATE(active) ON app.clinic_doctor TO openeyes_app;
