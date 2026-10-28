"use client";
import { useState } from "react";
import { Check, Clock3, FlaskConical, Siren, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api-client";
import { formatLabResult, isAbnormal, type LabResult, type LabWorkItem } from "@/lib/lab";
import type { MessageKey } from "@/lib/messages";
import { ageFromDob } from "@/lib/patients";
import { useLocale } from "../locale-provider";
import { ReasonDialog } from "../reason-dialog";
import { ErrorNotice, intakeError, LiveStatus, RiskFlags, useLiveData } from "../intake/shared";
import { waited } from "../intake/reception-queue";

/**
 * The lab assistant's to-do list: BP and blood sugar for patients already in
 * the hospital. Tests run alongside the queue, so nobody waits on the lab.
 */
type Tab = "todo" | "done";
export function LabWorklist() {
  const { t } = useLocale();
  const live = useLiveData<{ orders: LabWorkItem[]; serverNow: string }>("/api/lab/worklist");
  const [tab, setTab] = useState<Tab>("todo"); const [error, setError] = useState<MessageKey | null>(null);
  const [skipping, setSkipping] = useState<LabWorkItem | null>(null); const [busy, setBusy] = useState<string | null>(null);
  const orders = live.data?.orders ?? [];
  const now = new Date(live.data?.serverNow ?? Date.now()).getTime();
  // One row per visit, so BP and sugar for the same patient are done together. A visit
  // stays under To do, finished tests included, until none of its tests is pending.
  const all = Array.from(orders.reduce((map, order) => map.set(order.encounterId, [...(map.get(order.encounterId) ?? []), order]), new Map<string, LabWorkItem[]>()).values());
  const open = all.filter(group => group.some(order => order.status === "pending")), finished = all.filter(group => group.every(order => order.status !== "pending"));
  const visits = tab === "todo" ? open : finished, pending = open.length, done = finished.length;

  async function save(order: LabWorkItem, result: LabResult) {
    setBusy(order.id); setError(null);
    try { await api("/api/lab/result", { id: order.id, version: order.version, result }); live.refresh(); }
    catch (value) { setError(intakeError(value)); live.refresh(); }
    finally { setBusy(null); }
  }
  async function skip(order: LabWorkItem, note: string) {
    setBusy(order.id); setError(null);
    try { await api("/api/lab/not-done", { id: order.id, version: order.version, note }); live.refresh(); }
    catch (value) { setError(intakeError(value)); }
    finally { setBusy(null); setSkipping(null); }
  }

  return <div className="lab-worklist">
    <div className="reception-queue-toolbar">
      <div className="queue-filters" role="tablist" aria-label={t("laboratory")}>
        <button type="button" role="tab" aria-selected={tab === "todo"} className={tab === "todo" ? "is-active" : ""} onClick={() => setTab("todo")}>{t("labToDo")}<span>{pending}</span></button>
        <button type="button" role="tab" aria-selected={tab === "done"} className={tab === "done" ? "is-active" : ""} onClick={() => setTab("done")}>{t("labDoneToday")}<span>{done}</span></button>
      </div>
      <LiveStatus {...live}/>
    </div>
    <ErrorNotice error={error}/>
    <section className="panel lab-list" aria-label={t("laboratory")}>
      {visits.map(group => { const first = group[0], emergency = first.visitType === "emergency"; return <article key={first.encounterId} className={`lab-visit ${emergency ? "is-emergency" : ""}`} data-testid={`lab-${first.encounterId}`}>
        <div className="lab-patient">
          <span className="patient-avatar">{first.name[0]}</span>
          <div><strong>{first.name}</strong><small>{first.mrn} · {ageFromDob(first.dob)} {t("years")} · {t(`gender_${first.gender}` as MessageKey)}</small>{first.flags.length > 0 && <RiskFlags flags={first.flags}/>}</div>
          <div className="lab-visit-meta">{emergency && <strong className="emergency-tag"><Siren size={13}/>{t("emergencyTag")}</strong>}<span>{first.clinic}</span><span className="qc-time"><Clock3 size={13}/><span dir="ltr">{waited(Math.max(0, Math.floor((now - new Date(first.checkedInAt).getTime()) / 60000)))}</span></span></div>
        </div>
        <div className="lab-tests">{group.map(order => <LabTestRow key={order.id} order={order} busy={busy === order.id} onSave={result => void save(order, result)} onSkip={() => setSkipping(order)}/>)}</div>
      </article>; })}
      {live.data && !visits.length && <p className="reception-queue-empty"><FlaskConical size={18}/>{t(tab === "todo" ? "labNothingToDo" : "labNothingDone")}</p>}
    </section>
    {skipping && <ReasonDialog title="labNotDoneReason" busy={busy === skipping.id} onClose={() => setSkipping(null)} onConfirm={note => void skip(skipping, note)}/>}
  </div>;
}

/** One test: quick entry while pending, the recorded value afterwards. */
function LabTestRow({ order, busy, onSave, onSkip }: { order: LabWorkItem; busy: boolean; onSave: (result: LabResult) => void; onSkip: () => void }) {
  const { t } = useLocale();
  const [systolic, setSystolic] = useState(""), [diastolic, setDiastolic] = useState(""), [value, setValue] = useState(""), [kind, setKind] = useState<"random" | "fasting">("random");
  const reasons = order.reasons.map(reason => t(`labReason_${reason}` as MessageKey)).join(" · ");
  const label = <div className="lab-test-name"><strong>{t(`labTest_${order.test}` as MessageKey)}</strong><small>{reasons}</small></div>;
  if (order.status !== "pending") return <div className={`lab-test is-recorded ${order.abnormal ? "is-abnormal" : ""}`}>{label}
    {order.status === "done" && order.result ? <span className="lab-value">{order.abnormal ? <TriangleAlert size={15}/> : <Check size={15}/>}<span dir="ltr">{formatLabResult(order.test, order.result)}</span>{order.test === "sugar" && <small>{t((order.result as { kind: string }).kind === "fasting" ? "sugarFasting" : "sugarRandom")}</small>}{order.abnormal && <em>{t("labOutOfRange")}</em>}</span> : <span className="lab-value is-skipped">{t("labNotDone")}: {order.note}</span>}
    {order.resultedBy && <small className="lab-by">{order.resultedBy}</small>}</div>;
  const bp = { systolic: Number(systolic), diastolic: Number(diastolic) }, sugar = { value: Number(value), kind };
  const ready = order.test === "bp" ? systolic !== "" && diastolic !== "" : value !== "";
  const preview = ready && (order.test === "bp" ? bp.systolic > bp.diastolic : true) ? isAbnormal(order.test, order.test === "bp" ? bp : sugar) : null;
  return <form className={`lab-test ${preview ? "is-abnormal" : ""}`} onSubmit={event => { event.preventDefault(); if (ready) onSave(order.test === "bp" ? bp : sugar); }}>{label}
    <div className="lab-entry">{order.test === "bp" ? <>
      <label><span className="sr-only">{t("bpSystolic")}</span><input inputMode="numeric" type="number" min={50} max={300} required placeholder={t("bpSystolicShort")} value={systolic} onChange={event => setSystolic(event.target.value)} aria-label={t("bpSystolic")}/></label>
      <span className="lab-slash" aria-hidden="true">/</span>
      <label><span className="sr-only">{t("bpDiastolic")}</span><input inputMode="numeric" type="number" min={30} max={200} required placeholder={t("bpDiastolicShort")} value={diastolic} onChange={event => setDiastolic(event.target.value)} aria-label={t("bpDiastolic")}/></label>
      <span className="lab-unit">mmHg</span></> : <>
      <label><span className="sr-only">{t("sugarValue")}</span><input inputMode="numeric" type="number" min={20} max={700} required placeholder="mg/dL" value={value} onChange={event => setValue(event.target.value)} aria-label={t("sugarValue")}/></label>
      <label><span className="sr-only">{t("sugarKind")}</span><select value={kind} onChange={event => setKind(event.target.value as "random" | "fasting")} aria-label={t("sugarKind")}><option value="random">{t("sugarRandom")}</option><option value="fasting">{t("sugarFasting")}</option></select></label></>}
      {preview && <em className="lab-flag">{t("labOutOfRange")}</em>}
    </div>
    <div className="lab-actions"><button type="submit" className="primary-button" disabled={busy || !ready}>{t("labSave")}</button><button type="button" className="text-button" disabled={busy} onClick={onSkip}>{t("labNotDone")}</button></div>
  </form>;
}
