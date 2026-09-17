ALTER TABLE app.workup_eye ADD COLUMN refraction jsonb, ADD COLUMN logmar jsonb;
ALTER TABLE app.patient_flag ADD COLUMN resolved_at timestamptz, ADD COLUMN resolved_by uuid, ADD COLUMN resolution_reason text;
ALTER TABLE app.patient_flag ADD FOREIGN KEY(tenant_id,resolved_by) REFERENCES app.user_account(tenant_id,id);
GRANT UPDATE(resolved_at,resolved_by,resolution_reason) ON app.patient_flag TO openeyes_app;
CREATE TABLE app.patient_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,patient_id uuid NOT NULL,category text NOT NULL CHECK(category IN ('medical','ocular','family','surgical','drug')),text text NOT NULL CHECK(length(text) BETWEEN 1 AND 3000),author_id uuid NOT NULL,at timestamptz NOT NULL DEFAULT now(),supersedes_id uuid,
 UNIQUE(tenant_id,id),FOREIGN KEY(tenant_id,patient_id) REFERENCES app.patient(tenant_id,id),FOREIGN KEY(tenant_id,author_id) REFERENCES app.user_account(tenant_id,id),FOREIGN KEY(tenant_id,supersedes_id) REFERENCES app.patient_history(tenant_id,id)
);
ALTER TABLE app.patient_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.patient_history FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.patient_history USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT ON app.patient_history TO openeyes_app;
INSERT INTO app.permission(code) VALUES('history:write') ON CONFLICT DO NOTHING;
INSERT INTO app.role_permission(tenant_id,role_code,permission_code) SELECT tenant_id,code,'history:write' FROM app.role WHERE code IN ('doctor','nurse','optometrist') ON CONFLICT DO NOTHING;
