import 'server-only';
import type { AuthUser, Permission } from '@/lib/access';
import type { OperationsFixture } from '@/lib/operations';
import { stockSummary } from '@/lib/operations';
import { todayKarachi } from '@/lib/patients';
import { withTenant } from './db';
import { audit, type AuditContext } from './audit';
import { ApiError } from './http';
import { isDemo } from './config';

export const previewPermissions = { inventory: 'preview:inventory', billing: 'preview:billing', surgery: 'preview:surgery', management: 'preview:management', administration: 'preview:admin' } as const satisfies Record<string, Permission>;
export type PreviewResource = keyof typeof previewPermissions;
export async function operationsPreview(user: AuthUser, resource: PreviewResource, context: AuditContext = {}) {
  if (!user.permissions.includes(previewPermissions[resource])) throw new ApiError(403, 'forbidden');
  if (!isDemo()) throw new ApiError(404, 'previewUnavailable');
  return withTenant(user.tenantId, user.id, async db => {
    if (!(await db.query('SELECT 1 FROM app.tenant WHERE id=$1 AND is_demo', [user.tenantId])).rowCount) throw new ApiError(404, 'previewUnavailable');
    const row = (await db.query('SELECT data FROM app.operations_preview')).rows[0];
    if (!row) throw new ApiError(404, 'previewUnavailable');
    const data = row.data as OperationsFixture;
    await audit(db, { tenantId: user.tenantId, actorId: user.id, action: `preview.${resource}_read`, entityType: 'operations_preview', metadata: { resource, sampleSnapshot: true }, context });
    const common = { sample: true as const, asOf: data.asOf };
    if (resource === 'inventory') return { ...common, today: todayKarachi(), stock: data.stock.map(stock => ({ ...stock, ...stockSummary(stock, todayKarachi()) })) };
    if (resource === 'billing') return { ...common, invoices: data.invoices };
    if (resource === 'surgery') return { ...common, surgeries: data.surgeries };
    if (resource === 'management') return { ...common, invoices: data.invoices, daily: data.daily, surgeries: data.surgeries };
    const staff = (await db.query(`SELECT u.id,u.full_name AS name,u.designation,(u.status='active') AS active,u.licence_number AS licence,
      coalesce((SELECT jsonb_agg(r.role_code ORDER BY r.role_code) FROM app.user_role r WHERE r.user_id=u.id AND r.tenant_id=u.tenant_id),'[]') AS roles,
      coalesce((SELECT jsonb_agg(f.name ORDER BY f.name) FROM app.user_facility uf JOIN app.facility f ON f.id=uf.facility_id AND f.tenant_id=uf.tenant_id WHERE uf.user_id=u.id AND uf.tenant_id=u.tenant_id),'[]') AS facilities
      FROM app.user_account u ORDER BY u.full_name`)).rows;
    return { ...common, staff };
  });
}
export async function sampleReceipt(user: AuthUser, id: string, context: AuditContext = {}) {
  if (!/^SMP-RCT-\d{8}-\d+$/.test(id)) throw new ApiError(404, 'previewUnavailable');
  const data = await operationsPreview(user, 'billing', context);
  if (!('invoices' in data)) throw new ApiError(404, 'previewUnavailable');
  const invoice = data.invoices.find(item => item.payment?.id === id);
  if (!invoice) throw new ApiError(404, 'previewUnavailable');
  await withTenant(user.tenantId, user.id, db => audit(db, { tenantId: user.tenantId, actorId: user.id, action: 'preview.receipt_viewed', entityType: 'operations_preview', metadata: { sampleReceipt: id }, context }));
  return { invoice, hospital: user.tenantName, asOf: data.asOf };
}
