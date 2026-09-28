import "server-only";
import type { AuthUser } from "@/lib/access";
import { readBatch, withTenant, type ReadQuery } from "./db";
import { todayKarachi } from "@/lib/patients";

/**
 * Assembles the role-aware landing page in one round trip.
 *
 * Every slice is gated on the permission that already guards its workspace, so
 * a role only ever receives the sections it can act on. That is what lets one
 * component serve every active role without a role-name switch in the UI, and it
 * means the client never fires requests it is going to get a 403 from.
 */
export type OverviewData = {
  now: string;
  date: string;
  intake?: { appointments: number; checkedIn: number; waiting: number; workup: number; dilation: number; consultation: number };
  clinical?: { open: number; mine: number; drafts: number; signedToday: number };
  prescriptions?: { signed: number };
  governance?: { activeStaff: number; facilities: number; auditToday: number | null };
};

export async function overviewData(user: AuthUser): Promise<OverviewData> {
  const can = (permission: string) => user.permissions.includes(permission as never);
  const today = todayKarachi();
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
      result.prescriptions = { signed: 0 };
      add(
        "SELECT count(*)::int AS signed FROM app.prescription WHERE status='signed'",
        [],
        rows => { result.prescriptions!.signed = numeric(rows[0]?.signed); },
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
