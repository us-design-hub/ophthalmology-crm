-- The hospital workflow uses technicians, senior technicians, and doctors.
-- Retire the unused Optometrist account role without rewriting historical
-- published examination templates or signed clinical snapshots.

-- End active sessions before removing the role so an Optometrist-only account
-- cannot continue using permissions cached in an existing session.
DELETE FROM app.session session
USING app.user_role assigned
WHERE assigned.tenant_id = session.tenant_id
  AND assigned.user_id = session.user_id
  AND assigned.role_code = 'optometrist';

-- Preserve attributed historical records, but disable accounts whose only
-- assignment is the retired role. Multi-role accounts keep their other access.
UPDATE app.user_account account
SET status = 'disabled'
WHERE EXISTS (
  SELECT 1 FROM app.user_role assigned
  WHERE assigned.tenant_id = account.tenant_id
    AND assigned.user_id = account.id
    AND assigned.role_code = 'optometrist'
)
AND NOT EXISTS (
  SELECT 1 FROM app.user_role assigned
  WHERE assigned.tenant_id = account.tenant_id
    AND assigned.user_id = account.id
    AND assigned.role_code <> 'optometrist'
);

DELETE FROM app.user_role WHERE role_code = 'optometrist';
DELETE FROM app.role_permission WHERE role_code = 'optometrist';
DELETE FROM app.role WHERE code = 'optometrist';
