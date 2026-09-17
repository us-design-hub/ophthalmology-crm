CREATE SCHEMA IF NOT EXISTS app;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO openeyes_app;

CREATE TABLE app.tenant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE,
  name text NOT NULL, mrn_prefix text NOT NULL, timezone text NOT NULL DEFAULT 'Asia/Karachi',
  currency text NOT NULL DEFAULT 'PKR', is_demo boolean NOT NULL DEFAULT false
);
CREATE TABLE app.facility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES app.tenant(id),
  name text NOT NULL, type text NOT NULL CHECK (type IN ('clinic','theatre','pharmacy')),
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, name)
);
CREATE TABLE app.user_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES app.tenant(id),
  email text NOT NULL, full_name text NOT NULL, designation text NOT NULL,
  password_hash text NOT NULL, status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, id), UNIQUE (tenant_id, email),
  CHECK (email = lower(email))
);
CREATE TABLE app.role (
  tenant_id uuid NOT NULL REFERENCES app.tenant(id), code text NOT NULL, PRIMARY KEY (tenant_id, code)
);
CREATE TABLE app.permission (code text PRIMARY KEY);
CREATE TABLE app.role_permission (
  tenant_id uuid NOT NULL, role_code text NOT NULL, permission_code text NOT NULL REFERENCES app.permission(code),
  PRIMARY KEY (tenant_id, role_code, permission_code), FOREIGN KEY (tenant_id, role_code) REFERENCES app.role(tenant_id, code)
);
CREATE TABLE app.user_role (
  tenant_id uuid NOT NULL, user_id uuid NOT NULL, role_code text NOT NULL,
  PRIMARY KEY (tenant_id, user_id, role_code),
  FOREIGN KEY (tenant_id, user_id) REFERENCES app.user_account(tenant_id, id),
  FOREIGN KEY (tenant_id, role_code) REFERENCES app.role(tenant_id, code)
);
CREATE TABLE app.user_facility (
  tenant_id uuid NOT NULL, user_id uuid NOT NULL, facility_id uuid NOT NULL,
  PRIMARY KEY (tenant_id, user_id, facility_id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES app.user_account(tenant_id, id),
  FOREIGN KEY (tenant_id, facility_id) REFERENCES app.facility(tenant_id, id)
);
CREATE TABLE app.session (
  token_hash text PRIMARY KEY, tenant_id uuid NOT NULL, user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL, idle_minutes integer NOT NULL CHECK (idle_minutes BETWEEN 1 AND 60),
  FOREIGN KEY (tenant_id, user_id) REFERENCES app.user_account(tenant_id, id)
);
CREATE INDEX session_expiry ON app.session(expires_at);
CREATE TABLE app.rate_limit (
  key text PRIMARY KEY, attempts integer NOT NULL DEFAULT 1, window_end timestamptz NOT NULL
);
CREATE TABLE app.mrn_counter (
  tenant_id uuid NOT NULL REFERENCES app.tenant(id), year integer NOT NULL,
  sequence bigint NOT NULL CHECK (sequence > 0), PRIMARY KEY (tenant_id, year)
);
CREATE TABLE app.patient (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES app.tenant(id),
  mrn text NOT NULL, given_name text NOT NULL, family_name text NOT NULL DEFAULT '',
  dob date NOT NULL, dob_estimated boolean NOT NULL DEFAULT false,
  gender text NOT NULL CHECK (gender IN ('female','male','other','unknown')),
  phone_e164 text NOT NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  identifier_type text NOT NULL CHECK (identifier_type IN ('cnic','passport','guardian_cnic')),
  identifier_encrypted text NOT NULL CHECK (identifier_encrypted LIKE 'v1.%'),
  identifier_blind_index text NOT NULL CHECK (length(identifier_blind_index) = 64),
  identifier_last4 text NOT NULL CHECK (length(identifier_last4) = 4),
  city text NOT NULL DEFAULT '', address text NOT NULL DEFAULT '',
  preferred_language text NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en','ur')),
  next_of_kin_name text NOT NULL DEFAULT '', next_of_kin_phone text NOT NULL DEFAULT '',
  created_by uuid NOT NULL, created_facility_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, mrn),
  FOREIGN KEY (tenant_id, created_by) REFERENCES app.user_account(tenant_id, id),
  FOREIGN KEY (tenant_id, created_facility_id) REFERENCES app.facility(tenant_id, id)
);
CREATE UNIQUE INDEX patient_personal_identifier ON app.patient(tenant_id, identifier_blind_index) WHERE identifier_type <> 'guardian_cnic';
CREATE INDEX patient_name ON app.patient(tenant_id, lower(given_name), lower(family_name));
CREATE INDEX patient_phone ON app.patient(tenant_id, phone_e164);
CREATE INDEX patient_identifier_search ON app.patient(tenant_id, identifier_blind_index);
CREATE INDEX patient_created ON app.patient(tenant_id, created_at DESC, id);
CREATE TABLE app.patient_flag (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, patient_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('allergy','risk')), value text NOT NULL,
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, patient_id) REFERENCES app.patient(tenant_id, id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES app.user_account(tenant_id, id)
);
CREATE INDEX patient_flag_patient ON app.patient_flag(tenant_id, patient_id);
CREATE TABLE app.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES app.tenant(id),
  actor_id uuid, action text NOT NULL, entity_type text NOT NULL,
  entity_id uuid, at timestamptz NOT NULL DEFAULT now(), ip inet, user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}',
  FOREIGN KEY (tenant_id, actor_id) REFERENCES app.user_account(tenant_id, id)
);
CREATE INDEX audit_time ON app.audit_log(tenant_id, at DESC, id);

DO $policy$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['facility','user_account','role','role_permission','user_role','user_facility','mrn_counter','patient','patient_flag','audit_log'] LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON app.%I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', table_name);
  END LOOP;
END $policy$;

ALTER TABLE app.session ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.session FORCE ROW LEVEL SECURITY;
-- A bearer-token hash can resolve its tenant before tenant context is known.
CREATE POLICY session_lookup ON app.session FOR SELECT USING (
  token_hash = nullif(current_setting('app.session_hash', true), '') OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
);
CREATE POLICY session_insert ON app.session FOR INSERT WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY session_update ON app.session FOR UPDATE USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY session_delete ON app.session FOR DELETE USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT ON app.tenant, app.facility, app.user_account, app.role, app.permission, app.role_permission, app.user_role, app.user_facility TO openeyes_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.session, app.rate_limit TO openeyes_app;
GRANT SELECT, INSERT, UPDATE ON app.mrn_counter TO openeyes_app;
GRANT SELECT, INSERT ON app.patient, app.patient_flag, app.audit_log TO openeyes_app;
REVOKE UPDATE, DELETE, TRUNCATE ON app.patient, app.patient_flag, app.audit_log FROM openeyes_app;
