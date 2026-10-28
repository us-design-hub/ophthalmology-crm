"use client";
import { useEffect, useRef, useState } from "react";
import { FileText, Paperclip, X } from "lucide-react";
import { api, ClientApiError } from "@/lib/api-client";
import type { Clinic } from "@/lib/intake";
import type { MachineOrderInput } from "@/lib/machines";
import type { MessageKey } from "@/lib/messages";
import { patientName, type PatientSummary } from "@/lib/patients";
import { useLocale } from "../locale-provider";
import { ErrorNotice, intakeError } from "../intake/shared";
import { MachinePicker } from "./machine-picker";

/** What reception records for a patient sent by an outside doctor for tests only. */
export type Referral = { facilityId: string; referralDoctor: string; referralSource: string; tests: MachineOrderInput[]; letter: File | null };
export const emptyReferral: Referral = { facilityId: "", referralDoctor: "", referralSource: "", tests: [], letter: null };
export function referralProblem(value: Referral): MessageKey | null {
  if (!value.facilityId) return "queueClinicRequired";
  if (value.referralDoctor.trim().length < 2) return "referralDoctorRequired";
  return value.tests.length ? null : "referralTestsRequired";
}

/**
 * Register the referral visit, then attach the letter. The visit stands even
 * if the letter fails to upload; that problem is reported, not retried.
 */
export async function submitReferral(patientId: string, value: Referral): Promise<{ letterError: MessageKey | null }> {
  const { id } = await api<{ id: string }>("/api/machines/referral", { patientId, facilityId: value.facilityId, referralDoctor: value.referralDoctor.trim(), referralSource: value.referralSource.trim(), tests: value.tests });
  if (!value.letter) return { letterError: null };
  const form = new FormData(); form.set("encounterId", id); form.set("file", value.letter);
  const response = await fetch("/api/referrals/letter", { method: "POST", body: form });
  if (response.ok) return { letterError: null };
  const body = await response.json().catch(() => ({}));
  return { letterError: intakeError(new ClientApiError(body.error ?? "serviceUnavailable", response.status, body)) };
}

export function ReferralFields({ clinics, value, onChange, disabled = false }: { clinics: Clinic[]; value: Referral; onChange: (value: Referral) => void; disabled?: boolean }) {
  const { t } = useLocale();
  const set = <K extends keyof Referral>(key: K, next: Referral[K]) => onChange({ ...value, [key]: next });
  return <fieldset className="visit-queue referral-fields" disabled={disabled}><legend>{t("referralTitle")}</legend>
    <div className="registration-grid">
      <label className="form-field"><span>{t("referralDoctor")} *</span><input name="referralDoctor" maxLength={120} value={value.referralDoctor} onChange={event => set("referralDoctor", event.target.value)}/></label>
      <label className="form-field"><span>{t("referralSource")}</span><input name="referralSource" maxLength={120} placeholder={t("referralSourceHint")} value={value.referralSource} onChange={event => set("referralSource", event.target.value)}/></label>
      <label className="form-field"><span>{t("clinicLabel")} *</span><select name="referralClinic" value={value.facilityId} onChange={event => set("facilityId", event.target.value)}><option value="">{t("chooseClinic")}</option>{clinics.map(clinic => <option key={clinic.id} value={clinic.id}>{clinic.name}</option>)}</select></label>
      <label className="form-field referral-letter"><span>{t("referralLetter")}</span><span className="referral-file"><Paperclip size={15}/>{value.letter ? value.letter.name : t("referralLetterHint")}<input type="file" accept="application/pdf,image/png,image/jpeg" onChange={event => set("letter", event.target.files?.[0] ?? null)}/></span></label>
    </div>
    <MachinePicker facilityId={value.facilityId} value={value.tests} onChange={tests => set("tests", tests)} suggest={false} help="referralTestsHelp" disabled={disabled}/>
    <p className="identifier-help">{t("referralFlowHelp")}</p>
  </fieldset>;
}

/** For a returning patient: open a referral visit from their record. */
export function ReferralDialog({ patient, onClose, onSaved }: { patient: PatientSummary; onClose: () => void; onSaved: (letterError: MessageKey | null) => void }) {
  const { t } = useLocale(); const ref = useRef<HTMLDialogElement>(null);
  const [clinics, setClinics] = useState<Clinic[]>([]), [value, setValue] = useState<Referral>(emptyReferral), [busy, setBusy] = useState(false), [error, setError] = useState<MessageKey | null>(null);
  useEffect(() => { ref.current?.showModal(); const controller = new AbortController(); api<{ clinics: Clinic[] }>("/api/intake/clinics", undefined, { signal: controller.signal }).then(result => setClinics(result.clinics)).catch(value => { if (!controller.signal.aborted) setError(intakeError(value)); }); return () => controller.abort(); }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault(); const problem = referralProblem(value); if (problem) { setError(problem); return; }
    setBusy(true); setError(null);
    try { const { letterError } = await submitReferral(patient.id, value); onSaved(letterError); }
    catch (caught) { setError(intakeError(caught)); setBusy(false); }
  }
  return <dialog ref={ref} className="intake-dialog referral-dialog" aria-labelledby="referral-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="patient-record-header"><div><p className="eyebrow">{t("machineTestsLabel")}</p><h2 id="referral-title">{t("referralForTests")}</h2><p><FileText size={14}/> {patientName(patient)} · {patient.mrn}</p></div><button type="button" className="icon-button" disabled={busy} aria-label={t("adminCancel")} onClick={onClose}><X size={20}/></button></div>
    <form className="intake-dialog-body registration-dialog-like" onSubmit={save}><ErrorNotice error={error}/><ReferralFields clinics={clinics} value={value} onChange={next => { setValue(next); setError(null); }} disabled={busy}/>
      <div className="intake-dialog-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>{t("adminCancel")}</button><button type="submit" className="primary-button" disabled={busy}>{t("registerReferral")}</button></div></form>
  </dialog>;
}
