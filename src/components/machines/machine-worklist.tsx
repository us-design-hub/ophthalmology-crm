"use client";
import { useEffect, useState } from "react";
import { Clock3, FileText, Hourglass, Paperclip, ScanEye, Siren } from "lucide-react";
import { api, ClientApiError } from "@/lib/api-client";
import type { MachineWorkItem } from "@/lib/machines";
import type { MessageKey } from "@/lib/messages";
import { ageFromDob } from "@/lib/patients";
import { useLocale } from "../locale-provider";
import { ReasonDialog } from "../reason-dialog";
import { ErrorNotice, intakeError, LiveStatus, RiskFlags, useLiveData } from "../intake/shared";
import { waited } from "../intake/reception-queue";

/**
 * The machine operator's worklist. "Ready now" only lists patients who are at
 * the machines, so a dilation test never starts before the drops have worked.
 * Each operator can narrow the list to the machines they run.
 */
type Tab = "ready" | "coming" | "done";
const MINE_KEY = "openeyes.machines.mine";
export function MachineWorklist() {
  const { t } = useLocale();
  const live = useLiveData<{ orders: MachineWorkItem[]; serverNow: string }>("/api/machines/worklist");
  const [tab, setTab] = useState<Tab>("ready"); const [error, setError] = useState<MessageKey | null>(null);
  const [mine, setMine] = useState<string[]>([]); const [skipping, setSkipping] = useState<MachineWorkItem | null>(null); const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { try { setMine(JSON.parse(localStorage.getItem(MINE_KEY) ?? "[]")); } catch { /* all machines */ } }, []);
  const toggleMine = (id: string) => setMine(current => { const next = current.includes(id) ? current.filter(value => value !== id) : [...current, id]; try { localStorage.setItem(MINE_KEY, JSON.stringify(next)); } catch { /* not remembered */ } return next; });
  const orders = live.data?.orders ?? [];
  const now = new Date(live.data?.serverNow ?? Date.now()).getTime();
  const machines = Array.from(new Map(orders.map(order => [order.machineId, order.machine])).entries());
  const inScope = orders.filter(order => !mine.length || mine.includes(order.machineId));
  const group = (order: MachineWorkItem): Tab => order.status === "done" || order.status === "not_done" || order.status === "declined" ? "done" : order.status === "ordered" && order.stage === "testing" ? "ready" : "coming";
  const counts = { ready: 0, coming: 0, done: 0 }; for (const order of inScope) counts[group(order)]++;
  const shown = inScope.filter(order => group(order) === tab);
  const byMachine = Array.from(shown.reduce((map, order) => map.set(order.machine, [...(map.get(order.machine) ?? []), order]), new Map<string, MachineWorkItem[]>()).entries());

  async function save(order: MachineWorkItem, findings: string, keyValues: string, file: File | null) {
    setBusy(order.id); setError(null);
    try {
      // The report goes up first, so a failed upload never leaves a result without its file.
      if (file) { const form = new FormData(); form.set("orderId", order.id); form.set("file", file); const response = await fetch("/api/machines/report", { method: "POST", body: form }); if (!response.ok) { const body = await response.json().catch(() => ({})); throw new ClientApiError(body.error ?? "serviceUnavailable", response.status, body); } }
      await api("/api/machines/result", { id: order.id, version: order.version, findings, keyValues }); live.refresh();
    } catch (value) { setError(intakeError(value)); live.refresh(); }
    finally { setBusy(null); }
  }
  async function skip(order: MachineWorkItem, note: string) {
    setBusy(order.id); setError(null);
    try { await api("/api/machines/not-done", { id: order.id, version: order.version, note }); live.refresh(); }
    catch (value) { setError(intakeError(value)); }
    finally { setBusy(null); setSkipping(null); }
  }
  const tabs: [Tab, MessageKey][] = [["ready", "machineToDo"], ["coming", "machineComing"], ["done", "machineDoneToday"]];

  return <div className="lab-worklist machine-worklist">
    <div className="reception-queue-toolbar">
      <div className="queue-filters" role="tablist" aria-label={t("diagnostics")}>{tabs.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "is-active" : ""} onClick={() => setTab(key)}>{t(label)}<span>{counts[key]}</span></button>)}</div>
      <LiveStatus {...live}/>
    </div>
    {machines.length > 1 && <div className="machine-filter" role="group" aria-label={t("machineFilterLabel")}><button type="button" aria-pressed={!mine.length} className={!mine.length ? "is-active" : ""} onClick={() => { setMine([]); try { localStorage.removeItem(MINE_KEY); } catch { /* fine */ } }}>{t("allMachines")}</button>{machines.map(([id, name]) => <button key={id} type="button" aria-pressed={mine.includes(id)} className={mine.includes(id) ? "is-active" : ""} onClick={() => toggleMine(id)}>{name}</button>)}</div>}
    <ErrorNotice error={error}/>
    {byMachine.map(([machine, list]) => <section key={machine} className="panel lab-list machine-group" aria-label={machine}>
      <header className="machine-group-head"><ScanEye size={18}/><h2>{machine}</h2><span>{list.length}</span></header>
      {list.map(order => { const emergency = order.visitType === "emergency"; return <article key={order.id} className={`lab-visit ${emergency ? "is-emergency" : ""}`} data-testid={`machine-${order.id}`}>
        <div className="lab-patient">
          <span className="patient-avatar">{order.name[0]}</span>
          <div><strong>{order.name}</strong><small>{order.mrn} · {ageFromDob(order.dob)} {t("years")} · {t(`gender_${order.gender}` as MessageKey)}</small>{order.flags.length > 0 && <RiskFlags flags={order.flags}/>}</div>
          <div className="lab-visit-meta">{emergency && <strong className="emergency-tag"><Siren size={13}/>{t("emergencyTag")}</strong>}<span className="machine-eye">{t(`eye_${order.eye}` as MessageKey)}</span><span>{order.clinic}</span><span>{t("orderedByLabel")} {order.orderedBy}</span><span className="qc-time"><Clock3 size={13}/><span dir="ltr">{waited(Math.max(0, Math.floor((now - new Date(order.checkedInAt).getTime()) / 60000)))}</span></span></div>
        </div>
        <div className="lab-tests">{tab === "ready" ? <MachineEntry order={order} busy={busy === order.id} onSave={(findings, keyValues, file) => void save(order, findings, keyValues, file)} onSkip={() => setSkipping(order)}/>
          : tab === "coming" ? <p className="machine-wait"><Hourglass size={15}/>{order.status === "awaiting_approval" ? t("machineAwaitingDoctor") : order.stage === "dilation" && order.dilationReadyAt ? `${t("machineInDilation")} ${Math.max(0, Math.ceil((new Date(order.dilationReadyAt).getTime() - now) / 60000))} ${t("minutesShort")}` : t("machineAtWorkup")}</p>
          : <div className="lab-test is-recorded"><div className="lab-test-name"><strong>{t(`machineStatus_${order.status}` as MessageKey)}</strong><small>{order.resultedBy}</small></div><span className={order.status === "done" ? "machine-findings" : "lab-value is-skipped"}>{order.status === "done" ? order.findings : order.note}</span>{order.reports.length > 0 && <span className="machine-reports">{order.reports.map(report => <a key={report.id} href={`/api/machines/report?id=${report.id}`} target="_blank" rel="noreferrer"><FileText size={14}/>{report.filename}</a>)}</span>}</div>}</div>
      </article>; })}
    </section>)}
    {live.data && !shown.length && <section className="panel"><p className="reception-queue-empty"><ScanEye size={18}/>{t(tab === "ready" ? "machineNothingToDo" : tab === "coming" ? "machineNothingComing" : "machineNothingDone")}</p></section>}
    {skipping && <ReasonDialog title="machineNotDoneReason" busy={busy === skipping.id} onClose={() => setSkipping(null)} onConfirm={note => void skip(skipping, note)}/>}
  </div>;
}

function MachineEntry({ order, busy, onSave, onSkip }: { order: MachineWorkItem; busy: boolean; onSave: (findings: string, keyValues: string, file: File | null) => void; onSkip: () => void }) {
  const { t } = useLocale(); const [findings, setFindings] = useState(""), [keyValues, setKeyValues] = useState(""), [file, setFile] = useState<File | null>(null);
  return <form className="machine-entry" onSubmit={event => { event.preventDefault(); if (findings.trim().length >= 3) onSave(findings.trim(), keyValues.trim(), file); }}>
    <label><span>{t("machineFindings")}</span><textarea required minLength={3} maxLength={2000} value={findings} onChange={event => setFindings(event.target.value)}/></label>
    <label><span>{t("machineKeyValues")}</span><input maxLength={400} placeholder={t("machineKeyValuesHint")} value={keyValues} onChange={event => setKeyValues(event.target.value)}/></label>
    <label className="machine-file"><Paperclip size={15}/><span>{file ? file.name : t("attachReport")}</span><input type="file" accept="application/pdf,image/png,image/jpeg" onChange={event => setFile(event.target.files?.[0] ?? null)}/></label>
    <div className="lab-actions"><button type="submit" className="primary-button" disabled={busy || findings.trim().length < 3}>{t("saveResult")}</button><button type="button" className="text-button" disabled={busy} onClick={onSkip}>{t("labNotDone")}</button></div>
  </form>;
}
