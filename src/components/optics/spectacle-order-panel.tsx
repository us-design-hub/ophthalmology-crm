"use client";
import { useEffect, useState } from "react";
import { Glasses } from "lucide-react";
import { api } from "@/lib/api-client";
import { LENS_TYPES, spectacleInputSchema, type SpectacleOrder } from "@/lib/optics";
import type { MessageKey } from "@/lib/messages";
import { ErrorNotice, intakeError } from "../intake/shared";

const emptyEye = { sphere: "", cylinder: "", axis: "", add: "", prism: "" };
const optional = (value: string) => value === "" ? null : Number(value);
export function SpectacleOrderPanel({ encounterId, encounterVersion, signed, canIssue }: { encounterId: string; encounterVersion: number; signed: boolean; canIssue: boolean }) {
  const [orders, setOrders] = useState<SpectacleOrder[]>([]), [od, setOd] = useState(emptyEye), [os, setOs] = useState(emptyEye), [pd, setPd] = useState(""), [lensType, setLensType] = useState<(typeof LENS_TYPES)[number]>("distance"), [instructions, setInstructions] = useState(""), [error, setError] = useState<MessageKey | null>(null), [busy, setBusy] = useState(false);
  const load = () => api<{ orders: SpectacleOrder[] }>(`/api/optics/encounter?encounterId=${encounterId}`).then(value => setOrders(value.orders)).catch(value => setError(intakeError(value)));
  useEffect(() => { void load(); }, [encounterId]);
  const active = orders.find(order => order.status !== "cancelled");
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(null);
    const parsed = spectacleInputSchema.safeParse({ encounterId, encounterVersion, odSphere: Number(od.sphere), odCylinder: optional(od.cylinder), odAxis: optional(od.axis), odAdd: optional(od.add), odPrism: od.prism, osSphere: Number(os.sphere), osCylinder: optional(os.cylinder), osAxis: optional(os.axis), osAdd: optional(os.add), osPrism: os.prism, pd: Number(pd), lensType, instructions });
    if (!parsed.success || od.sphere === "" || os.sphere === "" || pd === "") { setError("opticsInvalid"); return; }
    setBusy(true); try { await api("/api/optics/issue", parsed.data); await load(); } catch (value) { setError(intakeError(value)); } finally { setBusy(false); }
  }
  return <section className="clinical-card spectacle-panel"><h3><Glasses size={19}/>Spectacle prescription</h3><p>Send signed refraction measurements to optics. Medication prescriptions remain separate.</p><ErrorNotice error={error}/>
    {active ? <div className="spectacle-issued"><strong>Sent to optics</strong><span>Status: {active.status.replaceAll("_", " ")}</span><span>OD {active.odSphere} / {active.odCylinder ?? "—"} × {active.odAxis ?? "—"}</span><span>OS {active.osSphere} / {active.osCylinder ?? "—"} × {active.osAxis ?? "—"}</span><span>PD {active.pd} mm · {active.lensType}</span></div> : canIssue ? <form onSubmit={submit} className="spectacle-form"><div className="spectacle-eyes"><EyeFields label="OD · Right eye" value={od} onChange={setOd}/><EyeFields label="OS · Left eye" value={os} onChange={setOs}/></div><div className="spectacle-meta"><label><span>PD (mm)</span><input type="number" inputMode="decimal" min={40} max={80} step="0.5" required value={pd} onChange={event => setPd(event.target.value)}/></label><label><span>Lens type</span><select value={lensType} onChange={event => setLensType(event.target.value as typeof lensType)}>{LENS_TYPES.map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label></div><label><span>Lens / frame instructions</span><textarea maxLength={2000} value={instructions} onChange={event => setInstructions(event.target.value)}/></label><button className="primary-button" disabled={busy || !signed}>{busy ? "Sending…" : "Send to optics"}</button>{!signed && <small>Sign the Doctor Event before issuing the spectacle prescription.</small>}</form> : <p className="muted-note">No spectacle prescription was issued from this visit.</p>}
  </section>;
}
type EyeValue = typeof emptyEye;
function EyeFields({ label, value, onChange }: { label: string; value: EyeValue; onChange: (value: EyeValue) => void }) {
  const field = (key: keyof EyeValue, labelText: string, min: number, max: number, step: string) => <label><span>{labelText}</span><input type="number" inputMode="decimal" min={min} max={max} step={step} required={key === "sphere"} value={value[key]} onChange={event => onChange({ ...value, [key]: event.target.value })}/></label>;
  return <fieldset><legend>{label}</legend><div>{field("sphere", "Sphere", -30, 30, "0.25")}{field("cylinder", "Cylinder", -10, 10, "0.25")}{field("axis", "Axis", 0, 180, "1")}{field("add", "Add", 0, 6, "0.25")}</div><label><span>Prism (optional)</span><input maxLength={40} value={value.prism} onChange={event => onChange({ ...value, prism: event.target.value })}/></label></fieldset>;
}
