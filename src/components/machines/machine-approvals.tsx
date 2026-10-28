"use client";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { api } from "@/lib/api-client";
import type { MachineWorkItem } from "@/lib/machines";
import type { MessageKey } from "@/lib/messages";
import { useLocale } from "../locale-provider";
import { ErrorNotice, intakeError, useLiveData } from "../intake/shared";

/** Dye tests ordered by senior technicians wait here for the doctor's go-ahead. */
export function MachineApprovals() {
  const { t } = useLocale(); const live = useLiveData<{ orders: MachineWorkItem[] }>("/api/machines/approvals");
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState<MessageKey | null>(null);
  const orders = live.data?.orders ?? [];
  if (!orders.length) return null;
  async function decide(order: MachineWorkItem, decision: "approve" | "decline") {
    setBusy(order.id); setError(null);
    try { await api("/api/machines/decide", { id: order.id, version: order.version, decision, note: decision === "decline" ? "Declined by doctor" : "" }); live.refresh(); }
    catch (value) { setError(intakeError(value)); live.refresh(); }
    finally { setBusy(null); }
  }
  return <section className="panel machine-approvals" aria-label={t("approvalsTitle")}><h2><ShieldCheck size={18}/>{t("approvalsTitle")}<span>{orders.length}</span></h2><ErrorNotice error={error}/>
    <ul>{orders.map(order => <li key={order.id} data-testid={`approval-${order.id}`}><div><strong>{order.name}</strong><small>{order.mrn} · {order.clinic}</small></div><div><strong>{order.machine}</strong><small>{t(`eye_${order.eye}` as MessageKey)} · {t("orderedByLabel")} {order.orderedBy}</small></div>
      <div className="machine-decide"><button type="button" className="primary-button" disabled={!!busy} onClick={() => void decide(order, "approve")}>{t("approveTest")}</button><button type="button" className="secondary-button" disabled={!!busy} onClick={() => void decide(order, "decline")}>{t("declineTest")}</button></div></li>)}</ul></section>;
}
