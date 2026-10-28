"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown, Eye as EyeIcon, FileText, FlaskConical, Globe2, KeyRound, LayoutDashboard, ListOrdered, LogOut, Menu, PanelLeftClose, PanelLeftOpen, ScanEye, ScanLine, ShieldCheck, Stethoscope, Users } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import type { MessageKey } from "@/lib/messages";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session-provider";
import { PatientsWorkspace } from "@/components/patients/patients-workspace";
import { AuditWorkspace } from "@/components/audit-workspace";
import { api } from "@/lib/api-client";
import { landingPage, visiblePages, type Page } from "@/lib/navigation";
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

const NAV: Record<Page, { key: MessageKey; icon: typeof EyeIcon }> = {
  overview: { key: "overview", icon: LayoutDashboard },
  clinical: { key: "doctorEvent", icon: Stethoscope },
  queue: { key: "queue", icon: ListOrdered },
  laboratory: { key: "laboratory", icon: FlaskConical },
  diagnostics: { key: "diagnostics", icon: ScanLine },
  patients: { key: "patients", icon: Users },
  appointments: { key: "appointments", icon: CalendarDays },
  prescriptions: { key: "prescriptions", icon: FileText },
  surgery: { key: "surgery", icon: ScanEye },
  management: { key: "management", icon: LayoutDashboard },
  administration: { key: "administration", icon: ShieldCheck },
  audit: { key: "auditLog", icon: ShieldCheck },
};
const initials = (name: string) => name.replace(/^Dr\.?\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join("").toUpperCase();

const SIDEBAR_KEY = "openeyes.sidebar";

export function ClinicalWorkspace() {
  const { locale, setLocale, t } = useLocale();
  const user = useSession();
  const router = useRouter();
  const pages = visiblePages(user);
  const canOpen = (next: Page) => pages.includes(next);
  const canReadClinical = user.permissions.includes("clinical:read");
  const [historyPatient, setHistoryPatient] = useState<string | null>(null);
  const [bookingPatient, setBookingPatient] = useState<PatientSummary | null>(null);
  const [page, setPage] = useState<Page>(() => landingPage(user));
  const [passwordOpen,setPasswordOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  // Desktop-only icon rail; remembered per browser. Storage can be unavailable (private windows).
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { try { setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "collapsed"); } catch { /* keep expanded */ } }, []);
  const toggleSidebar = () => setCollapsed(current => { try { localStorage.setItem(SIDEBAR_KEY, current ? "expanded" : "collapsed"); } catch { /* not remembered */ } return !current; });
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const navigated = useRef(false);
  // Links inside a page may point at work this role does not see; those do nothing.
  const navigate = (next: Page) => { if (!canOpen(next)) return; navigated.current = true; setPage(next); setMenuOpen(false); };
  useEffect(() => { if (navigated.current) pageHeading.current?.focus(); }, [page]);
  const roleLabel = user.roles.map(role => t(`role_${role}`)).join(" · ");
  async function signOut() {
    setSigningOut(true); setSignOutError(false);
    try { await api("/api/auth/logout", {}); router.replace("/login"); router.refresh(); }
    catch { setSignOutError(true); setSigningOut(false); }
  }

  return <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
    <a href="#main-content" className="skip-link">{t("skipContent")}</a>
    {menuOpen && <button type="button" className="sidebar-scrim" aria-label={t("closeMenu")} onClick={() => setMenuOpen(false)}/>}
    <aside className={`sidebar ${menuOpen ? "is-open" : ""}`}>
      <button className="brand" type="button" onClick={() => navigate("overview")} aria-label={`${t("appName")} ${t("overview")}`}>
        <span className="brand-mark"><EyeIcon size={24} strokeWidth={1.8}/></span><span><strong>{t("appName")}</strong><small>{user.tenantName}</small></span>
      </button>
      <button type="button" className="close-mobile" aria-label={t("closeMenu")} onClick={() => setMenuOpen(false)}><PanelLeftClose size={19}/></button>
      <nav aria-label={t("workspace")}>
        {pages.map(item => { const { key, icon: Icon } = NAV[item]; return <button
          key={item} type="button"
          className={`nav-item ${item === page ? "active" : ""}`}
          onClick={() => navigate(item)}
          aria-current={item === page ? "page" : undefined}
          title={collapsed ? t(key) : undefined}>
          <Icon size={19} strokeWidth={1.75}/><span>{t(key)}</span>
        </button>; })}
      </nav>
      <div className="sidebar-bottom">
        {user.isDemo && <span className="demo-badge"><span className="demo-dot"/>{t("prototype")}</span>}
        <small>{t("footer")}</small>
      </div>
    </aside>

    <div className="main-shell">
      <header className="topbar">
        <button type="button" className="icon-button mobile-menu" aria-label={t("menu")} aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={21}/></button>
        <button type="button" className="icon-button sidebar-toggle" aria-label={t(collapsed ? "expandMenu" : "collapseMenu")} aria-expanded={!collapsed} onClick={toggleSidebar}>{collapsed ? <PanelLeftOpen size={20}/> : <PanelLeftClose size={20}/>}</button>
        <h1 tabIndex={-1} ref={pageHeading}>{t(NAV[page].key)}</h1>
        <div className="topbar-actions">
          <button className="language-button" type="button" onClick={() => setLocale(locale === "en" ? "ur" : "en")} aria-label={t("language")}><Globe2 size={16}/><span>{locale === "en" ? t("urdu") : t("english")}</span></button>
          <div className="profile-menu" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setProfileOpen(false); }} onKeyDown={event => { if (event.key === "Escape") setProfileOpen(false); }}>
            <button type="button" className="profile-trigger" aria-haspopup="menu" aria-expanded={profileOpen} onClick={() => setProfileOpen(open => !open)}>
              <span className="profile-avatar" aria-hidden="true">{initials(user.name)}</span>
              <span className="profile-caption"><strong>{user.name}</strong><small>{roleLabel}</small></span>
              <ChevronDown size={16}/>
            </button>
            {profileOpen && <div className="profile-dropdown" role="menu">
              <button type="button" role="menuitem" onClick={() => { setPasswordOpen(true); setProfileOpen(false); }}><KeyRound size={16}/>Change password</button>
              <button type="button" role="menuitem" disabled={signingOut} onClick={signOut}><LogOut size={16}/>{t(signingOut ? "signingOut" : "signOut")}</button>
            </div>}
          </div>
        </div>
      </header>
      <main id="main-content" className="main-content">
        {locale === "ur" && <div className="locale-banner" role="status">{t("urduPreview")}</div>}
        {passwordOpen && <PasswordForm onClose={() => setPasswordOpen(false)}/>}
        {signOutError && <p className="form-error" role="alert">{t("serviceUnavailable")}</p>}

        {page === "surgery" ? <SurgeryWorkspace/> : page === "management" ? <ManagementWorkspace navigate={navigate} canOpen={canOpen}/> : page === "administration" ? <AdministrationWorkspace/> : page === "clinical" ? <DoctorWorkspace/> : page === "prescriptions" ? <PrescriptionInbox/> : page === "appointments" ? <AppointmentsWorkspace initialPatient={bookingPatient} onBooked={() => setBookingPatient(null)}/> : page === "laboratory" ? <QueueWorkspace stageScope={["testing"]}/> : page === "diagnostics" ? <QueueWorkspace stageScope={["imaging"]}/> : page === "queue" ? <QueueWorkspace/> : page === "patients" ? <PatientsWorkspace onHistory={canReadClinical ? setHistoryPatient : undefined} onBook={canOpen("appointments") ? patient => { setBookingPatient(patient); navigate("appointments"); } : undefined}/> : page === "audit" ? <AuditWorkspace /> : <OverviewWorkspace navigate={navigate} canOpen={canOpen}/>}
        {historyPatient && <PatientTimelineDialog patientId={historyPatient} onClose={() => setHistoryPatient(null)}/>}
        {(page === "overview" || page === "management") && <ReportLinks/>}
      </main>
    </div>
  </div>;
}
