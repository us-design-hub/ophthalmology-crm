"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Box, CalendarDays, Check, ChevronRight, CircleHelp, ClipboardList, Eye as EyeIcon, FileText, Globe2, Layers3, LayoutDashboard, ListOrdered, LockKeyhole, Menu, PanelLeftClose, Pill, Plus, ScanEye, ShieldCheck, Stethoscope, Trash2, Users, Wallet, X } from "lucide-react";
import { EyeViewer } from "@/components/anatomy/eye-viewer";
import { useLocale } from "@/components/locale-provider";
import { appendSelection, EYES, selectSite, SITE_COLORS, type AnatomySite, type Intent, type PlanRow, type Selection, type ViewMode } from "@/lib/anatomy";
import type { MessageKey } from "@/lib/messages";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session-provider";
import { PatientsWorkspace } from "@/components/patients/patients-workspace";
import { AuditWorkspace } from "@/components/audit-workspace";
import { api } from "@/lib/api-client";
import { AppointmentsWorkspace } from "./intake/appointments-workspace";
import { QueueWorkspace } from "./intake/queue-workspace";
import { OverviewWorkspace } from "./overview/overview-workspace";
import { ClinicalWorkspace as DoctorWorkspace, PatientTimelineDialog } from "./clinical/clinical-workspace";
import { PrescriptionInbox } from "./clinical/prescription-inbox";
import type { PatientSummary } from "@/lib/patients";

import { PharmacyWorkspace } from "./operations/inventory";
import { BillingWorkspace } from "./operations/billing";
import { SurgeryWorkspace } from "./operations/surgery";
import { ManagementWorkspace } from "./operations/management";
import { PasswordForm } from "./account-password";
import { ReportLinks } from "./operations/report-links";
import { AdministrationWorkspace } from "./operations/administration";

type Page = "workspace" | "overview" | "patients" | "audit" | "appointments" | "queue" | "workup" | "clinical" | "prescriptions" | "pharmacy" | "billing" | "surgery" | "management" | "administration";

export function ClinicalWorkspace() {
  const { locale, setLocale, t } = useLocale();
  const user = useSession();
  const router = useRouter();
  const canReadPatients = user.permissions.includes("patient:read");
  const canUseAnatomy = user.permissions.includes("anatomy:use");
  const canReadAudit = user.permissions.includes("audit:read");
  const canReadIntake = user.permissions.includes("intake:read");
  const [historyPatient, setHistoryPatient] = useState<string | null>(null);
  const canReadClinical = user.permissions.includes("clinical:read");
  const canReadRx = user.permissions.includes("prescription:read");
  const canPreview = (section: "inventory" | "billing" | "surgery" | "management" | "admin") => user.permissions.includes(`preview:${section}`);
  const [bookingPatient, setBookingPatient] = useState<PatientSummary | null>(null);
  const [page, setPage] = useState<Page>(user.permissions.includes("clinical:write") ? "clinical" : canUseAnatomy ? "workspace" : canReadPatients ? "patients" : canReadAudit ? "audit" : canPreview("inventory") ? "pharmacy" : "overview");
  const [passwordOpen,setPasswordOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selection, setSelection] = useState<Selection>({ OD: null, OS: null });
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [view, setView] = useState<ViewMode>("3d");
  const [cutaway, setCutaway] = useState(true);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const [announcement, setAnnouncement] = useState<MessageKey | null>(null);
  const clearDialog = useRef<HTMLDialogElement>(null);
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const navigated = useRef(false);
  const unavailable = useCallback(() => { setWebglUnavailable(true); setView("2d"); }, []);
  const navigate = (next: Page) => { navigated.current = true; setPage(next); setMenuOpen(false); };
  useEffect(() => { if (navigated.current) pageHeading.current?.focus(); }, [page]);
  useEffect(() => {
    if (!announcement) return;
    const timer = setTimeout(() => setAnnouncement(null), 4000);
    return () => clearTimeout(timer);
  }, [announcement]);
  useEffect(() => {
    if (rows.length === 0) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [rows.length]);
  const hasSelection = EYES.some(eye => selection[eye] !== null);
  const canAdd = EYES.some(eye => selection[eye] && !rows.some(row => row.eye === eye && row.anatomySite === selection[eye]));
  const addSelection = () => {
    setRows(current => appendSelection(current, selection, () => crypto.randomUUID()));
    setAnnouncement("rowAdded");
  };
  const updateRow = (id: string, patch: Partial<Pick<PlanRow, "intent" | "notes">>) => setRows(current => current.map(row => row.id === id ? { ...row, ...patch } : row));
  const titleKeys: [MessageKey, MessageKey, MessageKey] = page === "pharmacy" ? ["opsEyebrow", "opsPharmacyTitle", "opsPharmacySubtitle"] : page === "billing" ? ["opsEyebrow", "opsBillingTitle", "opsBillingSubtitle"] : page === "surgery" ? ["opsEyebrow", "opsSurgeryTitle", "opsSurgerySubtitle"] : page === "management" ? ["opsEyebrow", "opsManagementTitle", "opsManagementSubtitle"] : page === "administration" ? ["opsEyebrow", "opsAdminTitle", "opsAdminSubtitle"] : page === "clinical" ? ["clinicalEyebrow", "clinicalTitle", "clinicalSubtitle"] : page === "prescriptions" ? ["clinicalEyebrow", "rxInboxTitle", "rxInboxSubtitle"] : page === "appointments" ? ["intakeEyebrow", "appointmentsTitle", "appointmentsSubtitle"] : page === "queue" ? ["intakeEyebrow", "queueTitle", "queueSubtitle"] : page === "workup" ? ["intakeEyebrow", "workupTitle", "workupSubtitle"] : page === "patients" ? ["patientsEyebrow", "patientsTitle", "patientsSubtitle"] : page === "audit" ? ["auditEyebrow", "auditTitle", "auditSubtitle"] : page === "workspace" ? ["eyebrow", "title", "subtitle"] : page === "overview" ? ["overviewEyebrow", "overviewTitle", "overviewSubtitle"] : ["overviewEyebrow", "overviewTitle", "overviewSubtitle"];
  const pageLabel: MessageKey = page === "clinical" ? "doctorEvent" : page === "workspace" ? "anatomyPractice" : page === "audit" ? "auditLog" : page;
  async function signOut() {
    if (rows.length && !window.confirm(t("signOutPracticeWarning"))) return;
    setSigningOut(true); setSignOutError(false);
    try { await api("/api/auth/logout", {}); router.replace("/login"); router.refresh(); }
    catch { setSignOutError(true); setSigningOut(false); }
  }
  const navItem = (label: MessageKey, Icon: typeof EyeIcon, destination?: Page, extra?: string) => <button key={label} type="button" className={`nav-item ${destination === page ? "active" : ""}`} onClick={destination ? () => navigate(destination) : undefined} disabled={!destination} title={!destination ? t("upcoming") : undefined} aria-current={destination === page ? "page" : undefined}>
    <Icon size={18} strokeWidth={1.65}/><span>{t(label)}</span>{extra && <span className="nav-tag">{extra}</span>}{!destination && <LockKeyhole className="nav-lock" size={11}/>}
  </button>;

  return <div className="app-shell">
    <a href="#main-content" className="skip-link">{t("skipContent")}</a>
    {menuOpen && <button type="button" className="sidebar-scrim" aria-label={t("closeMenu")} onClick={() => setMenuOpen(false)}/>}
    <aside className={`sidebar ${menuOpen ? "is-open" : ""}`}>
      <button className="brand" type="button" onClick={() => navigate("overview")} aria-label={`${t("appName")} ${t("overview")}`}>
        <span className="brand-mark"><EyeIcon size={29} strokeWidth={1.6}/><span/></span><span><strong>{t("appName")}</strong><small>{t("brandCaption")}</small></span>
      </button>
      <button type="button" className="close-mobile" aria-label={t("closeMenu")} onClick={() => setMenuOpen(false)}><PanelLeftClose size={19}/></button>
      <div className="hospital-label"><span className="hospital-avatar">DE</span><span>{user.tenantName}<small>{t("prototype")}</small></span></div>
      <nav aria-label={t("workspace")}>
        <div className="nav-group"><p>{t("care")}</p>
          {navItem("overview", LayoutDashboard, "overview")}{navItem("patients", Users, canReadPatients ? "patients" : undefined)}{navItem("appointments", CalendarDays, canReadIntake ? "appointments" : undefined)}{navItem("queue", ListOrdered, canReadIntake ? "queue" : undefined)}{navItem("workup", Activity, user.permissions.includes("workup:read") ? "workup" : undefined)}{navItem("doctorEvent", Stethoscope, canReadClinical ? "clinical" : undefined)}{navItem("anatomyPractice", Box, canUseAnatomy ? "workspace" : undefined)}{navItem("prescriptions", FileText, canReadRx ? "prescriptions" : undefined)}
        </div>
        <div className="nav-group"><p>{t("operations")}</p>{navItem("pharmacy", Pill, canPreview("inventory") ? "pharmacy" : undefined)}{navItem("billing", Wallet, canPreview("billing") ? "billing" : undefined)}{navItem("surgery", ScanEye, canPreview("surgery") ? "surgery" : undefined)}</div>
        <div className="nav-group"><p>{t("platform")}</p>{navItem("management", LayoutDashboard, canPreview("management") ? "management" : undefined)}{navItem("auditLog", ShieldCheck, canReadAudit ? "audit" : undefined)}{navItem("administration", ShieldCheck, canPreview("admin") ? "administration" : undefined)}</div>
      </nav>
      <div className="sidebar-bottom"><span className="demo-dot"/><span><strong>{t("demoOnly")}</strong><small>{t("notClinical")}</small></span><CircleHelp size={16}/></div>
    </aside>

    <div className="main-shell">
      <header className="topbar">
        <button type="button" className="icon-button mobile-menu" aria-label={t("menu")} aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={21}/></button>
        <div className="breadcrumbs"><span>{t("careLabel")}</span><ChevronRight size={13}/><strong>{t(pageLabel)}</strong></div>
        <div className="topbar-actions"><span className="build-status"><span/>{t("prototype")}</span><button className="language-button" type="button" onClick={() => setLocale(locale === "en" ? "ur" : "en")} aria-label={t("language")}><Globe2 size={16}/><span>{locale === "en" ? t("urdu") : t("english")}</span></button><span className="header-divider"/><span className="profile-avatar"><Stethoscope size={18}/></span><div className="profile-caption"><strong>{user.name}</strong><small>{user.roles.map(role => t(`role_${role}`)).join(" · ")}</small></div><button type="button" className="sign-out-button" onClick={() => setPasswordOpen(!passwordOpen)}>Password</button><button type="button" className="sign-out-button" disabled={signingOut} onClick={signOut}>{t(signingOut ? "signingOut" : "signOut")}</button></div>
      </header>
      <main id="main-content" className="main-content">
        {locale === "ur" && <div className="locale-banner" role="status">{t("urduPreview")}</div>}
        {passwordOpen && <PasswordForm onClose={() => setPasswordOpen(false)}/>}
        {signOutError && <p className="form-error" role="alert">{t("serviceUnavailable")}</p>}
        <div className={`page-heading ${page === "overview" ? "is-visually-hidden" : ""}`}><div><p className="eyebrow">{t(titleKeys[0])}</p><h1 tabIndex={-1} ref={pageHeading}>{t(titleKeys[1])}</h1><p className="page-subtitle">{t(titleKeys[2])}</p></div></div>

        {page === "pharmacy" ? <PharmacyWorkspace/> : page === "billing" ? <BillingWorkspace/> : page === "surgery" ? <SurgeryWorkspace/> : page === "management" ? <ManagementWorkspace navigate={navigate}/> : page === "administration" ? <AdministrationWorkspace/> : page === "clinical" ? <DoctorWorkspace/> : page === "prescriptions" ? <PrescriptionInbox/> : page === "appointments" ? <AppointmentsWorkspace initialPatient={bookingPatient} onBooked={() => setBookingPatient(null)}/> : page === "queue" || page === "workup" ? <QueueWorkspace workupOnly={page === "workup"}/> : page === "patients" ? <PatientsWorkspace onHistory={canReadClinical ? setHistoryPatient : undefined} onBook={patient => { setBookingPatient(patient); navigate("appointments"); }}/> : page === "audit" ? <AuditWorkspace /> : page === "overview" ? <OverviewWorkspace navigate={navigate}/> : page === "workspace" ? <>
          <section className="encounter-context" aria-label={t("patientContext")}><span className="context-icon"><Users size={22}/></span><div><div className="context-title">{t("patientContext")}<span>{t("practiceBadge")}</span></div><p>{t("noPatient")}</p></div><span className="context-note">{t("sessionOnly")}</span></section>
          <div className="workflow-steps" aria-label={t("sequenceTitle")}>
            {(["patientStep", "findingsStep", "anatomyStep", "reviewStep"] as MessageKey[]).map((step, i) => <div key={step} className={i === 2 ? "workflow-step current" : "workflow-step"}><span>{String(i + 1).padStart(2, "0")}</span>{t(step)}{i !== 2 && <LockKeyhole size={11}/>}</div>)}
          </div>
          <div className="workspace-grid">
            <div className="clinical-main">
              <section className="anatomy-panel panel">
                <div className="panel-heading"><div><div className="section-title"><span className="section-icon"><ScanEye size={19}/></span><h2>{t("anatomyTitle")}</h2></div><p>{t("anatomyDescription")}</p></div><div className="view-switch" role="group" aria-label={t("anatomyTitle")}><button type="button" aria-pressed={view === "3d"} onClick={() => setView("3d")} disabled={webglUnavailable}><Box size={14}/>{t("threeD")}</button><button type="button" aria-pressed={view === "2d"} onClick={() => setView("2d")}><Layers3 size={14}/>{t("twoD")}</button></div></div>
                {webglUnavailable && <p className="fallback-notice" role="status">{t("autoFallback")}</p>}
                <div className="anatomy-toolbar"><label className={`switch-label ${view === "2d" ? "muted" : ""}`}><input type="checkbox" role="switch" checked={cutaway} disabled={view === "2d"} onChange={event => setCutaway(event.target.checked)}/><span className="switch-track"/>{t("cutaway")}</label><button type="button" className="text-button" disabled={!hasSelection} onClick={() => { setSelection({ OD: null, OS: null }); setAnnouncement("selectionCleared"); }}><X size={13}/>{t("clearSelection")}</button></div>
                <div className="bilateral-grid" dir="ltr">{EYES.map(eye => <EyeViewer key={eye} eye={eye} selected={selection[eye]} onSelect={(site: AnatomySite) => setSelection(current => selectSite(current, eye, site))} view={view} cutaway={cutaway} onUnavailable={unavailable}/>)}</div>
                <p className="anatomy-disclaimer"><CircleHelp size={13}/>{t("modelDisclaimer")}</p>
              </section>
              <section className="panel treatment-panel" aria-labelledby="plan-heading">
                <div className="panel-heading"><div><div className="section-title"><span className="section-icon"><ClipboardList size={18}/></span><h2 id="plan-heading">{t("planTitle")}</h2><span className="count-badge" data-testid="plan-count">{rows.length}</span></div><p>{t("planSubtitle")}</p></div><span className="session-badge">{t("unsaved")}</span></div>
                {rows.length === 0 ? <div className="plan-empty"><span><ClipboardList size={23} strokeWidth={1.3}/></span><div><strong>{t("planEmpty")}</strong><p>{t("planEmptyDetail")}</p></div></div> : <div className="plan-rows">{rows.map(row => <div className="plan-row" key={row.id} data-testid={`plan-${row.eye}-${row.anatomySite}`}>
                  <div className="plan-site"><span className={`plan-eye eye-${row.eye.toLowerCase()}`} dir="ltr">{row.eye}</span><div><small>{t("planSite")}</small><strong>{t(row.anatomySite)}</strong></div></div>
                  <label className="plan-intent"><span>{t("planIntent")}</span><select value={row.intent} onChange={event => updateRow(row.id, { intent: event.target.value as Intent })}>{(["observation", "medical", "laser", "surgical"] as const).map(intent => <option key={intent} value={intent}>{t(intent)}</option>)}</select></label>
                  <label className="plan-note"><span>{t("planNotes")}</span><input type="text" value={row.notes} maxLength={500} onChange={event => updateRow(row.id, { notes: event.target.value })} placeholder={t("notesPlaceholder")}/></label>
                  <button type="button" className="icon-button remove-row" aria-label={`${t("remove")} ${row.eye} ${t(row.anatomySite)}`} onClick={() => { setRows(current => current.filter(item => item.id !== row.id)); setAnnouncement("rowRemoved"); }}><Trash2 size={16}/></button>
                </div>)}</div>}
                {rows.length > 0 && <div className="plan-footer"><span>{rows.length} {t("planCount")}</span><button type="button" className="text-button" onClick={() => clearDialog.current?.showModal()}>{t("clearPlan")}</button></div>}
              </section>
            </div>
            <aside className="workspace-aside">
              <section className="selection-panel panel"><div className="selection-panel-heading"><span className="selection-heading-icon"><ScanEye size={20}/></span><h2>{t("selectionTitle")}</h2></div><p>{t("selectionHelp")}</p>
                {EYES.map(eye => <div key={eye} className={`selected-site-summary eye-${eye.toLowerCase()}`} data-testid={`summary-${eye}`}><div className="summary-eye"><span dir="ltr">{eye}</span>{t(eye === "OD" ? "rightEye" : "leftEye")}{selection[eye] && <Check size={14}/>}</div><strong>{selection[eye] ? t(selection[eye]!) : t("noneSelected")}</strong><p>{selection[eye] ? t(`${selection[eye]}_detail` as MessageKey) : t("chooseSite")}</p>{selection[eye] && <span className="site-color-line" style={{ background: SITE_COLORS[selection[eye]!] }}/>}</div>)}
                <button type="button" className="primary-button add-plan-button" data-testid="add-to-plan" onClick={addSelection} disabled={!canAdd}><Plus size={17}/>{t("addToPlan")}</button>
                {hasSelection && !canAdd && <p className="selection-feedback">{t("alreadyAdded")}</p>}
              </section>
              <section className="laterality-note"><ShieldCheck size={21}/><h3>{t("lateralityTitle")}</h3><p>{t("lateralityDetail")}</p></section>
              <section className="walkthrough-card"><p className="eyebrow">{t("walkthrough")}</p><ol>{(["walk1", "walk2", "walk3", "walk4"] as MessageKey[]).map(key => <li key={key}>{t(key)}</li>)}</ol></section>
            </aside>
          </div>
        </> : null}
        {historyPatient && <PatientTimelineDialog patientId={historyPatient} onClose={() => setHistoryPatient(null)}/>}
        <ReportLinks/><footer className="workspace-footer"><span><EyeIcon size={15}/>{t("footer")}</span></footer>
      </main>
    </div>
    <div className={`toast ${announcement ? "visible" : ""}`} role="status" aria-live="polite">{announcement && <><Check size={16}/>{t(announcement)}</>}</div>
    <dialog ref={clearDialog} className="confirm-dialog" aria-labelledby="clear-title"><h2 id="clear-title">{t("clearConfirm")}</h2><p>{t("planSubtitle")}</p><div><button type="button" className="secondary-button" onClick={() => clearDialog.current?.close()} autoFocus>{t("cancel")}</button><button type="button" className="primary-button" onClick={() => { setRows([]); clearDialog.current?.close(); setAnnouncement("planCleared"); }}>{t("confirmClear")}</button></div></dialog>
  </div>;
}
