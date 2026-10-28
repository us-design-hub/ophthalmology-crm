"use client";
import { useState } from "react";
import { FileText, ScanEye, Send } from "lucide-react";
import { api } from "@/lib/api-client";
import type { MachineOrder, MachineOrderInput } from "@/lib/machines";
import type { MessageKey } from "@/lib/messages";
import { useLocale } from "../locale-provider";
import { useSession } from "../session-provider";
import { ErrorNotice, intakeError } from "../intake/shared";
import { MachinePicker } from "./machine-picker";

/**
 * A visit's machine tests: what was ordered, by whom, and the results with
 * report files. Doctors approve dye tests here and, during their own
 * consultation, send the patient for more tests.
 */
export function MachineResultsPanel({ encounterId, facilityId, orders, version, canSend, onSent, onChanged }: {
  encounterId: string; facilityId: string; orders: MachineOrder[]; version?: number; canSend?: boolean; onSent?: () => void; onChanged?: () => void;
}) {
  const { t } = useLocale(); const user = useSession();
  const [busy, setBusy] = useState(false), [error, setError] = useState<MessageKey | null>(null), [ordering, setOrdering] = useState(false), [picked, setPicked] = useState<MachineOrderInput[]>([]);
  const canDecide = user.permissions.includes("clinical:write");
  if (!orders.length && !canSend) return null;
  async function decide(order: MachineOrder, decision: "approve" | "decline") {
    setBusy(true); setError(null);
    try { await api("/api/machines/decide", { id: order.id, version: order.version, decision, note: decision === "decline" ? "Declined by doctor" : "" }); onChanged?.(); }
    catch (value) { setError(intakeError(value)); }
    finally { setBusy(false); }
  }
  async function send() {
    if (!picked.length || version === undefined) return;
    setBusy(true); setError(null);
    try { await api("/api/machines/doctor-order", { encounterId, version, orders: picked }); onSent?.(); }
    catch (value) { setError(intakeError(value)); setBusy(false); }
  }
  return <section className="clinical-section machine-results-panel"><h3><ScanEye size={17}/>{t("machineTestsLabel")}</h3>
    <ErrorNotice error={error}/>
    {orders.length > 0 && <ul className="machine-results">{orders.map(order => <li key={order.id} className={`is-${order.status}`}>
      <div className="machine-results-head"><strong>{order.machine}</strong><span>{t(`eye_${order.eye}` as MessageKey)}</span><span className={`machine-status is-${order.status}`}>{t(`machineStatus_${order.status}` as MessageKey)}</span></div>
      {order.status === "done" && <><p className="machine-findings">{order.findings}</p>{order.keyValues && <p className="machine-key-values" dir="auto">{order.keyValues}</p>}</>}
      {(order.status === "not_done" || order.status === "declined") && order.note && <p className="machine-note">{order.note}</p>}
      {order.reports.length > 0 && <p className="machine-reports">{order.reports.map(report => <a key={report.id} href={`/api/machines/report?id=${report.id}`} target="_blank" rel="noreferrer"><FileText size={14}/>{report.filename}</a>)}</p>}
      <small className="machine-meta">{t("orderedByLabel")} {order.orderedBy}{order.resultedBy && order.status === "done" ? ` · ${order.resultedBy}` : ""}</small>
      {order.status === "awaiting_approval" && canDecide && <div className="machine-decide"><button type="button" className="primary-button" disabled={busy} onClick={() => void decide(order, "approve")}>{t("approveTest")}</button><button type="button" className="secondary-button" disabled={busy} onClick={() => void decide(order, "decline")}>{t("declineTest")}</button></div>}
    </li>)}</ul>}
    {canSend && (ordering ? <div className="machine-send"><MachinePicker facilityId={facilityId} value={picked} onChange={setPicked} disabled={busy}/><p className="intake-help">{t("machineSentNote")}</p>
      <div className="machine-decide"><button type="button" className="primary-button" disabled={busy || !picked.length} onClick={() => void send()}><Send size={15}/>{t("sendForTests")}</button><button type="button" className="secondary-button" disabled={busy} onClick={() => { setOrdering(false); setPicked([]); }}>{t("adminCancel")}</button></div></div>
      : <button type="button" className="secondary-button" onClick={() => setOrdering(true)}><ScanEye size={15}/>{t("orderMachineTests")}</button>)}
  </section>;
}
