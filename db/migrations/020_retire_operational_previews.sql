-- Retire the pharmacy/cashier settlement path while preserving historical rows.
UPDATE app.encounter
SET stage = 'completed',
    stage_at = now(),
    closed_at = coalesce(closed_at, now()),
    closure_reason = coalesce(nullif(closure_reason, ''), 'Clinical consultation completed'),
    version = version + 1
WHERE stage = 'pharmacy_billing';

ALTER TABLE app.encounter DROP CONSTRAINT encounter_stage_check;
ALTER TABLE app.encounter ADD CONSTRAINT encounter_stage_check
  CHECK (stage IN ('waiting','workup','dilation','consultation','completed','left_before_seen'));

-- Replace demo-preview permission names with active production capabilities.
INSERT INTO app.permission(code) VALUES ('surgery:read'), ('management:read')
ON CONFLICT DO NOTHING;

INSERT INTO app.role_permission(tenant_id, role_code, permission_code)
SELECT tenant_id, role_code, 'surgery:read'
FROM app.role_permission
WHERE permission_code = 'preview:surgery'
ON CONFLICT DO NOTHING;

INSERT INTO app.role_permission(tenant_id, role_code, permission_code)
SELECT tenant_id, role_code, 'management:read'
FROM app.role_permission
WHERE permission_code = 'preview:management'
ON CONFLICT DO NOTHING;

DELETE FROM app.role_permission
WHERE permission_code IN (
  'anatomy:use', 'preview:inventory', 'preview:billing', 'preview:surgery',
  'preview:management', 'preview:admin', 'inventory:write',
  'pharmacy:dispense', 'billing:write', 'billing:discount',
  'billing:approve_refund'
);

DELETE FROM app.permission
WHERE code IN (
  'anatomy:use', 'preview:inventory', 'preview:billing', 'preview:surgery',
  'preview:management', 'preview:admin', 'inventory:write',
  'pharmacy:dispense', 'billing:write', 'billing:discount',
  'billing:approve_refund'
);

-- Historical finance and stock records remain intact but are no longer available
-- through the application runtime role.
REVOKE ALL ON app.stock_batch, app.stock_movement, app.stock_threshold,
  app.dispense, app.prescription_closure, app.service_catalogue,
  app.invoice, app.invoice_line, app.cashier_session, app.receipt_counter,
  app.payment, app.refund
FROM openeyes_app;
