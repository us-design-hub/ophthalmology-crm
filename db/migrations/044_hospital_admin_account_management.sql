-- Hospital administrators also own account lifecycle and role management.
INSERT INTO app.role_permission(tenant_id,role_code,permission_code)
SELECT tenant_id,code,'account:manage'
FROM app.role
WHERE code='hospital_admin'
ON CONFLICT DO NOTHING;
