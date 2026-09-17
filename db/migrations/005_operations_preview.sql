CREATE TABLE app.operations_preview (
 tenant_id uuid PRIMARY KEY REFERENCES app.tenant(id),
 seeded_at timestamptz NOT NULL DEFAULT now(),
 data jsonb NOT NULL CHECK(data->>'version'='1')
);
ALTER TABLE app.operations_preview ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.operations_preview FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.operations_preview
 USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT ON app.operations_preview TO openeyes_app;

INSERT INTO app.permission(code) VALUES ('preview:inventory'),('preview:billing'),('preview:surgery'),('preview:management'),('preview:admin') ON CONFLICT DO NOTHING;
INSERT INTO app.role_permission(tenant_id,role_code,permission_code)
 SELECT r.tenant_id,r.code,p.permission FROM app.role r CROSS JOIN (VALUES
 ('doctor','preview:inventory'),('doctor','preview:billing'),('doctor','preview:surgery'),('doctor','preview:management'),
 ('pharmacist','preview:inventory'),('inventory_officer','preview:inventory'),('cashier','preview:billing'),
 ('nurse','preview:surgery'),('optometrist','preview:surgery'),
 ('hospital_admin','preview:inventory'),('hospital_admin','preview:billing'),('hospital_admin','preview:surgery'),('hospital_admin','preview:management'),('hospital_admin','preview:admin'),
 ('security_admin','preview:admin'),
 ('auditor','preview:inventory'),('auditor','preview:billing'),('auditor','preview:surgery'),('auditor','preview:management'),('auditor','preview:admin')
 ) AS p(role,permission) WHERE r.code=p.role ON CONFLICT DO NOTHING;
