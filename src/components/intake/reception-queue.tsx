"use client";
import { useState } from "react";
import { ArrowRight, Clock3, ListOrdered, MoreHorizontal, ScanEye, Siren } from "lucide-react";
import { api } from "@/lib/api-client";
import type { Encounter, Stage } from "@/lib/intake";
import type { MessageKey } from "@/lib/messages";
import { useLocale } from "../locale-provider";
import { useSession } from "../session-provider";
import { ReasonDialog } from "../reason-dialog";
import { AssignDoctor, useClinicDoctors } from "./assign-doctor";
import { LabChips } from "../lab/lab-chips";
import { ReferralReports } from "../machines/referral-reports";
import { MachineChips } from "../machines/machine-chips";
import { ErrorNotice, intakeError, LiveStatus, RiskFlags, useLiveData } from "./shared";

/**
 * The front desk's view of the queue: who is here, who they are waiting for,
 * where they are in the visit and how long they have waited. Clinical detail
 * (pathway steps, workup review) stays on the technicians' board.
 */
type Group = "all" | "waiting" | "technician" | "doctor" | "emergency";
const TECHNICIAN_STAGES: readonly Stage[] = ["workup", "testing", "imaging", "dilation"];
const EMERGENCY_TARGET_MINUTES = 10;
const isEmergency = (item: Encounter) => item.visitType === "emergency";
const group = (item: Encounter): Exclude<Group, "all" | "emergency"> => item.stage === "waiting" ? "waiting" : item.stage === "consultation" ? "doctor" : "technician";
const statusKey = (item: Encounter): MessageKey => item.stage === "waiting" ? "queueWaiting" : item.stage === "consultation" ? "queueReadyForDoctor" : "queueWithTechnician";

/** "45 m", "3 h 05 m", "4 d": readable at a glance, unlike a raw minute count. */
export function waited(minutes: number) {
  if (minutes < 60) return `${minutes} m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} m`;
  return `${Math.floor(minutes / 1440)} d`;
}

export function ReceptionQueue() {
  const { t } = useLocale(); const user = useSession();
  const live = useLiveData<{ encounters: Encounter[]; serverNow: string }>("/api/intake/queue");
  const [clinic, setClinic] = useState(""); const [filter, setFilter] = useState<Group>("all");
  const [busy, setBusy] = useState<string | null>(null); const [error, setError] = useState<MessageKey | null>(null);
  const [pending, setPending] = useState<{ item: Encounter; action: string } | null>(null);
  const canAssign = user.permissions.includes("appointment:create") || user.permissions.includes("queue:manage");
  const canManage = user.permissions.includes("queue:manage"), canStart = user.permissions.includes("queue:workup");
  const doctors = useClinicDoctors(canAssign);
  const now = new Date(live.data?.serverNow ?? Date.now()).getTime();
  const minutes = (since: string) => Math.max(0, Math.floor((now - new Date(since).getTime()) / 60000));
  const inClinic = (live.data?.encounters ?? []).filter(item => !clinic || item.facilityId === clinic);
  const counts: Record<Group, number> = { all: inClinic.length, waiting: 0, technician: 0, doctor: 0, emergency: 0 };
  for (const item of inClinic) { counts[group(item)]++; if (isEmergency(item)) counts.emergency++; }
  // Emergencies first, then urgent, then whoever has waited longest.
  const rows = inClinic.filter(item => filter === "all" || (filter === "emergency" ? isEmergency(item) : group(item) === filter))
    .sort((a, b) => Number(isEmergency(b)) - Number(isEmergency(a)) || Number(b.priority === "urgent") - Number(a.priority === "urgent") || a.checkedInAt.localeCompare(b.checkedInAt));

  async function start(item: Encounter) {
    setBusy(item.id); setError(null);
    try { await api("/api/intake/transition", { encounterId: item.id, version: item.version, to: "workup" }); live.refresh(); }
    catch (value) { setError(intakeError(value)); live.refresh(); }
    finally { setBusy(null); }
  }
  async function manage(item: Encounter, action: string, reason: string) {
    setBusy(item.id);
    try { await api("/api/intake/queue-action", { id: item.id, version: item.version, action, reason }); live.refresh(); }
    catch (value) { setError(intakeError(value)); }
    finally { setBusy(null); setPending(null); }
  }
  const tabs: [Group, MessageKey][] = [["all", "queueAll"], ["waiting", "queueWaiting"], ["technician", "queueWithTechnician"], ["doctor", "queueReadyForDoctor"], ["emergency", "queueEmergencies"]];

  return <div className="reception-queue">
    <div className="reception-queue-toolbar">
      <div className="queue-filters" role="tablist" aria-label={t("queueFilter")}>{tabs.filter(([key]) => key !== "emergency" || counts.emergency > 0).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={filter === key} className={`${filter === key ? "is-active" : ""} ${key === "emergency" ? "is-emergency" : ""}`} onClick={() => setFilter(key)}>{t(label)}<span>{counts[key]}</span></button>)}</div>
      <div className="reception-queue-tools"><label><span className="sr-only">{t("clinicLabel")}</span><select value={clinic} onChange={event => setClinic(event.target.value)}><option value="">{t("allClinics")}</option>{Array.from(new Map(live.data?.encounters.map(value => [value.facilityId, value.clinic])).entries()).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><LiveStatus {...live}/></div>
    </div>
    <ErrorNotice error={error}/>
    <section className="panel reception-queue-list" aria-label={t("queue")}>
      <div className="reception-queue-head" aria-hidden="true"><span>{t("patientColumn")}</span><span>{t("clinicLabel")}</span><span>{t("doctorLabel")}</span><span>{t("queueStatus")}</span><span>{t("queueWaited")}</span><span/></div>
      {rows.map(item => {
        const emergency = isEmergency(item), sinceCheckIn = minutes(item.checkedInAt);
        const overdue = minutes(item.stageAt) >= (emergency ? EMERGENCY_TARGET_MINUTES : item.pathwayTargetMinutes);
        return <article key={item.id} className={`reception-queue-row ${emergency ? "is-emergency" : ""}`} data-testid={`queue-${item.id}`}>
          <div className="rq-patient"><span className="patient-avatar">{item.name[0]}</span><div><strong>{item.name}</strong><small>{item.mrn}</small>{item.flags.length > 0 && <RiskFlags flags={item.flags}/>}<LabChips encounterId={item.id} labs={item.labs} onChanged={live.refresh} onError={setError} allowOrder={false}/><MachineChips orders={item.machines}/></div></div>
          <div className="rq-cell"><span className="rq-label">{t("clinicLabel")}</span>{item.clinic}</div>
          <div className="rq-cell"><span className="rq-label">{t("doctorLabel")}</span>{item.visitType === "test_only" ? <span>{t("referredBy")} {item.referralDoctor}</span> : canAssign && (item.stage !== "consultation" || !item.doctorId) ? <AssignDoctor item={item} doctors={doctors.get(item.facilityId) ?? []} onDone={live.refresh} onError={setError}/> : item.doctor ?? <span className="doctor-unassigned">{t("doctorNotAssigned")}</span>}</div>
          <div className="rq-cell rq-status">{emergency ? <><strong className="emergency-tag"><Siren size={13}/>{t("emergencyTag")}</strong>{item.emergencyReason && <small className="rq-reason">{t(`emergency_${item.emergencyReason}` as MessageKey)}</small>}</> : <><span className={`rq-pill rq-${group(item)}`}>{t(statusKey(item))}</span>{item.visitType === "test_only" && <span className="referral-tag"><ScanEye size={12}/>{t("referralTag")}</span>}</>}{item.priority === "urgent" && !emergency && <span className="rq-urgent">{t("urgentLabel")}</span>}</div>
          <div className={`rq-cell rq-waited ${overdue ? "is-overdue" : ""}`}><Clock3 size={14}/><span dir="ltr">{waited(sinceCheckIn)}</span>{overdue && <small>{t("overdue")}</small>}</div>
          <div className="rq-actions">{item.stage === "waiting" && !emergency && item.visitType !== "test_only" && canStart && <button type="button" className="secondary-button" disabled={!!busy || !!live.error} onClick={() => void start(item)}>{t("startWorkup")}<ArrowRight size={13}/></button>}
            {canManage && <details className="rq-more"><summary aria-label={t("moreActions")}><MoreHorizontal size={18}/></summary><div><button type="button" disabled={!!busy} onClick={() => setPending({ item, action: item.priority === "urgent" ? "routine" : "urgent" })}>{t(item.priority === "urgent" ? "setRoutine" : "markUrgent")}</button>{item.stage !== "consultation" && <button type="button" disabled={!!busy} onClick={() => setPending({ item, action: "left_before_seen" })}>{t("leftBeforeSeen")}</button>}</div></details>}</div>
        </article>;
      })}
      {live.data && !rows.length && <p className="reception-queue-empty"><ListOrdered size={18}/>{t(filter === "all" ? "queueEmptyAll" : "queueEmptyFilter")}</p>}
    </section>
    <ReferralReports/>
    {pending && <ReasonDialog title="queueChangeReason" busy={busy === pending.item.id} onClose={() => setPending(null)} onConfirm={reason => void manage(pending.item, pending.action, reason)}/>}
  </div>;
}
