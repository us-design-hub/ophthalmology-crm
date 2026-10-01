import "server-only";
import { z } from "zod";
import type { AuthUser, Permission } from "@/lib/access";
import { withTenant } from "./db";
import { audit, type AuditContext } from "./audit";
import { ApiError } from "./http";
import { requireAction } from "./administration-service";

export const REPORTS = {
  clinic: { title: "Daily clinic register", permission: "intake:read" },
  events: { title: "Doctor event list", permission: "clinical:read" },
  staff: { title: "Staff directory", permission: "admin:read" },
} as const;

export async function report(user: AuthUser, kind: string, date: string, context: AuditContext) {
  requireAction(user, "reports:read");
  if (!(kind in REPORTS) || !z.iso.date().safeParse(date).success) throw new ApiError(400, "invalidRequest");
  const config = REPORTS[kind as keyof typeof REPORTS];
  requireAction(user, config.permission as Permission);
  return withTenant(user.tenantId, user.id, async db => {
    let rows: Record<string, unknown>[] = [];
    if (kind === "clinic") rows = (await db.query(`SELECT a.appointment_date AS date,to_char(a.slot_time,'HH24:MI') AS time,p.mrn,p.given_name||' '||p.family_name AS patient,f.name AS clinic,u.full_name AS doctor,a.status FROM app.appointment a JOIN app.patient p ON p.id=a.patient_id JOIN app.facility f ON f.id=a.facility_id JOIN app.user_account u ON u.id=a.doctor_id WHERE a.facility_id=ANY($1::uuid[]) AND a.appointment_date=$2 ORDER BY a.slot_time`, [user.facilityIds, date])).rows;
    if (kind === "events") rows = (await db.query(`SELECT p.mrn,p.given_name||' '||p.family_name AS patient,f.name AS clinic,u.full_name AS doctor,d.status,d.signed_at AS signed FROM app.doctor_event d JOIN app.encounter e ON e.id=d.encounter_id JOIN app.patient p ON p.id=e.patient_id JOIN app.facility f ON f.id=e.facility_id JOIN app.user_account u ON u.id=d.author_id WHERE e.facility_id=ANY($1::uuid[]) AND (e.checked_in_at AT TIME ZONE 'Asia/Karachi')::date=$2 ORDER BY e.checked_in_at`, [user.facilityIds, date])).rows;
    if (kind === "staff") rows = (await db.query(`SELECT u.full_name AS name,u.designation,u.email,u.licence_number AS licence,u.status,(SELECT string_agg(role_code,', ' ORDER BY role_code) FROM app.user_role r WHERE r.user_id=u.id) AS roles FROM app.user_account u ORDER BY u.full_name`)).rows;
    await audit(db, { tenantId: user.tenantId, actorId: user.id, action: "report.exported", entityType: "report", metadata: { report: kind, date, rowCount: rows.length }, context });
    return { title: config.title, date, rows };
  });
}

export function csvRows(rows: Record<string, unknown>[]) {
  const columns = Object.keys(rows[0] || {});
  const cell = (value: unknown) => {
    let content = value instanceof Date ? value.toISOString() : String(value ?? "");
    if (/^[=+@\-\t\r]/.test(content)) content = `'${content}`;
    return `"${content.replaceAll('"', '""')}"`;
  };
  return [columns.map(cell).join(","), ...rows.map(row => columns.map(column => cell(row[column])).join(","))].join("\r\n");
}
