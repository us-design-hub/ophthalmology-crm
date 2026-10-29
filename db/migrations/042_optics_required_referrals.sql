-- Optics is a read-only referral list. Patients may obtain glasses outside the
-- hospital, so preparation, collection and dispensing status are not tracked.

INSERT INTO app.permission(code) VALUES ('optics:read') ON CONFLICT DO NOTHING;

INSERT INTO app.role_permission(tenant_id,role_code,permission_code)
SELECT tenant_id,code,'optics:read' FROM app.role WHERE code='optician'
ON CONFLICT DO NOTHING;

DELETE FROM app.role_permission
WHERE role_code='optician' AND permission_code='optics:write';

DELETE FROM app.permission WHERE code='optics:write';

ALTER TABLE app.spectacle_order
  ADD COLUMN doctor_suggestion boolean NOT NULL DEFAULT true,
  ADD COLUMN referral_note text NOT NULL DEFAULT '' CHECK (length(referral_note) <= 1000),
  ALTER COLUMN od_sphere DROP NOT NULL,
  ALTER COLUMN os_sphere DROP NOT NULL,
  ALTER COLUMN pd DROP NOT NULL,
  ALTER COLUMN lens_type DROP NOT NULL;

ALTER TABLE app.spectacle_order
  ADD CONSTRAINT spectacle_referral_suggestion_valid CHECK (
    (doctor_suggestion AND od_sphere IS NOT NULL AND os_sphere IS NOT NULL AND pd IS NOT NULL AND lens_type IS NOT NULL)
    OR
    (NOT doctor_suggestion AND od_sphere IS NULL AND od_cylinder IS NULL AND od_axis IS NULL AND od_add IS NULL AND od_prism=''
      AND os_sphere IS NULL AND os_cylinder IS NULL AND os_axis IS NULL AND os_add IS NULL AND os_prism=''
      AND pd IS NULL AND lens_type IS NULL AND instructions='')
  );

UPDATE app.spectacle_order SET status='issued' WHERE status<>'cancelled';

REVOKE UPDATE(status,dispensing_note,status_by,status_at,version)
  ON app.spectacle_order FROM openeyes_app;
