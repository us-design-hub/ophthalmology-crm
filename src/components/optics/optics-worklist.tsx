"use client";
import { useState } from "react";
import { Glasses } from "lucide-react";
import { api } from "@/lib/api-client";
import { LENS_TYPES, opticsDispenseInputSchema, type OpticsDispense, type OpticsReferral, type RefractionEye } from "@/lib/optics";
import type { MessageKey } from "@/lib/messages";
import { ErrorNotice, intakeError, LiveStatus, RiskFlags, useLiveData } from "../intake/shared";

const number = (value: number | null | undefined) => value === null || value === undefined ? "--" : `${value >= 0 ? "+" : ""}${Number(value).toFixed(2)}`;
function eye(label: string, reading: RefractionEye) {
  return `${label} ${number(reading.sphere)} / ${number(reading.cylinder)} x ${reading.axis ?? "--"}${reading.add !== null && reading.add !== undefined ? `  ADD ${number(reading.add)}` : ""}`;
}
const inputNumber = (value: number | null | undefined) => value === null || value === undefined ? "" : String(value);
const optional = (value: string) => value === "" ? null : Number(value);
const required = (value: string) => value === "" ? Number.NaN : Number(value);
const pairLabel = (sequence: number) => sequence === 1 ? "First hospital pair" : sequence === 2 ? "Second hospital pair" : `Hospital pair #${sequence}`;
function todayKarachi() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function OpticsWorklist() {
  const live = useLiveData<{ referrals: OpticsReferral[]; serverNow: string }>("/api/optics/worklist");
  return <div className="optics-worklist">
    <div className="reception-queue-toolbar"><div><h2>Patients requiring optics</h2><p>Review the clinical readings. Record a dispense only when hospital optics actually supplies the glasses.</p></div><LiveStatus {...live}/></div>
    <section className="optics-grid" aria-label="Patients requiring optics">
      {(live.data?.referrals ?? []).map(referral => <article className="panel optics-card" key={referral.id}>
        <header><span className="patient-avatar">{referral.patient[0]}</span><div><h3>{referral.patient}</h3><p>{referral.mrn} / {referral.phone}</p></div><span className="optics-status is-ready">Optics required</span></header>
        {referral.flags.length > 0 && <RiskFlags flags={referral.flags}/>}<dl><div><dt>Clinic</dt><dd>{referral.clinic}</dd></div><div><dt>Marked by</dt><dd>{referral.doctor}</dd></div><div><dt>Marked</dt><dd>{new Date(referral.markedAt).toLocaleString()}</dd></div></dl>
        {referral.referralNote && <div className="optics-referral-note"><strong>Doctor note</strong><p>{referral.referralNote}</p></div>}
        <div className="optics-comparison"><WorkupBlock referral={referral}/>{referral.doctorSuggestion ? <SuggestionBlock referral={referral}/> : <div className="optics-previous-empty"><strong>Doctor suggestion</strong><p>No final glasses prescription was suggested. Assess using the approved workup readings.</p></div>}</div>
        <DispensingHistory history={referral.dispensingHistory}/>
        <DispenseForm referral={referral} onSaved={live.refresh}/>
      </article>)}
      {live.data && !live.data.referrals.length && <div className="panel optics-empty"><Glasses size={24}/><h3>No patients marked for optics</h3><p>Patients appear here after a doctor signs the consultation record and marks Optics Required.</p></div>}
    </section>
  </div>;
}

function WorkupBlock({ referral }: { referral: OpticsReferral }) {
  const workup = referral.workup;
  if (!workup) return <div className="optics-previous-empty"><strong>Workup readings</strong><p>No saved workup readings are available for this visit.</p></div>;
  return <div className="optics-rx"><div className="optics-rx-heading"><strong>{workup.source === "senior" ? "Senior-approved workup" : "Technician workup"}</strong><time dateTime={workup.reviewedAt ?? workup.savedAt}>{new Date(workup.reviewedAt ?? workup.savedAt).toLocaleString()}</time></div><span>{eye("OD", workup.OD)}</span><span>{eye("OS", workup.OS)}</span><span>PD {workup.pd ?? "--"} mm</span><small>Corrected VA: OD {workup.OD.corrected ?? "--"} / OS {workup.OS.corrected ?? "--"}</small></div>;
}

function SuggestionBlock({ referral }: { referral: OpticsReferral }) {
  const od: RefractionEye = { sphere: referral.odSphere, cylinder: referral.odCylinder, axis: referral.odAxis, add: referral.odAdd };
  const os: RefractionEye = { sphere: referral.osSphere, cylinder: referral.osCylinder, axis: referral.osAxis, add: referral.osAdd };
  return <div className="optics-rx"><div className="optics-rx-heading"><strong>Doctor-suggested glasses</strong></div><span>{eye("OD", od)}{referral.odPrism ? `  Prism ${referral.odPrism}` : ""}</span><span>{eye("OS", os)}{referral.osPrism ? `  Prism ${referral.osPrism}` : ""}</span><span>PD {referral.pd ?? "--"} mm / {referral.lensType?.replaceAll("_", " ") ?? "lens type not specified"}</span>{referral.instructions && <p>{referral.instructions}</p>}</div>;
}

function DispensingHistory({ history }: { history: OpticsDispense[] }) {
  return <section className="optics-history"><div className="optics-history-heading"><div><strong>Hospital glasses history</strong><span>{history.length ? `${history.length} pair${history.length === 1 ? "" : "s"} supplied` : "No hospital dispense recorded"}</span></div></div>
    {history.length ? <div className="optics-history-list">{history.map(item => <details key={item.id}><summary><span>{pairLabel(item.sequence)}</span><time dateTime={item.dispensedAt}>{new Date(`${item.dispensedAt}T00:00:00`).toLocaleDateString()}</time></summary><div><span>{eye("OD", { sphere: item.odSphere, cylinder: item.odCylinder, axis: item.odAxis, add: item.odAdd })}{item.odPrism ? `  Prism ${item.odPrism}` : ""}</span><span>{eye("OS", { sphere: item.osSphere, cylinder: item.osCylinder, axis: item.osAxis, add: item.osAdd })}{item.osPrism ? `  Prism ${item.osPrism}` : ""}</span><span>PD {item.pd} mm / {item.lensType.replaceAll("_", " ")}</span><small>Recorded by {item.optician}{item.note ? ` · ${item.note}` : ""}</small></div></details>)}</div> : <p>Leave this empty when the patient uses an outside optical shop.</p>}
  </section>;
}

type EyeInput = { sphere: string; cylinder: string; axis: string; add: string; prism: string };
function DispenseForm({ referral, onSaved }: { referral: OpticsReferral; onSaved: () => void }) {
  const sourceOd = referral.doctorSuggestion ? { sphere: referral.odSphere, cylinder: referral.odCylinder, axis: referral.odAxis, add: referral.odAdd, prism: referral.odPrism } : { ...referral.workup?.OD, prism: "" };
  const sourceOs = referral.doctorSuggestion ? { sphere: referral.osSphere, cylinder: referral.osCylinder, axis: referral.osAxis, add: referral.osAdd, prism: referral.osPrism } : { ...referral.workup?.OS, prism: "" };
  const toEye = (value: typeof sourceOd): EyeInput => ({ sphere: inputNumber(value.sphere), cylinder: inputNumber(value.cylinder), axis: inputNumber(value.axis), add: inputNumber(value.add), prism: value.prism ?? "" });
  const [open, setOpen] = useState(false), [od, setOd] = useState(() => toEye(sourceOd)), [os, setOs] = useState(() => toEye(sourceOs));
  const [date, setDate] = useState(todayKarachi), [pd, setPd] = useState(() => inputNumber(referral.doctorSuggestion ? referral.pd : referral.workup?.pd));
  const [lensType, setLensType] = useState<(typeof LENS_TYPES)[number]>(() => referral.lensType ?? "distance"), [note, setNote] = useState(""), [error, setError] = useState<MessageKey | null>(null), [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(null);
    const parsed = opticsDispenseInputSchema.safeParse({ referralId: referral.id, dispensedAt: date, odSphere: required(od.sphere), odCylinder: optional(od.cylinder), odAxis: optional(od.axis), odAdd: optional(od.add), odPrism: od.prism, osSphere: required(os.sphere), osCylinder: optional(os.cylinder), osAxis: optional(os.axis), osAdd: optional(os.add), osPrism: os.prism, pd: required(pd), lensType, note });
    if (!parsed.success) { setError("opticsDispenseInvalid"); return; }
    setBusy(true); try { await api("/api/optics/dispense", parsed.data); setOpen(false); onSaved(); } catch (value) { setError(intakeError(value)); } finally { setBusy(false); }
  }
  return <div className="optics-dispense"><button type="button" className="secondary-button" onClick={() => setOpen(value => !value)}>{open ? "Cancel hospital dispense" : "Record glasses supplied by hospital"}</button>{open && <form className="spectacle-form" onSubmit={submit}><p>This creates a permanent hospital dispensing record. Confirm the exact prescription used.</p><ErrorNotice error={error}/><label><span>Date supplied</span><input type="date" required max={todayKarachi()} value={date} onChange={event => setDate(event.target.value)}/></label><div className="spectacle-eyes"><DispenseEyeFields label="OD / Right eye" value={od} onChange={setOd}/><DispenseEyeFields label="OS / Left eye" value={os} onChange={setOs}/></div><div className="spectacle-meta"><label><span>Binocular PD (mm)</span><input type="number" inputMode="decimal" min={40} max={80} step="0.5" required value={pd} onChange={event => setPd(event.target.value)}/></label><label><span>Lens type</span><select value={lensType} onChange={event => setLensType(event.target.value as typeof lensType)}>{LENS_TYPES.map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label></div><label><span>Dispensing note (optional)</span><textarea maxLength={1000} value={note} onChange={event => setNote(event.target.value)}/></label><button className="primary-button" disabled={busy}>{busy ? "Recording..." : `Record ${referral.dispensingHistory.length ? `hospital pair #${referral.dispensingHistory.length + 1}` : "first hospital pair"}`}</button></form>}</div>;
}

function DispenseEyeFields({ label, value, onChange }: { label: string; value: EyeInput; onChange: (value: EyeInput) => void }) {
  const field = (key: keyof EyeInput, labelText: string, min: number, max: number, step: string) => <label><span>{labelText}</span><input type="number" inputMode="decimal" min={min} max={max} step={step} required={key === "sphere"} value={value[key]} onChange={event => onChange({ ...value, [key]: event.target.value })}/></label>;
  return <fieldset><legend>{label}</legend><div>{field("sphere", "Sphere", -30, 30, "0.25")}{field("cylinder", "Cylinder", -10, 10, "0.25")}{field("axis", "Axis", 0, 180, "1")}{field("add", "Add", 0, 6, "0.25")}</div><label><span>Prism (optional)</span><input maxLength={40} value={value.prism} onChange={event => onChange({ ...value, prism: event.target.value })}/></label></fieldset>;
}
