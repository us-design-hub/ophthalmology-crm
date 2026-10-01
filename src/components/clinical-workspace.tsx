"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, CalendarDays, ChevronRight, CircleHelp, Eye as EyeIcon, FileText, Globe2, LayoutDashboard, ListOrdered, LockKeyhole, Menu, PanelLeftClose, ScanEye, ShieldCheck, Stethoscope, Users } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
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

import { SurgeryWorkspace } from "./operations/surgery";
import { ManagementWorkspace } from "./operations/management";
import { PasswordForm } from "./account-password";
import { ReportLinks } from "./operations/report-links";
import { AdministrationWorkspace } from "./operations/administration";

type Page = "overview" | "patients" | "audit" | "appointments" | "queue" | "workup" | "clinical" | "prescriptions" | "surgery" | "management" | "administration";

export function ClinicalWorkspace() {
  const { locale, setLocale, t } = useLocale();
  const user = useSession();
  const hospitalInitials = user.tenantName.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join("").toUpperCase();
  const router = useRouter();
  const canReadPatients = user.permissions.includes("patient:read");
  const canReadAudit = user.permissions.includes("audit:read");
  const canReadIntake = user.permissions.includes("intake:read");
  const [historyPatient, setHistoryPatient] = useState<string | null>(null);
  const canReadClinical = user.permissions.includes("clinical:read");
  const canReadRx = user.permissions.includes("prescription:read");
  const [bookingPatient, setBookingPatient] = useState<PatientSummary | null>(null);
  const [page, setPage] = useState<Page>(user.permissions.includes("clinical:write") ? "clinical" : canReadPatients ? "patients" : canReadAudit ? "audit" : "overview");
  const [passwordOpen,setPasswordOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const navigated = useRef(false);
  const navigate = (next: Page) => { navigated.current = true; setPage(next); setMenuOpen(false); };
  useEffect(() => { if (navigated.current) pageHeading.current?.focus(); }, [page]);
  const titleKeys: [MessageKey, MessageKey, MessageKey] = page === "surgery" ? ["opsEyebrow", "opsSurgeryTitle", "opsSurgerySubtitle"] : page === "management" ? ["opsEyebrow", "opsManagementTitle", "opsManagementSubtitle"] : page === "administration" ? ["opsEyebrow", "opsAdminTitle", "opsAdminSubtitle"] : page === "clinical" ? ["clinicalEyebrow", "clinicalTitle", "clinicalSubtitle"] : page === "prescriptions" ? ["clinicalEyebrow", "rxInboxTitle", "rxInboxSubtitle"] : page === "appointments" ? ["intakeEyebrow", "appointmentsTitle", "appointmentsSubtitle"] : page === "queue" ? ["intakeEyebrow", "queueTitle", "queueSubtitle"] : page === "workup" ? ["intakeEyebrow", "workupTitle", "workupSubtitle"] : page === "patients" ? ["patientsEyebrow", "patientsTitle", "patientsSubtitle"] : page === "audit" ? ["auditEyebrow", "auditTitle", "auditSubtitle"] : page === "overview" ? ["overviewEyebrow", "overviewTitle", "overviewSubtitle"] : ["overviewEyebrow", "overviewTitle", "overviewSubtitle"];
  const pageLabel: MessageKey = page === "clinical" ? "doctorEvent" : page === "audit" ? "auditLog" : page;
  async function signOut() {
    setSigningOut(true); setSignOutError(false);
    try { await api("/api/auth/logout", {}); router.replace("/login"); router.refresh(); }
    catch { setSignOutError(true); setSigningOut(false); }
  }
  // Declarative nav model: each entry carries the permission that unlocks it,
  // so a role's sidebar is derived rather than maintained per role. Items the
  // role cannot open are collected into a disclosure instead of sitting in the
  // list as padlocks — for most roles that was the majority of the sidebar.
  const navGroups: { label: MessageKey; items: { key: MessageKey; icon: typeof EyeIcon; page: Page; allowed: boolean }[] }[] = [
    { label: "care", items: [
      { key: "overview", icon: LayoutDashboard, page: "overview", allowed: true },
      { key: "patients", icon: Users, page: "patients", allowed: canReadPatients },
      { key: "appointments", icon: CalendarDays, page: "appointments", allowed: canReadIntake },
      { key: "queue", icon: ListOrdered, page: "queue", allowed: canReadIntake },
      { key: "workup", icon: Activity, page: "workup", allowed: user.permissions.includes("workup:read") },
      { key: "doctorEvent", icon: Stethoscope, page: "clinical", allowed: canReadClinical },
      { key: "prescriptions", icon: FileText, page: "prescriptions", allowed: canReadRx },
    ] },
    { label: "operations", items: [
      { key: "surgery", icon: ScanEye, page: "surgery", allowed: user.permissions.includes("surgery:read") },
    ] },
    { label: "platform", items: [
      { key: "management", icon: LayoutDashboard, page: "management", allowed: user.permissions.includes("management:read") },
      { key: "auditLog", icon: ShieldCheck, page: "audit", allowed: canReadAudit },
      { key: "administration", icon: ShieldCheck, page: "administration", allowed: user.permissions.includes("admin:read") },
    ] },
  ];
  const restricted = navGroups.flatMap(group => group.items.filter(item => !item.allowed));

  return <div className="app-shell">
    <a href="#main-content" className="skip-link">{t("skipContent")}</a>
    {menuOpen && <button type="button" className="sidebar-scrim" aria-label={t("closeMenu")} onClick={() => setMenuOpen(false)}/>}
    <aside className={`sidebar ${menuOpen ? "is-open" : ""}`}>
      <button className="brand" type="button" onClick={() => navigate("overview")} aria-label={`${t("appName")} ${t("overview")}`}>
        <span className="brand-mark"><EyeIcon size={29} strokeWidth={1.6}/><span/></span><span><strong>{t("appName")}</strong><small>{t("brandCaption")}</small></span>
      </button>
      <button type="button" className="close-mobile" aria-label={t("closeMenu")} onClick={() => setMenuOpen(false)}><PanelLeftClose size={19}/></button>
      <div className="hospital-label"><span className="hospital-avatar">{hospitalInitials}</span><span>{user.tenantName}{user.isDemo&&<small>{t("prototype")}</small>}</span></div>
      <nav aria-label={t("workspace")}>
        {navGroups.map(group => {
          const items = group.items.filter(item => item.allowed);
          if (!items.length) return null;
          return <div className="nav-group" key={group.label}>
            <p>{t(group.label)}</p>
            {items.map(item => <button
              key={item.key} type="button"
              className={`nav-item ${item.page === page ? "active" : ""}`}
              onClick={() => navigate(item.page)}
              aria-current={item.page === page ? "page" : undefined}>
              <item.icon size={18} strokeWidth={1.65}/><span>{t(item.key)}</span>
            </button>)}
          </div>;
        })}
        {restricted.length > 0 && <details className="nav-restricted">
          <summary><LockKeyhole size={12}/><span dir="auto">{restricted.length} {t(restricted.length === 1 ? "navRestrictedOne" : "navRestrictedLabel")}</span></summary>
          <p>{t("navRestrictedNote")}</p>
          <ul>{restricted.map(item => <li key={item.key}><item.icon size={14} strokeWidth={1.6}/>{t(item.key)}</li>)}</ul>
        </details>}
      </nav>
      <div className="sidebar-bottom">{user.isDemo&&<span className="demo-dot"/>}<span><strong>{user.isDemo?t("demoOnly"):t("notClinical")}</strong>{user.isDemo&&<small>{t("notClinical")}</small>}</span><CircleHelp size={16}/></div>
    </aside>

    <div className="main-shell">
      <header className="topbar">
        <button type="button" className="icon-button mobile-menu" aria-label={t("menu")} aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={21}/></button>
        <div className="breadcrumbs"><span>{t("careLabel")}</span><ChevronRight size={13}/><strong>{t(pageLabel)}</strong></div>
        <div className="topbar-actions">{user.isDemo&&<span className="build-status"><span/>{t("prototype")}</span>}<button className="language-button" type="button" onClick={() => setLocale(locale === "en" ? "ur" : "en")} aria-label={t("language")}><Globe2 size={16}/><span>{locale === "en" ? t("urdu") : t("english")}</span></button><span className="header-divider"/><span className="profile-avatar"><Stethoscope size={18}/></span><div className="profile-caption"><strong>{user.name}</strong><small>{user.roles.map(role => t(`role_${role}`)).join(" · ")}</small></div><button type="button" className="sign-out-button" onClick={() => setPasswordOpen(!passwordOpen)}>Password</button><button type="button" className="sign-out-button" disabled={signingOut} onClick={signOut}>{t(signingOut ? "signingOut" : "signOut")}</button></div>
      </header>
      <main id="main-content" className="main-content">
        {locale === "ur" && <div className="locale-banner" role="status">{t("urduPreview")}</div>}
        {passwordOpen && <PasswordForm onClose={() => setPasswordOpen(false)}/>}
        {signOutError && <p className="form-error" role="alert">{t("serviceUnavailable")}</p>}
        <div className={`page-heading ${page === "overview" ? "is-visually-hidden" : ""}`}><div><p className="eyebrow">{t(titleKeys[0])}</p><h1 tabIndex={-1} ref={pageHeading}>{t(titleKeys[1])}</h1><p className="page-subtitle">{t(titleKeys[2])}</p></div></div>

        {page === "surgery" ? <SurgeryWorkspace/> : page === "management" ? <ManagementWorkspace navigate={navigate}/> : page === "administration" ? <AdministrationWorkspace/> : page === "clinical" ? <DoctorWorkspace/> : page === "prescriptions" ? <PrescriptionInbox/> : page === "appointments" ? <AppointmentsWorkspace initialPatient={bookingPatient} onBooked={() => setBookingPatient(null)}/> : page === "queue" || page === "workup" ? <QueueWorkspace workupOnly={page === "workup"}/> : page === "patients" ? <PatientsWorkspace onHistory={canReadClinical ? setHistoryPatient : undefined} onBook={patient => { setBookingPatient(patient); navigate("appointments"); }}/> : page === "audit" ? <AuditWorkspace /> : page === "overview" ? <OverviewWorkspace navigate={navigate}/> : null}
        {historyPatient && <PatientTimelineDialog patientId={historyPatient} onClose={() => setHistoryPatient(null)}/>}
        <ReportLinks/><footer className="workspace-footer"><span><EyeIcon size={15}/>{t("footer")}</span></footer>
      </main>
    </div>
  </div>;
}
