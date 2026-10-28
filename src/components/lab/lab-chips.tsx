"use client";
import { useState } from "react";
import { FlaskConical, Plus } from "lucide-react";
import { api } from "@/lib/api-client";
import { formatLabResult, LAB_TESTS, type LabSummary, type LabTest } from "@/lib/lab";
import type { MessageKey } from "@/lib/messages";
import { useLocale } from "../locale-provider";
import { useSession } from "../session-provider";
import { intakeError } from "../intake/shared";

/**
 * A visit's lab tests in one short line: "Lab: BP 150/95 · Sugar pending".
 * Staff who can order tests get "+ BP" / "+ Sugar" for tests not yet ordered.
 */
export function LabChips({ encounterId, labs = [], hideExisting = [], onChanged, onError, allowOrder = true }: { encounterId: string; labs?: LabSummary; hideExisting?: LabTest[]; onChanged: () => void; onError: (error: MessageKey) => void; allowOrder?: boolean }) {
  const { t } = useLocale(); const user = useSession(); const [busy, setBusy] = useState(false);
  const missing = allowOrder && user.permissions.includes("lab:order") ? LAB_TESTS.filter(test => !labs.some(lab => lab.test === test) && !hideExisting.includes(test)) : [];
  if (!labs.length && !missing.length) return null;
  async function order(test: LabTest) {
    setBusy(true);
    try { await api("/api/lab/order", { encounterId, test }); onChanged(); }
    catch (error) { onError(intakeError(error)); }
    finally { setBusy(false); }
  }
  return <p className="lab-chips"><FlaskConical size={13} aria-hidden="true"/><span className="sr-only">{t("labLabel")}:</span>
    {labs.map(lab => <span key={lab.test} className={`lab-chip is-${lab.status} ${lab.abnormal ? "is-abnormal" : ""}`}>{t(`labShort_${lab.test}` as MessageKey)} {lab.status === "done" && lab.result ? <b dir="ltr">{formatLabResult(lab.test, lab.result).replace(/ (mmHg|mg\/dL)$/, "")}</b> : <i>{t(lab.status === "pending" ? "labPendingShort" : "labNotDone")}</i>}</span>)}
    {missing.map(test => <button key={test} type="button" className="lab-add" disabled={busy} onClick={() => void order(test)} aria-label={`${t("addLabTest")}: ${t(`labTest_${test}` as MessageKey)}`}><Plus size={11}/>{t(`labShort_${test}` as MessageKey)}</button>)}
  </p>;
}
