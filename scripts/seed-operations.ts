import pg from 'pg';
import { assertDemoDatabase } from './env';
import { createOperationsFixture } from '../src/lib/operations';
import { todayKarachi } from '../src/lib/patients';

async function main() {
  const db = new pg.Client({ connectionString: assertDemoDatabase().toString() }); await db.connect();
  try {
    await db.query('BEGIN'); await db.query('SELECT pg_advisory_xact_lock(724912005)');
    const tenant = (await db.query("SELECT id,is_demo FROM app.tenant WHERE code='DEMO'")).rows[0];
    if (!tenant?.is_demo) throw new Error('Operations fixtures require an existing demo hospital');
    if ((await db.query('SELECT 1 FROM app.operations_preview WHERE tenant_id=$1', [tenant.id])).rowCount) { await db.query('ROLLBACK'); console.log('Operations fixtures already exist; sample snapshots preserved.'); return; }
    const drugs = (await db.query('SELECT id,name,strength FROM app.formulary WHERE tenant_id=$1 AND active ORDER BY name,id', [tenant.id])).rows;
    if (!drugs.length) throw new Error('Run the clinical seed before the operations seed');
    const fixture = createOperationsFixture(todayKarachi(), drugs);
    await db.query('INSERT INTO app.operations_preview(tenant_id,data) VALUES($1,$2)', [tenant.id, JSON.stringify(fixture)]);
    const actor = (await db.query("SELECT id FROM app.user_account WHERE tenant_id=$1 AND email='faisal.noor@demo.openeyes.local'", [tenant.id])).rows[0];
    await db.query("INSERT INTO app.audit_log(tenant_id,actor_id,action,entity_type,metadata) VALUES($1,$2,'security.break_glass_example','operations_preview',$3)", [tenant.id, actor?.id ?? null, JSON.stringify({ synthetic: true, reason: 'Seeded example only. No emergency access was granted.', fixtureVersion: 1 })]);
    await db.query('COMMIT');
    console.log(`Seeded read-only operations snapshot: ${drugs.length} stock examples, ${fixture.invoices.length} invoices over 90 days, six surgery stages, and one labelled example audit entry.`);
  } catch (error) { await db.query('ROLLBACK'); throw error; } finally { await db.end(); }
}
main().catch(error => { console.error('Operations seed failed:', error.code ?? error.message); process.exitCode = 1; });
