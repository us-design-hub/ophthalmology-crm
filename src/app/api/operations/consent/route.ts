import { z } from "zod";
import { requestSession } from "@/server/auth";
import { withTenant } from "@/server/db";
import { audit, requestContext } from "@/server/audit";
import { ApiError, checkOrigin, readJson, json, errorResponse } from "@/server/http";
import { createSurgicalConsent, surgicalConsentAction } from "@/server/surgery-consent-service";

const uploadSchema = z.object({
  caseId: z.uuid(), eye: z.enum(["OD", "OS"]), signatoryType: z.enum(["patient", "guardian"]),
  signatoryName: z.string().trim().min(2).max(160), relationship: z.string().trim().max(120),
  witnessName: z.string().trim().min(2).max(160), witnessRole: z.string().trim().min(2).max(120),
  accepted: z.literal("true"),
}).strict().superRefine((value, context) => {
  if (value.signatoryType === "guardian" && value.relationship.length < 2) context.addIssue({ code: "custom", path: ["relationship"], message: "guardianRelationshipRequired" });
});

async function readMultipart(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "invalidRequest");
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 6 * 1024 * 1024) { await reader.cancel(); throw new ApiError(413, "fileTooLarge"); }
    chunks.push(value);
  }
  return new Request(request.url, { method: "POST", headers: request.headers, body: Buffer.concat(chunks) }).formData();
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { user } = await requestSession(request, "surgery:write");
    const context = requestContext(request);
    if (request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return json(await surgicalConsentAction(user, await readJson(request), context));
    }
    const form = await readMultipart(request);
    const parsed = uploadSchema.safeParse({
      caseId: form.get("caseId"), eye: form.get("eye"), signatoryType: form.get("signatoryType"),
      signatoryName: form.get("signatoryName"), relationship: form.get("relationship") ?? "",
      witnessName: form.get("witnessName"), witnessRole: form.get("witnessRole"), accepted: form.get("accepted"),
    });
    if (!parsed.success) throw new ApiError(400, "validationFailed");
    const file = form.get("file");
    if (!(file instanceof File) || file.size < 1 || file.size > 5_242_880) throw new ApiError(400, "invalidFile");
    const content = Buffer.from(await file.arrayBuffer());
    const mime = content.subarray(0, 5).toString() === "%PDF-" ? "application/pdf"
      : content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "image/png"
      : content[0] === 255 && content[1] === 216 && content[2] === 255 ? "image/jpeg" : null;
    if (!mime) throw new ApiError(400, "invalidFile");
    const input = { ...parsed.data, relationship: parsed.data.signatoryType === "patient" ? "" : parsed.data.relationship };
    return json(await createSurgicalConsent(user, input, {
      content, mime, filename: file.name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 160) || "consent",
    }, context));
  } catch (error) { return errorResponse(error); }
}

export async function GET(request: Request) {
  try {
    const { user } = await requestSession(request, "surgery:read");
    const id = new URL(request.url).searchParams.get("id");
    if (!z.uuid().safeParse(id).success) throw new ApiError(404, "notFound");
    const document = await withTenant(user.tenantId, user.id, async db => {
      const row = (await db.query(`SELECT d.* FROM app.consent_document d
        JOIN app.surgery_case c ON c.tenant_id=d.tenant_id AND c.id=d.case_id
        WHERE d.id=$1 AND c.facility_id=ANY($2::uuid[])`, [id, user.facilityIds])).rows[0];
      if (!row) throw new ApiError(404, "notFound");
      await audit(db, { tenantId: user.tenantId, actorId: user.id, action: "surgery.consent_downloaded", entityType: "surgery_case", entityId: row.case_id, context: requestContext(request) });
      return row;
    });
    return new Response(document.content, { headers: {
      "Content-Type": document.mime, "Content-Disposition": `attachment; filename="${document.filename}"`,
      "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox",
    } });
  } catch (error) { return errorResponse(error); }
}
