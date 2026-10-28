import { createHash } from "node:crypto";
import { z } from "zod";
import { consumeLimit, requestSession } from "@/server/auth";
import { audit, requestContext } from "@/server/audit";
import { withTenant } from "@/server/db";
import { ApiError, checkOrigin, errorResponse, json } from "@/server/http";

// The machine's own report (PDF or image) attached to a test; up to five per test.
const uuid = z.uuid();
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { user } = await requestSession(request, "machine:write");
    await consumeLimit(`machine-report:${user.tenantId}:${user.id}`, 20, 60);
    const reader = request.body?.getReader(); if (!reader) throw new ApiError(400, "invalidRequest");
    const chunks: Uint8Array[] = []; let length = 0;
    for (;;) { const { value, done } = await reader.read(); if (done) break; length += value.byteLength; if (length > 6 * 1024 * 1024) { await reader.cancel(); throw new ApiError(413, "fileTooLarge"); } chunks.push(value); }
    const form = await new Request(request.url, { method: "POST", headers: request.headers, body: Buffer.concat(chunks) }).formData();
    const orderId = form.get("orderId"); if (!uuid.safeParse(orderId).success) throw new ApiError(400, "validationFailed");
    const file = form.get("file"); if (!(file instanceof File) || file.size < 1 || file.size > 5242880) throw new ApiError(400, "invalidFile");
    const content = Buffer.from(await file.arrayBuffer());
    // Trust the bytes, not the file name: only PDF, PNG and JPEG are kept.
    const mime = content.subarray(0, 5).toString() === "%PDF-" ? "application/pdf" : content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "image/png" : content[0] === 255 && content[1] === 216 && content[2] === 255 ? "image/jpeg" : null;
    if (!mime) throw new ApiError(400, "invalidFile");
    const result = await withTenant(user.tenantId, user.id, async db => {
      const order = (await db.query(`SELECT o.id,o.status,o.encounter_id,e.closed_at FROM app.machine_order o JOIN app.encounter e ON e.id=o.encounter_id AND e.tenant_id=o.tenant_id WHERE o.id=$1 AND e.facility_id=ANY($2::uuid[]) FOR UPDATE OF o`, [orderId, user.facilityIds])).rows[0];
      if (!order) throw new ApiError(404, "machineOrderNotFound");
      if (order.closed_at || !["ordered", "done"].includes(order.status)) throw new ApiError(409, "machineReportLocked");
      if (Number((await db.query("SELECT count(*) FROM app.machine_report WHERE order_id=$1", [orderId])).rows[0].count) >= 5) throw new ApiError(409, "evidenceLimit");
      const hash = createHash("sha256").update(content).digest("hex");
      const row = (await db.query(`INSERT INTO app.machine_report(tenant_id,order_id,content,mime,filename,hash,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING id,filename,mime`, [user.tenantId, orderId, content, mime, file.name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 160) || "report", hash, user.id])).rows[0];
      if (!row) throw new ApiError(409, "duplicateEvidence");
      await audit(db, { tenantId: user.tenantId, actorId: user.id, action: "machine.report_uploaded", entityType: "machine_order", entityId: orderId as string, metadata: { encounterId: order.encounter_id, reportId: row.id, hash, mime }, context: requestContext(request) });
      return row;
    });
    return json(result, 201);
  } catch (error) { return errorResponse(error); }
}
export async function GET(request: Request) {
  try {
    const { user } = await requestSession(request, "intake:read");
    const id = new URL(request.url).searchParams.get("id"); if (!uuid.safeParse(id).success) throw new ApiError(404, "clinicalNotFound");
    const row = await withTenant(user.tenantId, user.id, async db => {
      const found = (await db.query(`SELECT r.content,r.mime,r.filename,r.order_id FROM app.machine_report r JOIN app.machine_order o ON o.id=r.order_id AND o.tenant_id=r.tenant_id JOIN app.encounter e ON e.id=o.encounter_id AND e.tenant_id=o.tenant_id WHERE r.id=$1 AND e.facility_id=ANY($2::uuid[])`, [id, user.facilityIds])).rows[0];
      if (!found) throw new ApiError(404, "clinicalNotFound");
      await audit(db, { tenantId: user.tenantId, actorId: user.id, action: "machine.report_viewed", entityType: "machine_order", entityId: found.order_id, metadata: { reportId: id }, context: requestContext(request) });
      return found;
    });
    return new Response(row.content, { headers: { "Content-Type": row.mime, "Content-Disposition": `inline; filename="${row.filename}"`, "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Referrer-Policy": "no-referrer" } });
  } catch (error) { return errorResponse(error); }
}
