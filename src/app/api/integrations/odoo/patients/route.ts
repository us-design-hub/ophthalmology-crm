import { consumeLimit } from "@/server/auth";
import { requestContext } from "@/server/audit";
import { authenticateOdoo, syncOdooPatient } from "@/server/odoo-service";
import { errorResponse, json, readJson } from "@/server/http";

export async function POST(request: Request) {
  try {
    authenticateOdoo(request);
    await consumeLimit("odoo-patient-sync", 600, 60);
    const result = await syncOdooPatient(await readJson(request), requestContext(request));
    return json(result, result.status === "created" ? 201 : 200);
  } catch (error) {
    return errorResponse(error);
  }
}
