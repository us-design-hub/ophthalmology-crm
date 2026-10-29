"use client";
import { useEffect, useState } from "react";
import { Glasses } from "lucide-react";
import { api } from "@/lib/api-client";
import { LENS_TYPES, opticsReferralInputSchema, type OpticsReferral } from "@/lib/optics";
import type { MessageKey } from "@/lib/messages";
import { ErrorNotice, intakeError } from "../intake/shared";

const emptyEye = { sphere: "", cylinder: "", axis: "", add: "", prism: "" };
const optional = (value: string) => value === "" ? null : Number(value);
export function SpectacleOrderPanel({ encounterId, encounterVersion, signed, canIssue }: { encounterId: string; encounterVersion: number; signed: boolean; canIssue: boolean }) {
  const [referrals, setReferrals] = useState<OpticsReferral[]>([]), [suggestion, setSuggestion] = useState(false), [od, setOd] = useState(emptyEye), [os, setOs] = useState(emptyEye), [pd, setPd] = useState(""), [lensType, setLensType] = useState<(typeof LENS_TYPES)[number]>("distance"), [instructions, setInstructions] = useState(""), [referralNote, setReferralNote] = useState(""), [error, setError] = useState<MessageKey | null>(null), [busy, setBusy] = useState(false);
  const load = () => api<{ referrals: OpticsReferral[] }>(`/api/optics/encounter?encounterId=${encounterId}`).then(value => setReferrals(value.referrals)).catch(value => setError(intakeError(value)));
  useEffect(() => { void load(); }, [encounterId]);
  const active = referrals[0];
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(null);
    const parsed = opticsReferralInputSchema.safeParse({ encounterId, encounterVersion, doctorSuggestion: suggestion, odSphere: suggestion ? optional(od.sphere) : null, odCylinder: suggestion ? optional(od.cylinder) : null, odAxis: suggestion ? optional(od.axis) : null, odAdd: suggestion ? optional(od.add) : null, odPrism: suggestion ? od.prism : "", osSphere: suggestion ? optional(os.sphere) : null, osCylinder: suggestion ? optional(os.cylinder) : null, osAxis: suggestion ? optional(os.axis) : null, osAdd: suggestion ? optional(os.add) : null, osPrism: suggestion ? os.prism : "", pd: suggestion ? optional(pd) : null, lensType: suggestion ? lensType : null, instructions: suggestion ? instructions : "", referralNote });
    if (!parsed.success) { setError("opticsInvalid"); return; }
    setBusy(true); try { await api("/api/optics/required", parsed.data); await load(); } catch (value) { setError(intakeError(value)); } finally { setBusy(false); }
  }
  return <section className="clinical-card spectacle-panel"><h3><Glasses size={19}/>Optics required</h3><p>Mark patients who should be reviewed by optics. They may obtain glasses from the hospital or an outside optical shop.</p><ErrorNotice error={error}/>
    {active ? <div className="spectacle-issued"><strong>Optics required</strong><span>Marked {new Date(active.markedAt).toLocaleString()}</span><span>{active.doctorSuggestion ? "Doctor suggestion included" : "Use approved workup readings"}</span>{active.referralNote && <span>{active.referralNote}</span>}</div> : canIssue ? <form onSubmit={submit} className="spectacle-form"><label className="admin-check"><input type="checkbox" checked={suggestion} onChange={event => setSuggestion(event.target.checked)}/> Include a suggested glasses prescription</label>{suggestion && <><div className="spectacle-eyes"><EyeFields label="OD / Right eye" value={od} onChange={setOd}/><EyeFields label="OS / Left eye" value={os} onChange={setOs}/></div><div className="spectacle-meta"><label><span>Binocular PD (mm)</span><input type="number" inputMode="decimal" min={40} max={80} step="0.5" required value={pd} onChange={event => setPd(event.target.value)}/></label><label><span>Lens type</span><select value={lensType} onChange={event => setLensType(event.target.value as typeof lensType)}>{LENS_TYPES.map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label></div><label><span>Suggestion / lens instructions</span><textarea maxLength={2000} value={instructions} onChange={event => setInstructions(event.target.value)}/></label></>}<label><span>Reason or note for optics</span><textarea maxLength={1000} value={referralNote} onChange={event => setReferralNote(event.target.value)}/></label><button className="primary-button" disabled={busy || !signed}>{busy ? "Saving..." : "Mark optics required"}</button>{!signed && <small>Sign the Doctor Event before marking optics required.</small>}</form> : <p className="muted-note">Optics has not been marked as required for this visit.</p>}
  </section>;
}
type EyeValue = typeof emptyEye;
function EyeFields({ label, value, onChange }: { label: string; value: EyeValue; onChange: (value: EyeValue) => void }) {
  const field = (key: keyof EyeValue, labelText: string, min: number, max: number, step: string) => <label><span>{labelText}</span><input type="number" inputMode="decimal" min={min} max={max} step={step} required={key === "sphere"} value={value[key]} onChange={event => onChange({ ...value, [key]: event.target.value })}/></label>;
  return <fieldset><legend>{label}</legend><div>{field("sphere", "Sphere", -30, 30, "0.25")}{field("cylinder", "Cylinder", -10, 10, "0.25")}{field("axis", "Axis", 0, 180, "1")}{field("add", "Add", 0, 6, "0.25")}</div><label><span>Prism (optional)</span><input maxLength={40} value={value.prism} onChange={event => onChange({ ...value, prism: event.target.value })}/></label></fieldset>;
}
