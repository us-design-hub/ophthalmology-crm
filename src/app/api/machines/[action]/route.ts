import { requestSession } from "@/server/auth";
import { requestContext } from "@/server/audit";
import { ApiError, checkOrigin, errorResponse, json, readJson } from "@/server/http";
import { confirmReferral, decideMachineOrder, doctorOrderMachines, listMachines, machineWorklist, markMachineNotDone, pendingApprovals, recordMachineResult, referralReports, registerReferralVisit, saveMachine } from "@/server/machine-service";

// GET list | worklist | approvals | referrals; POST save | doctor-order | result | not-done | decide | referral | confirm-referral.
export async function GET(request: Request, context: { params: Promise<{ action: string }> }) {
  try {
    const action = (await context.params).action;
    // Polling does not keep an unattended session alive.
    if (action === "list") { const { user } = await requestSession(request, "intake:read", false); return json(await listMachines(user)); }
    if (action === "worklist") { const { user } = await requestSession(request, "machine:write", false); return json(await machineWorklist(user, requestContext(request))); }
    if (action === "referrals") { const { user } = await requestSession(request, "intake:read", false); return json(await referralReports(user)); }
    if (action === "approvals") { const { user } = await requestSession(request, "clinical:write", false); return json(await pendingApprovals(user)); }
    throw new ApiError(404, "invalidRequest");
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  try {
    checkOrigin(request);
    const action = (await context.params).action;
    const { user } = await requestSession(request, action === "save" ? "admin:read" : "intake:read");
    const input = await readJson(request), audit = requestContext(request);
    if (action === "save") return json(await saveMachine(user, input, audit));
    if (action === "doctor-order") return json(await doctorOrderMachines(user, input, audit));
    if (action === "result") return json(await recordMachineResult(user, input, audit));
    if (action === "not-done") return json(await markMachineNotDone(user, input, audit));
    if (action === "decide") return json(await decideMachineOrder(user, input, audit));
    if (action === "referral") return json(await registerReferralVisit(user, input, audit), 201);
    if (action === "confirm-referral") return json(await confirmReferral(user, input, audit));
    throw new ApiError(404, "invalidRequest");
  } catch (error) { return errorResponse(error); }
}
