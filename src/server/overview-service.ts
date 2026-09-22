import "server-only";
import type { AuthUser } from "@/lib/access";
import { readBatch, withTenant, type ReadQuery } from "./db";
import { todayKarachi } from "@/lib/patients";

/**
 * Assembles the role-aware landing page in one round trip.
 *
 * Every slice is gated on the permission that already guards its workspace, so
 * a role only ever receives the sections it can act on. That is what lets one
 * component serve all ten roles without a ten-way switch in the UI, and it
 * means the client never fires requests it is going to get a 403 from.
 */
export type OverviewData = {
  now: string;
  date: string;
  intake?: { appointments: number; checkedIn: number; waiting: number; workup: number; dilation: number; consultation: number };
  clinical?: { open: number; mine: number; drafts: number; signedToday: number };
  prescriptions?: { signed: number; awaitingDispense: number | null };
  inventory?: { stockValue: number; lowStock: number; expiringSoon: number; quarantined: number };
  billing?: { outstanding: number; collectedToday: number; invoicesToday: number; sessionOpen: boolean };
  governance?: { activeStaff: number; facilities: number; auditToday: number | null };
};

export async function overviewData(user: AuthUser): Promise<OverviewData> {
  const can = (permission: string) => user.permissions.includes(permission as never);
  const today = todayKarachi();
  const horizon = new Date(Date.parse(today) + 90 * 86400000).toISOString().slice(0, 10);
  const numeric = (value: unknown) => Number(value ?? 0);

  return withTenant(user.tenantId, user.id, async db => {
    const result: OverviewData = { now: new Date().toISOString(), date: today };
    const queries: ReadQuery[] = [];
    const apply: Array<(rows: Record<string, unknown>[]) => void> = [];
    const add = (text: string, values: readonly unknown[], assign: (rows: Record<string, unknown>[]) => void) => {
      queries.push({ text, values });
      apply.push(assign);
    };

    if (can("intake:read")) {
      result.intake = { appointments: 0, checkedIn: 0, waiting: 0, workup: 0, dilation: 0, consultation: 0 };
      add(
        "SELECT count(*)::int AS total, count(*) FILTER(WHERE status='checked_in')::int AS checked_in FROM app.appointment WHERE appointment_date=$1 AND facility_id=ANY($2::uuid[])",
        [today, user.facilityIds],
        rows => {
          const row = rows[0] ?? {};
          result.intake!.appointments = numeric(row.total);
          result.intake!.checkedIn = numeric(row.checked_in);
        },
      );
      add(
        "SELECT stage, count(*)::int AS count FROM app.encounter WHERE closed_at IS NULL AND facility_id=ANY($1::uuid[]) GROUP BY stage",
        [user.facilityIds],
        rows => {
          for (const row of rows) {
            const stage = String(row.stage);
            if (stage === "waiting" || stage === "workup" || stage === "dilation" || stage === "consultation") result.intake![stage] = numeric(row.count);
          }
        },
      );
    }

    if (can("clinical:read")) {
      add(`SELECT
          count(*) FILTER(WHERE e.closed_at IS NULL AND e.stage='consultation')::int AS open,
          count(*) FILTER(WHERE e.closed_at IS NULL AND e.stage='consultation' AND e.doctor_id=$2)::int AS mine,
          count(*) FILTER(WHERE d.id IS NOT NULL AND d.status IS DISTINCT FROM 'signed')::int AS drafts,
          count(*) FILTER(WHERE d.status='signed' AND d.signed_at >= $3::date)::int AS signed_today
        FROM app.encounter e
        LEFT JOIN app.doctor_event d ON d.encounter_id = e.id
        WHERE e.facility_id = ANY($1::uuid[])`,
        [user.facilityIds, user.id, today],
        rows => {
          const row = rows[0] ?? {};
          result.clinical = { open: numeric(row.open), mine: numeric(row.mine), drafts: numeric(row.drafts), signedToday: numeric(row.signed_today) };
        },
      );
    }

    if (can("prescription:read")) {
      result.prescriptions = { signed: 0, awaitingDispense: can("pharmacy:dispense") ? 0 : null };
      add(
        "SELECT count(*)::int AS signed FROM app.prescription WHERE status='signed'",
        [],
        rows => { result.prescriptions!.signed = numeric(rows[0]?.signed); },
      );
      if (can("pharmacy:dispense")) {
        add(`SELECT count(*)::int AS pending FROM app.prescription r
          WHERE r.status='signed'
            AND NOT EXISTS (SELECT 1 FROM app.prescription_closure c WHERE c.prescription_id = r.id)
            AND EXISTS (
              SELECT 1 FROM app.prescription_item i WHERE i.prescription_id = r.id
              AND i.quantity IS NOT NULL AND i.drug_id IS NOT NULL
              AND coalesce((SELECT sum(-m.quantity) FROM app.dispense x JOIN app.stock_movement m ON m.id=x.movement_id WHERE x.prescription_item_id=i.id),0) < i.quantity
            )`,
          [],
          rows => { result.prescriptions!.awaitingDispense = numeric(rows[0]?.pending); },
        );
      }
    }

    if (can("preview:inventory")) {
      add(`WITH b AS (
          SELECT b.id,b.expiry,b.quarantined,b.unit_cost_paisa,
                 coalesce((SELECT sum(m.quantity) FROM app.stock_movement m WHERE m.batch_id=b.id),0)::int AS quantity,
                 b.facility_id,b.drug_id
          FROM app.stock_batch b WHERE b.facility_id=ANY($1::uuid[]))
        SELECT coalesce(sum(b.quantity*b.unit_cost_paisa),0)::float8 AS stock_value,
          count(*) FILTER(WHERE b.quantity>0 AND NOT b.quarantined AND b.expiry >= $2::date AND b.expiry <= $3::date)::int AS expiring_soon,
          count(*) FILTER(WHERE b.quarantined)::int AS quarantined,
          (SELECT count(*)::int FROM app.stock_threshold t WHERE t.facility_id=ANY($1::uuid[])
            AND coalesce((SELECT sum(x.quantity) FROM b x WHERE x.facility_id=t.facility_id AND x.drug_id=t.drug_id AND NOT x.quarantined AND x.expiry >= $2::date),0) < t.minimum) AS low_stock
        FROM b`,
        [user.facilityIds, today, horizon],
        rows => {
          const row = rows[0] ?? {};
          result.inventory = { stockValue: numeric(row.stock_value), lowStock: numeric(row.low_stock), expiringSoon: numeric(row.expiring_soon), quarantined: numeric(row.quarantined) };
        },
      );
    }

    if (can("preview:billing")) {
      result.billing = { outstanding: 0, collectedToday: 0, invoicesToday: 0, sessionOpen: false };
      add(`SELECT
          coalesce(sum(i.total_paisa - coalesce((SELECT sum(p.amount_paisa) FROM app.payment p WHERE p.invoice_id=i.id),0)
            + coalesce((SELECT sum(r.amount_paisa) FROM app.refund r JOIN app.payment p ON p.id=r.payment_id WHERE p.invoice_id=i.id AND r.approved_at IS NOT NULL),0)),0)::float8 AS outstanding,
          count(*) FILTER(WHERE i.created_at >= $2::date)::int AS invoices_today
        FROM app.invoice i WHERE i.facility_id=ANY($1::uuid[])`,
        [user.facilityIds, today],
        rows => {
          result.billing!.outstanding = numeric(rows[0]?.outstanding);
          result.billing!.invoicesToday = numeric(rows[0]?.invoices_today);
        },
      );
      add(
        "SELECT coalesce(sum(p.amount_paisa),0)::float8 AS total FROM app.payment p JOIN app.invoice i ON i.id=p.invoice_id WHERE i.facility_id=ANY($1::uuid[]) AND p.at >= $2::date",
        [user.facilityIds, today],
        rows => { result.billing!.collectedToday = numeric(rows[0]?.total); },
      );
      add(
        "SELECT 1 AS present FROM app.cashier_session WHERE cashier_id=$1 AND closed_at IS NULL LIMIT 1",
        [user.id],
        rows => { result.billing!.sessionOpen = rows.length > 0; },
      );
    }

    if (can("admin:read")) {
      result.governance = { activeStaff: 0, facilities: 0, auditToday: can("audit:read") ? 0 : null };
      add(
        "SELECT (SELECT count(*)::int FROM app.user_account WHERE status='active') AS active_staff,(SELECT count(*)::int FROM app.facility WHERE active) AS facilities",
        [],
        rows => {
          result.governance!.activeStaff = numeric(rows[0]?.active_staff);
          result.governance!.facilities = numeric(rows[0]?.facilities);
        },
      );
      if (can("audit:read")) {
        add(
          "SELECT count(*)::int AS total FROM app.audit_log WHERE at >= $1::date",
          [today],
          rows => { result.governance!.auditToday = numeric(rows[0]?.total); },
        );
      }
    }

    const batches = await readBatch(db, queries);
    batches.forEach((rows, index) => apply[index](rows));
    return result;
  });
}
