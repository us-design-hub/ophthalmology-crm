"use client";
import { useEffect, useRef, useState } from "react";
import { FileText, X } from "lucide-react";
import { api } from "@/lib/api-client";
import type { Encounter } from "@/lib/intake";
import type { MachineOrderInput } from "@/lib/machines";
import type { MessageKey } from "@/lib/messages";
import { useLocale } from "../locale-provider";
import { ErrorNotice, intakeError, RiskFlags } from "../intake/shared";
import { MachinePicker } from "./machine-picker";

/**
 * The senior technician checks an outside referral before the patient goes to
 * the machines: reads the letter, adjusts the requested tests, then confirms.
 */
export function ReferralConfirmDialog({ item, onClose, onDone }: { item: Encounter; onClose: () => void; onDone: () => void }) {
  const { t } = useLocale(); const ref = useRef<HTMLDialogElement>(null);
  const requested = (item.machines ?? []).filter(order => order.status === "requested").map(order => ({ machineId: order.machineId, eye: order.eye }));
  const [tests, setTests] = useState<MachineOrderInput[]>(requested), [busy, setBusy] = useState(false), [error, setError] = useState<MessageKey | null>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  async function confirm() {
    if (!tests.length) { setError("referralTestsRequired"); return; }
    setBusy(true); setError(null);
    try { await api("/api/machines/confirm-referral", { encounterId: item.id, version: item.version, tests }); onDone(); }
    catch (value) { setError(intakeError(value)); setBusy(false); }
  }
  return <dialog ref={ref} className="intake-dialog referral-dialog" aria-labelledby="confirm-referral-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="patient-record-header"><div><p className="eyebrow">{t("referralTag")}</p><h2 id="confirm-referral-title">{item.name}</h2><p>{item.mrn} · {item.clinic}</p><RiskFlags flags={item.flags}/></div><button type="button" className="icon-button" disabled={busy} aria-label={t("adminCancel")} onClick={onClose}><X size={20}/></button></div>
    <div className="intake-dialog-body"><ErrorNotice error={error}/>
      <dl className="referral-summary"><div><dt>{t("referralDoctor")}</dt><dd>{item.referralDoctor}</dd></div>{item.referralSource && <div><dt>{t("referralSource")}</dt><dd>{item.referralSource}</dd></div>}
        {(item.referralLetters ?? []).length > 0 && <div><dt>{t("referralLetter")}</dt><dd className="machine-reports">{item.referralLetters!.map(letter => <a key={letter.id} href={`/api/referrals/letter?id=${letter.id}`} target="_blank" rel="noreferrer"><FileText size={14}/>{letter.filename}</a>)}</dd></div>}</dl>
      <MachinePicker facilityId={item.facilityId} value={tests} onChange={setTests} suggest={false} help="confirmTestsHelp" disabled={busy}/>
      <div className="intake-dialog-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>{t("adminCancel")}</button><button type="button" className="primary-button" disabled={busy || !tests.length} onClick={() => void confirm()}>{t("confirmTests")}</button></div>
    </div>
  </dialog>;
}
