"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronRight, CircleAlert, LockKeyhole, Plus, Search, ShieldCheck, Users, X } from "lucide-react";
import { useLocale } from "../locale-provider";
import { useSession } from "../session-provider";
import { api } from "@/lib/api-client";
import { ageFromDob, patientName, type PatientDetail, type PatientList, type PatientSummary } from "@/lib/patients";
import type { MessageKey } from "@/lib/messages";
import { PatientHistory } from "./patient-history";
import { PatientEdit } from "./patient-edit";
import { PatientRegistration, errorKey } from "./patient-registration";

export function formatDate(value: string, includeTime = false): string {
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Karachi", day: "2-digit", month: "short", year: "numeric", ...(includeTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } as const : {}) }).formatToParts(date);
  const part = (type: string) => parts.find(value => value.type === type)!.value;
  return `${part("day")}-${part("month")}-${part("year")}${includeTime ? ` ${part("hour")}:${part("minute")}` : ""}`;
}
export function PatientsWorkspace({ onBook, onHistory }: { onBook?: (patient: PatientSummary) => void; onHistory?: (id: string) => void }) {
  const { t } = useLocale(); const user = useSession(); const canCreate = user.permissions.includes("patient:create");
  const [query, setQuery] = useState(""); const [submitted, setSubmitted] = useState(""); const [page, setPage] = useState(1); const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<PatientList | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<MessageKey | null>(null);
  const [registering, setRegistering] = useState(false); const [selectedId, setSelectedId] = useState<string | null>(null); const [created, setCreated] = useState<PatientSummary | null>(null);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(null);
    api<PatientList>("/api/patients/search", { query: submitted, page }, { signal: controller.signal }).then(setData).catch(error => { if (!controller.signal.aborted) setError(errorKey(error)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [submitted, page, refresh]);
  function onCreated(patient: PatientSummary) { setRegistering(false); setCreated(patient); setSubmitted(""); setQuery(""); setPage(1); setRefresh(current => current + 1); setSelectedId(patient.id); }
  return <div className="patients-workspace">
    {created && <div className="registration-success" role="status"><CheckCircle2 size={18}/><span>{t("patientRegistered")} <strong>{patientName(created)} · {created.mrn}</strong></span><button type="button" className="icon-button" aria-label={t("clearSelection")} onClick={() => setCreated(null)}><X size={16}/></button></div>}
    <section className="panel patient-registry"><div className="registry-heading"><div><span className="section-icon"><Users size={20}/></span><h2>{t("registeredPatients")}</h2>{data && <span className="count-badge" data-testid="patient-total">{data.total}</span>}</div>{canCreate ? <button type="button" className="primary-button" onClick={() => setRegistering(true)}><Plus size={16}/>{t("registerPatient")}</button> : <span className="read-only-label"><LockKeyhole size={13}/>{t("accessControlled")}</span>}</div>
      <form className="patient-search" onSubmit={event => { event.preventDefault(); setPage(1); setSubmitted(query.trim()); setRefresh(current => current + 1); }}><div><Search size={18}/><input aria-label={t("searchPatients")} value={query} maxLength={100} onChange={event => setQuery(event.target.value)} placeholder={t("patientSearchPlaceholder")}/>{query && <button type="button" aria-label={t("clearSearch")} onClick={() => { setQuery(""); setSubmitted(""); setPage(1); }}><X size={15}/></button>}</div><button className="secondary-button" type="submit">{t("search")}</button></form>
      {!canCreate && <p className="registry-info">{t("readOnlyPatients")}</p>}
      {error ? <div className="data-error" role="alert"><CircleAlert size={23}/><p>{t(error)}</p><button type="button" className="secondary-button" onClick={() => setRefresh(current => current + 1)}>{t("retry")}</button></div> : loading ? <div className="registry-loading" role="status"><span className="loading-orbit"/>{t("loadingPatients")}</div> : data?.patients.length ? <div className="patient-table-wrap"><table className="patient-table"><thead><tr>{(["patientColumn", "ageSex", "contactColumn", "cityColumn", "flagsColumn", "recordColumn"] as MessageKey[]).map(key => <th key={key}>{t(key)}</th>)}</tr></thead><tbody>{data.patients.map(patient => <tr key={patient.id}><td><button type="button" className="patient-name-button" onClick={() => setSelectedId(patient.id)}><span className={`patient-avatar avatar-${patient.gender}`}>{patient.givenName[0]}{patient.familyName[0]}</span><span><strong>{patientName(patient)}</strong><small>{patient.mrn}</small></span></button></td><td><span>{ageFromDob(patient.dob)} {t("years")}</span><small>{t(`gender_${patient.gender}` as MessageKey)}{patient.dobEstimated && ` · ${t("estimated")}`}</small></td><td><span dir="ltr">{patient.phone}</span><small dir="ltr">{patient.identifierMasked}</small></td><td>{patient.city || "—"}</td><td><div className="patient-flags">{patient.flags.length ? patient.flags.map((flag, index) => <span key={index} className={`flag-tag flag-${flag.type}`} title={flag.value}><CircleAlert size={11}/>{t(flag.type === "allergy" ? "allergyLabel" : "riskLabel")}</span>) : <span className="no-flags">—</span>}</div></td><td><button type="button" className="view-record-button" aria-label={`${t("viewRecord")} ${patientName(patient)}`} onClick={() => setSelectedId(patient.id)}>{t("viewRecord")}<ChevronRight size={13}/></button></td></tr>)}</tbody></table></div> : <div className="registry-empty"><Search size={30}/><h3>{t("noPatientsTitle")}</h3><p>{t("noPatientsDetail")}</p></div>}
      {data && !loading && !error && <div className="registry-pagination"><span>{data.total} {t("resultsLabel")}</span><div><button type="button" aria-label={t("previousPage")} disabled={page <= 1} onClick={() => setPage(current => current - 1)}><ArrowLeft size={15}/></button><span>{t("pageLabel")} {page} {t("ofLabel")} {Math.max(1, Math.ceil(data.total / data.pageSize))}</span><button type="button" aria-label={t("nextPage")} disabled={page * data.pageSize >= data.total} onClick={() => setPage(current => current + 1)}><ArrowRight size={15}/></button></div></div>}
    </section><p className="registry-footnote"><ShieldCheck size={14}/>{t("identifierProtection")}</p>
    {registering && <PatientRegistration onClose={() => setRegistering(false)} onCreated={onCreated} onOpenExisting={id => { setRegistering(false); setSelectedId(id); }}/>} {selectedId && <PatientRecord onHistory={onHistory ? id => { setSelectedId(null); onHistory(id); } : undefined} id={selectedId} onClose={() => setSelectedId(null)} onBook={user.permissions.includes("appointment:create") ? onBook : undefined}/>}
  </div>;
}

function PatientRecord({ id, onClose, onBook, onHistory }: { id: string; onClose: () => void; onBook?: (patient: PatientSummary) => void; onHistory?: (id: string) => void }) {
  const user=useSession(); const [editing,setEditing]=useState(false); const [revision,setRevision]=useState(0);
  const { t } = useLocale(); const dialog = useRef<HTMLDialogElement>(null); const [patient, setPatient] = useState<PatientDetail | null>(null); const [error, setError] = useState<MessageKey | null>(null);
  useEffect(() => {
    dialog.current?.showModal(); const controller = new AbortController();
    api<{ patient: PatientDetail }>(`/api/patients/${id}`, undefined, { signal: controller.signal }).then(result => setPatient(result.patient)).catch(error => { if (!controller.signal.aborted) setError(errorKey(error)); });
    return () => controller.abort();
  }, [id,revision]);
  const detail = (label: MessageKey, value: string) => <div><dt>{t(label)}</dt><dd>{value || t("notProvided")}</dd></div>;
  return <dialog className="patient-record-dialog" ref={dialog} aria-labelledby="patient-record-title" onCancel={onClose}><div className="patient-record-header"><div><p className="eyebrow">{t("patientRecord")}</p><h2 id="patient-record-title">{patient ? patientName(patient) : t("loadingPatients")}</h2>{patient && <p>{patient.mrn} · {ageFromDob(patient.dob)} {t("years")} · {t(`gender_${patient.gender}` as MessageKey)}</p>}</div><button type="button" className="icon-button" aria-label={t("closeRecord")} onClick={onClose}><X size={20}/></button></div>
    {error && <div className="form-error" role="alert">{t(error)}</div>}{patient && <><div className="record-status"><CheckCircle2 size={14}/>{t("registrySaved")}</div>{patient.flags.length > 0 && <div className="record-risk-banner">{patient.flags.map((flag, index) => <p key={index}><CircleAlert size={16}/><strong>{t(flag.type === "allergy" ? "allergyLabel" : "riskLabel")}:</strong> {flag.value}</p>)}</div>}
      <section className="record-section"><h3>{t("demographics")}</h3><dl>{detail("mrnLabel", patient.mrn)}{detail("dobLabel", `${formatDate(patient.dob)}${patient.dobEstimated ? ` (${t("estimated")})` : ""}`)}{detail("identifierTypeLabel", t(patient.identifierType === "cnic" ? "cnicLabel" : patient.identifierType === "passport" ? "passportLabel" : "guardianCnicLabel"))}{detail("identifierLabel", patient.identifierMasked)}{detail("preferredLanguage", t(patient.preferredLanguage === "ur" ? "urdu" : "english"))}{detail("registeredOn", formatDate(patient.createdAt))}</dl></section>
      <section className="record-section"><h3>{t("contactDetails")}</h3><dl>{detail("phoneLabel", patient.phone)}{detail("cityColumn", patient.city)}{detail("addressLabel", patient.address)}{detail("nextOfKinLabel", patient.nextOfKinName)}{detail("nextOfKinPhone", patient.nextOfKinPhone)}</dl></section>
      {user.permissions.includes("clinical:read") && <PatientHistory patientId={patient.id} onChanged={()=>setRevision(v=>v+1)}/>}
      {user.permissions.includes("reports:read") && <div className="patient-book-action"><a className="secondary-button" href={`/patients/${patient.id}/summary`} target="_blank" rel="noreferrer">Print patient summary</a></div>}{user.permissions.includes("patient:edit") && <div className="patient-book-action"><button className="secondary-button" onClick={()=>setEditing(!editing)}>Edit patient</button></div>}{editing && <PatientEdit patient={patient} onCancel={()=>setEditing(false)} onSaved={()=>{setEditing(false);setRevision(v=>v+1);}}/>}
      {onBook && <div className="patient-book-action"><button type="button" className="primary-button" onClick={() => { dialog.current?.close(); onBook(patient); }}>{t("bookAppointment")}</button></div>}{onHistory ? <div className="patient-book-action"><button type="button" className="secondary-button" onClick={() => onHistory(patient.id)}>{t("patient360")}</button></div> : <p className="record-clinical-note"><LockKeyhole size={16}/>{t("noClinicalHistory")}</p>}</>}
  </dialog>;
}
