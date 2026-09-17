ALTER TABLE app.encounter DROP CONSTRAINT encounter_stage_check;
ALTER TABLE app.encounter ADD CONSTRAINT encounter_stage_check CHECK(stage IN ('waiting','workup','dilation','consultation','pharmacy_billing','completed','left_before_seen'));
ALTER TABLE app.queue_transition DROP CONSTRAINT queue_transition_to_stage_check;
ALTER TABLE app.queue_transition ADD CONSTRAINT queue_transition_to_stage_check CHECK(to_stage IN ('waiting','workup','dilation','consultation','pharmacy_billing','completed','left_before_seen'));
INSERT INTO app.role_permission(tenant_id,role_code,permission_code) SELECT tenant_id,code,'reports:read' FROM app.role WHERE code IN ('receptionist','nurse','optometrist','security_admin') ON CONFLICT DO NOTHING;
