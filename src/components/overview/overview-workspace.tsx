"use client";
import { useEffect, useState } from "react";
import { Activity, ArrowRight, CalendarDays, ClipboardList, Clock3, FileCheck2, LayoutDashboard, RefreshCw, ShieldCheck, Stethoscope, Users } from "lucide-react";
import { api } from "@/lib/api-client";
import type { OverviewData } from "@/server/overview-service";
import type { MessageKey } from "@/lib/messages";
import { useLocale } from "../locale-provider";
import { useSession } from "../session-provider";

type Page = "appointments" | "queue" | "workup" | "clinical" | "prescriptions" | "administration" | "audit" | "patients";

/**
 * One landing page for every active role.
 *
 * The server sends only the slices a role may see, so the layout is composed
 * from whatever arrives rather than switched on role name. A role gains a
 * section the moment it gains the underlying permission — no change here.
 */
export function OverviewWorkspace({ navigate }: { navigate: (page: Page) => void }) {
  const { t, locale } = useLocale();
  const user = useSession();
  const [data, setData] = useState<OverviewData | null>(null);
  const [failed, setFailed] = useState(false);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    api<OverviewData>("/api/overview", undefined, { signal: controller.signal })
      .then(setData)
      .catch(error => { if (!controller.signal.aborted) setFailed(true); void error; });
    return () => controller.abort();
  }, [generation]);

  if (failed) return <section className="panel ov-state" role="alert">
    <p>{t("ovUnavailable")}</p>
    <button type="button" className="secondary-button" onClick={() => setGeneration(v => v + 1)}><RefreshCw size={15}/>{t("refresh")}</button>
  </section>;
  if (!data) return <section className="panel ov-state"><p role="status">{t("ovLoading")}</p></section>;

  // Karachi hour decides the greeting; the server clock is authoritative.
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", hour12: false }).format(new Date(data.now)));
  const greeting: MessageKey = hour < 12 ? "ovGreetingMorning" : hour < 17 ? "ovGreetingAfternoon" : "ovGreetingEvening";
  const clock = new Intl.DateTimeFormat(locale === "ur" ? "ur-PK" : "en-GB", { timeZone: "Asia/Karachi", weekday: "long", day: "numeric", month: "long" }).format(new Date(data.now));

  // Candidate KPIs; ranked below, then trimmed to four.
  const candidates = ([
    data.clinical && { key: "ovKpiMine", value: data.clinical.mine, page: "clinical", icon: Stethoscope, urgent: false },
    data.clinical && { key: "ovKpiDrafts", value: data.clinical.drafts, page: "clinical", icon: ClipboardList, urgent: data.clinical.drafts > 0 },
    data.intake && { key: "ovKpiWaiting", value: data.intake.waiting, page: "queue", icon: Clock3, urgent: false },
    data.intake && { key: "ovKpiConsultation", value: data.intake.consultation, page: "queue", icon: Activity, urgent: false },
    data.intake && { key: "ovKpiAppointments", value: data.intake.appointments, page: "appointments", icon: CalendarDays, urgent: false },
    data.prescriptions && { key: "ovKpiSignedRx", value: data.prescriptions.signed, page: "prescriptions", icon: FileCheck2, urgent: false },
    data.governance && { key: "ovKpiStaff", value: data.governance.activeStaff, page: "administration", icon: Users, urgent: false },
    data.governance?.auditToday !== null && data.governance && { key: "ovKpiAuditToday", value: data.governance.auditToday, page: "audit", icon: ShieldCheck, urgent: false },
  ] as const).filter(Boolean) as { key: MessageKey; value: number | string | null; page: Page; icon: typeof Users; urgent: boolean }[];

  // The one thing this role most likely came here to do.
  const primary: { label: MessageKey; page: Page } | null =
    user.permissions.includes("clinical:write") ? { label: "ovActionClinical", page: "clinical" }
    : user.permissions.includes("workup:read") ? { label: "ovActionQueue", page: "queue" }
    : user.permissions.includes("settings:write") || user.permissions.includes("account:manage") ? { label: "ovActionAdministration", page: "administration" }
    : user.permissions.includes("appointment:create") ? { label: "ovActionAppointments", page: "appointments" }
    : user.permissions.includes("audit:read") ? { label: "ovActionAudit", page: "audit" }
    : user.permissions.includes("patient:read") ? { label: "ovActionPatients", page: "patients" }
    : null;

  // Put the KPIs that lead to this role's primary workspace first, so an
  // auditor opens on governance figures without
  // hard-coding either role. Stable sort keeps the curated order within a tier.
  const kpis = candidates
    .map((kpi, index) => ({ kpi, rank: (kpi.page === primary?.page ? 0 : 1) * 100 + index }))
    .sort((a, b) => a.rank - b.rank)
    .map(entry => entry.kpi)
    .slice(0, 4);

  const sections = [
    data.intake && { key: "clinic" as const, title: "ovSecClinic" as MessageKey, note: "ovSecClinicNote" as MessageKey, icon: Users, page: "queue" as Page, rows: [
      { label: "ovRowWaiting" as MessageKey, value: data.intake.waiting },
      { label: "ovRowWorkup" as MessageKey, value: data.intake.workup },
      { label: "ovRowDilation" as MessageKey, value: data.intake.dilation },
      { label: "ovRowConsultation" as MessageKey, value: data.intake.consultation },
    ] },
    data.clinical && { key: "clinical" as const, title: "ovSecClinical" as MessageKey, note: "ovSecClinicalNote" as MessageKey, icon: Stethoscope, page: "clinical" as Page, rows: [
      { label: "ovRowOpenEncounters" as MessageKey, value: data.clinical.open },
      { label: "ovKpiMine" as MessageKey, value: data.clinical.mine },
      { label: "ovKpiDrafts" as MessageKey, value: data.clinical.drafts },
      { label: "ovKpiSignedToday" as MessageKey, value: data.clinical.signedToday },
    ] },
    data.governance && { key: "governance" as const, title: "ovSecGovernance" as MessageKey, note: "ovSecGovernanceNote" as MessageKey, icon: ShieldCheck, page: (user.permissions.includes("settings:write") || user.permissions.includes("account:manage") ? "administration" : "audit") as Page, rows: [
      { label: "ovKpiStaff" as MessageKey, value: data.governance.activeStaff },
      { label: "ovRowFacilities" as MessageKey, value: data.governance.facilities },
      ...(data.governance.auditToday !== null ? [{ label: "ovKpiAuditToday" as MessageKey, value: data.governance.auditToday }] : []),
    ] },
  ].filter(Boolean) as { key: string; title: MessageKey; note: MessageKey; icon: typeof Users; page: Page; rows: { label: MessageKey; value: number | string }[] }[];

  return <div className="ov">
    <header className="ov-masthead">
      <div className="ov-masthead-copy">
        <p className="ov-datetime"><span className="ov-pulse" aria-hidden="true"/>{t("ovLive")} · {clock}</p>
        <h2>{t(greeting)}, {user.name}.</h2>
        <p className="ov-identity">
          {user.roles.map(role => <span className="ov-role" key={role}>{t(`role_${role}`)}</span>)}
          <span className="ov-facilities">{user.facilityIds.length} {t("ovAtFacility")}</span>
        </p>
      </div>
      {primary && <button type="button" className="ov-primary" onClick={() => navigate(primary.page)}>{t(primary.label)}<ArrowRight size={17}/></button>}
    </header>

    {kpis.length > 0 && <div className="ov-kpis">
      {kpis.map(kpi => <button type="button" key={kpi.key} className={`ov-kpi ${kpi.urgent ? "is-urgent" : ""}`} onClick={() => navigate(kpi.page)}>
        <span className="ov-kpi-icon"><kpi.icon size={17} strokeWidth={1.75}/></span>
        <strong>{kpi.value ?? "—"}</strong>
        <span className="ov-kpi-label">{t(kpi.key)}</span>
        <ArrowRight className="ov-kpi-go" size={15}/>
      </button>)}
    </div>}

    {sections.length > 0 ? <div className="ov-grid">
      {sections.map(section => <section className="panel ov-card" key={section.key}>
        <div className="ov-card-head">
          <span className="ov-card-icon"><section.icon size={18} strokeWidth={1.7}/></span>
          <div><h3>{t(section.title)}</h3><p>{t(section.note)}</p></div>
        </div>
        <dl className="ov-rows">
          {section.rows.map(row => <div key={row.label}><dt>{t(row.label)}</dt><dd>{row.value}</dd></div>)}
        </dl>
        <button type="button" className="ov-card-action" onClick={() => navigate(section.page)}>{t("ovOpen")}<ArrowRight size={14}/></button>
      </section>)}
    </div> : <section className="panel ov-state">
      <span className="ov-card-icon"><LayoutDashboard size={19}/></span>
      <div><strong>{t("ovNothing")}</strong><p>{t("ovNothingDetail")}</p></div>
    </section>}

    <p className="ov-boundary">{t("ovBoundary")}</p>
  </div>;
}
