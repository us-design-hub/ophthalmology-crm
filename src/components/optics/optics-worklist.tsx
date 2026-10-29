"use client";
import { useState } from "react";
import { Check, Clock3, Glasses, PackageCheck, Wrench } from "lucide-react";
import { api } from "@/lib/api-client";
import type { OpticsStatus, SpectacleOrder, SpectacleReading } from "@/lib/optics";
import { ErrorNotice, intakeError, LiveStatus, RiskFlags, useLiveData } from "../intake/shared";
import type { MessageKey } from "@/lib/messages";

const labels: Record<OpticsStatus, string> = { issued: "New order", in_progress: "Being prepared", ready: "Ready for collection", collected: "Collected", cancelled: "Cancelled" };
const number = (value: number | null) => value === null ? "--" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
function eye(reading: SpectacleReading, side: "od" | "os") {
  const sphere = side === "od" ? reading.odSphere : reading.osSphere, cylinder = side === "od" ? reading.odCylinder : reading.osCylinder;
  const axis = side === "od" ? reading.odAxis : reading.osAxis, add = side === "od" ? reading.odAdd : reading.osAdd, prism = side === "od" ? reading.odPrism : reading.osPrism;
  return `${side.toUpperCase()} ${number(sphere)} / ${number(cylinder)} x ${axis ?? "--"}${add !== null ? `  ADD ${number(add)}` : ""}${prism ? `  Prism ${prism}` : ""}`;
}

export function OpticsWorklist() {
  const live = useLiveData<{ orders: SpectacleOrder[]; serverNow: string }>("/api/optics/worklist");
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState<MessageKey | null>(null), [notes, setNotes] = useState<Record<string, string>>({});
  async function move(order: SpectacleOrder, status: "in_progress" | "ready" | "collected" | "cancelled") {
    setBusy(order.id); setError(null);
    try { await api("/api/optics/status", { id: order.id, version: order.version, status, note: notes[order.id] ?? "" }); live.refresh(); }
    catch (value) { setError(intakeError(value)); live.refresh(); }
    finally { setBusy(null); }
  }
  return <div className="optics-worklist">
    <div className="reception-queue-toolbar"><div><h2>Optics worklist</h2><p>Compare the new prescription with the patient&apos;s last collected glasses before dispensing.</p></div><LiveStatus {...live}/></div>
    <ErrorNotice error={error}/>
    <section className="optics-grid" aria-label="Optics worklist">
      {(live.data?.orders ?? []).map(order => <article className="panel optics-card" key={order.id}>
        <header><span className="patient-avatar">{order.patient[0]}</span><div><h3>{order.patient}</h3><p>{order.mrn} / {order.phone}</p></div><span className={`optics-status is-${order.status}`}>{labels[order.status]}</span></header>
        {order.flags.length > 0 && <RiskFlags flags={order.flags}/>}<dl><div><dt>Clinic</dt><dd>{order.clinic}</dd></div><div><dt>Prescribed by</dt><dd>{order.doctor}</dd></div><div><dt>Prescribed</dt><dd>{new Date(order.prescribedAt).toLocaleString()}</dd></div></dl>
        <div className="optics-comparison"><PrescriptionBlock title="New prescription" reading={order} date={order.prescribedAt}/>{order.previous ? <PrescriptionBlock title="Last glasses provided" reading={order.previous} date={order.previous.collectedAt} note={order.previous.dispensingNote}/> : <div className="optics-previous-empty"><strong>Last glasses provided</strong><p>No earlier collected glasses are recorded for this patient.</p></div>}</div>
        {order.status !== "collected" && <><label className="optics-note"><span>Dispensing note</span><textarea maxLength={1000} value={notes[order.id] ?? order.dispensingNote} onChange={event => setNotes(value => ({ ...value, [order.id]: event.target.value }))}/></label><div className="optics-actions">
          {order.status === "issued" && <button className="primary-button" disabled={busy === order.id} onClick={() => void move(order, "in_progress")}><Wrench size={16}/>Start preparing</button>}
          {order.status === "in_progress" && <button className="primary-button" disabled={busy === order.id} onClick={() => void move(order, "ready")}><PackageCheck size={16}/>Mark ready</button>}
          {order.status === "ready" && <><button className="primary-button" disabled={busy === order.id} onClick={() => void move(order, "collected")}><Check size={16}/>Record collection</button><button className="text-button" disabled={busy === order.id} onClick={() => void move(order, "in_progress")}><Clock3 size={16}/>Return to preparation</button></>}
          <button className="text-button danger" disabled={busy === order.id || (notes[order.id] ?? "").trim().length < 8} onClick={() => void move(order, "cancelled")}>Cancel order</button>
        </div></>}
      </article>)}
      {live.data && !live.data.orders.length && <div className="panel optics-empty"><Glasses size={24}/><h3>No glasses orders waiting</h3><p>Orders appear here after a doctor signs the consultation record and sends a spectacle prescription.</p></div>}
    </section>
  </div>;
}

function PrescriptionBlock({ title, reading, date, note }: { title: string; reading: SpectacleReading; date: string; note?: string }) {
  return <div className="optics-rx"><div className="optics-rx-heading"><strong>{title}</strong><time dateTime={date}>{new Date(date).toLocaleString()}</time></div><span>{eye(reading, "od")}</span><span>{eye(reading, "os")}</span><span>PD {reading.pd.toFixed(1)} mm / {reading.lensType.replaceAll("_", " ")}</span>{reading.instructions && <p>{reading.instructions}</p>}{note && <small>Dispensing note: {note}</small>}</div>;
}
