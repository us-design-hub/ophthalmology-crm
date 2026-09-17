"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, CircleAlert, LockKeyhole, ShieldCheck, X } from "lucide-react";
import { useLocale } from "../locale-provider";
import { api, ClientApiError } from "@/lib/api-client";
import { estimatedDob, patientInputSchema, patientName, type PatientSummary } from "@/lib/patients";
import { en, type MessageKey } from "@/lib/messages";

const initial = { givenName: "", familyName: "", gender: "", dob: "", dobEstimated: false, phone: "", identifierType: "cnic", identifier: "", city: "", address: "", preferredLanguage: "en", allergy: "", risk: "", nextOfKinName: "", nextOfKinPhone: "" };
type Review = { candidates: (PatientSummary & { exactIdentifier: boolean })[]; exactMatch: boolean; reviewToken: string };
export function errorKey(error: unknown): MessageKey { return error instanceof ClientApiError && error.code in en ? error.code as MessageKey : "serviceUnavailable"; }

export function PatientRegistration({ onClose, onCreated, onOpenExisting }: { onClose: () => void; onCreated: (patient: PatientSummary) => void; onOpenExisting: (id: string) => void }) {
  const { t } = useLocale(); const dialog = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState(initial); const [age, setAge] = useState("");
  const [review, setReview] = useState<Review | null>(null); const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<MessageKey | null>(null); const [invalid, setInvalid] = useState<Record<string, string>>({});
  useEffect(() => { dialog.current?.showModal(); }, []);
  const update = (name: keyof typeof initial, value: string | boolean) => { setValues(current => ({ ...current, [name]: value })); setInvalid(current => ({ ...current, [name]: "" })); setReview(null); setError(null); };
  const close = () => { if (busy) return; if (Object.entries(values).some(([key, value]) => value !== initial[key as keyof typeof initial]) && !window.confirm(t("discardRegistration"))) return; onClose(); };
  const payload = () => ({ ...values, dob: values.dobEstimated && /^\d{1,3}$/.test(age) && Number(age) <= 120 ? estimatedDob(Number(age)) : values.dobEstimated ? "" : values.dob });
  async function check(event: React.FormEvent) {
    event.preventDefault(); setError(null);
    const parsed = patientInputSchema.safeParse(payload());
    if (!parsed.success) { setInvalid(Object.fromEntries(parsed.error.issues.map(issue => [issue.path.join("."), issue.message]))); setError("validationFailed"); requestAnimationFrame(() => dialog.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); return; }
    setBusy(true);
    try { setReview(await api<Review>("/api/patients/duplicates", payload())); setReason(""); dialog.current?.scrollTo(0, 0); }
    catch (caught) { setError(errorKey(caught)); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!review) return;
    setBusy(true); setError(null);
    try { const { patient } = await api<{ patient: PatientSummary }>("/api/patients", { ...payload(), duplicateReviewToken: review.reviewToken, ...(review.candidates.length ? { duplicateReason: reason } : {}) }); onCreated(patient); }
    catch (caught) { setError(errorKey(caught)); if (caught instanceof ClientApiError && ["reviewRequired", "duplicateIdentifier"].includes(caught.code)) setReview(null); }
    finally { setBusy(false); }
  }
  const fieldError = (name: string) => invalid[name] ? <small className="field-error">{t(invalid[name] in en ? invalid[name] as MessageKey : "registrationRequiredMessage")}</small> : null;
  const field = (name: keyof typeof initial, label: MessageKey, options: { required?: boolean; type?: string; maxLength?: number; wide?: boolean } = {}) => <label className={`form-field ${options.wide ? "wide-field" : ""}`}><span>{t(label)}{options.required && " *"}</span><input name={name} value={String(values[name])} type={options.type ?? "text"} required={options.required} maxLength={options.maxLength ?? 160} aria-invalid={!!invalid[name]} onChange={event => update(name, event.target.value)}/>{fieldError(name)}</label>;

  return <dialog ref={dialog} className="registration-dialog" aria-labelledby="registration-title" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="registration-heading"><div><p className="eyebrow">{t("patientsEyebrow")}</p><h2 id="registration-title">{t(review ? "reviewTitle" : "registrationTitle")}</h2><p>{t("registrationHelp")}</p></div><button type="button" className="icon-button" aria-label={t("cancelRegistration")} disabled={busy} onClick={close}><X size={20}/></button></div>
    {error && <div className="form-error registration-error" role="alert">{t(error)}</div>}
    {!review ? <form onSubmit={check} noValidate className="registration-form"><p className="required-note">{t("requiredFields")}</p><fieldset><legend>{t("demographics")}</legend><div className="registration-grid">{field("givenName", "nameGiven", { required: true, maxLength: 80 })}{field("familyName", "nameFamily", { maxLength: 80 })}
      <label className="form-field"><span>{t("genderLabel")} *</span><select name="gender" value={values.gender} aria-invalid={!!invalid.gender} onChange={event => update("gender", event.target.value)}><option value="">{t("selectGender")}</option>{["female", "male", "other", "unknown"].map(gender => <option key={gender} value={gender}>{t(`gender_${gender}` as MessageKey)}</option>)}</select>{fieldError("gender")}</label>
      <div className="form-field"><span>{t("dobLabel")} *</span><div className="dob-toggle"><label><input type="radio" name="dobMode" checked={!values.dobEstimated} onChange={() => update("dobEstimated", false)}/>{t("birthDateKnown")}</label><label><input type="radio" name="dobMode" checked={values.dobEstimated} onChange={() => update("dobEstimated", true)}/>{t("estimatedAge")}</label></div>{values.dobEstimated ? <input aria-label={t("ageLabel")} name="age" type="number" min="0" max="120" value={age} aria-invalid={!!invalid.dob} onChange={event => { setAge(event.target.value); setInvalid(current => ({ ...current, dob: "" })); }}/> : <input aria-label={t("dobLabel")} name="dob" type="date" value={values.dob} aria-invalid={!!invalid.dob} onChange={event => update("dob", event.target.value)}/>} {fieldError("dob")}</div>
      <label className="form-field"><span>{t("identifierTypeLabel")} *</span><select name="identifierType" value={values.identifierType} aria-invalid={!!invalid.identifierType} onChange={event => update("identifierType", event.target.value)}><option value="cnic">{t("cnicLabel")}</option><option value="passport">{t("passportLabel")}</option><option value="guardian_cnic">{t("guardianCnicLabel")}</option></select>{fieldError("identifierType")}</label>{field("identifier", "identifierLabel", { required: true, maxLength: 30 })}</div><p className="identifier-help"><LockKeyhole size={13}/>{t("identifierProtection")}</p></fieldset>
      <fieldset><legend>{t("contactDetails")}</legend><div className="registration-grid">{field("phone", "phoneLabel", { required: true, type: "tel", maxLength: 30 })}{field("city", "cityColumn", { maxLength: 80 })}{field("address", "addressLabel", { maxLength: 240, wide: true })}{field("nextOfKinName", "nextOfKinLabel", { maxLength: 100 })}{field("nextOfKinPhone", "nextOfKinPhone", { type: "tel", maxLength: 30 })}<label className="form-field"><span>{t("preferredLanguage")}</span><select name="preferredLanguage" value={values.preferredLanguage} onChange={event => update("preferredLanguage", event.target.value)}><option value="en">{t("english")}</option><option value="ur">{t("urdu")}</option></select></label></div></fieldset>
      <fieldset><legend>{t("patientSafety")}</legend><div className="registration-grid">{field("allergy", "allergyLabel")}{field("risk", "riskLabel")}</div></fieldset>
      <div className="registration-footer"><button type="button" className="secondary-button" disabled={busy} onClick={close}>{t("cancelRegistration")}</button><button type="submit" className="primary-button" disabled={busy}>{t(busy ? "checkingDuplicates" : "checkDuplicates")}<ArrowRight size={15}/></button></div>
    </form> : <div className="review-content"><div className={review.candidates.length ? "duplicate-warning" : "duplicate-clear"}>{review.candidates.length ? <CircleAlert size={21}/> : <CheckCircle2 size={21}/>}<div><strong>{t(review.exactMatch ? "duplicateIdentifier" : review.candidates.length ? "possibleDuplicates" : "noDuplicateMatches")}</strong>{review.candidates.length > 0 && <p>{t("duplicateHelp")}</p>}</div></div>
      {review.candidates.length > 0 && <div className="duplicate-candidates">{review.candidates.map(patient => <article key={patient.id}><div><strong>{patientName(patient)}</strong><span>{patient.mrn} · {patient.phone} · {patient.identifierMasked}</span></div><button type="button" className="secondary-button" onClick={() => onOpenExisting(patient.id)}>{t("useExistingRecord")}</button></article>)}</div>}
      <section className="registration-summary"><p className="eyebrow">{t("registrationPreview")}</p><h3>{values.givenName} {values.familyName}</h3><dl><div><dt>{t("dobLabel")}</dt><dd>{payload().dob}{values.dobEstimated && ` (${t("estimated")})`}</dd></div><div><dt>{t("phoneLabel")}</dt><dd>{values.phone}</dd></div><div><dt>{t("identifierLabel")}</dt><dd>•••• {values.identifier.replace(/[\s-]/g, "").slice(-4)}</dd></div><div><dt>{t("cityColumn")}</dt><dd>{values.city || t("notProvided")}</dd></div></dl></section>
      {!review.exactMatch && review.candidates.length > 0 && <label className="form-field duplicate-reason"><span>{t("duplicateReason")} *</span><textarea name="duplicateReason" value={reason} minLength={8} maxLength={240} onChange={event => setReason(event.target.value)} placeholder={t("duplicateReasonPlaceholder")}/></label>}
      <p className="identifier-help"><ShieldCheck size={14}/>{t("identifierProtection")}</p><div className="registration-footer"><button type="button" className="secondary-button" disabled={busy} onClick={() => { setReview(null); setError(null); }}><ArrowLeft size={14}/>{t("backToDetails")}</button><button type="button" className="primary-button" disabled={busy || review.exactMatch || (review.candidates.length > 0 && reason.trim().length < 8)} onClick={save}>{t(busy ? "savingPatient" : "confirmRegistration")}<ArrowRight size={15}/></button></div>
    </div>}
  </dialog>;
}
