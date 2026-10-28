"use client";
import { useState } from "react";
import { ArrowRight, Clock3, MoreHorizontal, Siren } from "lucide-react";
import { api } from "@/lib/api-client";
import { STAGES, type Encounter, type PathwayStep, type Stage } from "@/lib/intake";
import type { MessageKey } from "@/lib/messages";
import { useLocale } from "../locale-provider";
import { useSession } from "../session-provider";
import { formatDate } from "../patients/patients-workspace";
import { ErrorNotice, intakeError, LiveStatus, RiskFlags, useLiveData } from "./shared";
import { WorkupDialog } from "./workup-dialog";
import { ReasonDialog } from "../reason-dialog";
import { AssignDoctor, useClinicDoctors } from "./assign-doctor";
import { ReceptionQueue, waited } from "./reception-queue";

// Emergencies are seen first and are overdue after ten minutes, whatever the clinic target.
const EMERGENCY_TARGET_MINUTES = 10;
const WORKUP_STAGES = ["waiting", "workup", "testing", "imaging", "dilation"] as const satisfies readonly Stage[];

export function QueueWorkspace(props: { workupOnly?: boolean; stageScope?: readonly Stage[] }) {
  // Reception sees a simple list; staff who record workups keep the stage board.
  const user = useSession();
  return !props.workupOnly && !props.stageScope && !user.permissions.includes("workup:read") ? <ReceptionQueue/> : <QueueBoard {...props}/>;
}
function QueueBoard({ workupOnly = false, stageScope }: { workupOnly?: boolean; stageScope?: readonly Stage[] }) {
  const { t } = useLocale();
  const user = useSession();
  const live = useLiveData<{ encounters: Encounter[]; serverNow: string }>("/api/intake/queue");
  const [clinic, setClinic] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, setPending] = useState<{ item: Encounter; action: string } | null>(null);
  const canAssign = user.permissions.includes("appointment:create") || user.permissions.includes("queue:manage");
  const clinicDoctors = useClinicDoctors(canAssign);
  const visibleStages: readonly Stage[] = stageScope ?? (workupOnly ? WORKUP_STAGES : STAGES);
  const encounters = live.data?.encounters.filter(value => (!clinic || value.facilityId === clinic) && (!specialty || value.specialty === specialty) && visibleStages.includes(value.stage)) ?? [];
  const serverNow = new Date(live.data?.serverNow ?? Date.now()).getTime();

  async function start(item: Encounter) {
    setBusy(item.id); setError(null);
    try {
      await api("/api/intake/transition", { encounterId: item.id, version: item.version, to: "workup" });
      live.refresh();
      if (user.permissions.includes("workup:read")) setSelected(item.id);
    } catch (value) {
      setError(intakeError(value)); live.refresh();
    } finally { setBusy(null); }
  }

  async function manage(item: Encounter, action: string, reason: string) {
    setBusy(item.id);
    try { await api("/api/intake/queue-action", { id: item.id, version: item.version, action, reason }); live.refresh(); }
    catch (value) { setError(intakeError(value)); }
    finally { setBusy(null); setPending(null); }
  }

  const stageCount = (stage: Stage) => encounters.filter(value => value.stage === stage).length;
  // Empty stages shrink to a narrow column so the busy ones get the room.
  const columns = visibleStages.map(stage => stageCount(stage) ? "minmax(220px, 1fr)" : "minmax(118px, .4fr)").join(" ");
  const canManage = user.permissions.includes("queue:manage");

  return <div className="intake-workspace queue-board-page">
    <div className="queue-toolbar"><div><label><span className="sr-only">{t("clinicLabel")}</span><select value={clinic} onChange={event => setClinic(event.target.value)}><option value="">{t("allClinics")}</option>{Array.from(new Map(live.data?.encounters.map(value => [value.facilityId, value.clinic])).entries()).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label><span className="sr-only">{t("specialtyLabel")}</span><select value={specialty} onChange={event => setSpecialty(event.target.value)}><option value="">{t("allSpecialties")}</option>{Array.from(new Set(live.data?.encounters.map(value => value.specialty))).sort().map(value => <option key={value}>{value}</option>)}</select></label></div><LiveStatus {...live}/></div>
    <ErrorNotice error={error}/>
    <div className={`queue-board ${workupOnly ? "workup-board" : ""}`} style={{ "--queue-columns": columns } as React.CSSProperties}>{visibleStages.map(stage => <section className={`queue-column stage-${stage} ${stageCount(stage) ? "" : "is-empty"}`} key={stage}><header><span/><h2>{t(`stage_${stage}`)}</h2><strong>{stageCount(stage)}</strong></header><div>{encounters.filter(value => value.stage === stage).map(item => {
      const elapsed = Math.max(0, Math.floor((serverNow - new Date(item.stageAt).getTime()) / 60000));
      const emergency = item.visitType === "emergency";
      const overdue = elapsed >= (emergency ? EMERGENCY_TARGET_MINUTES : item.pathwayTargetMinutes);
      const pathwayIndex = item.pathwaySteps.indexOf(item.stage as PathwayStep);
      const progress = pathwayIndex >= 0 ? pathwayIndex + 1 : item.stage === "waiting" ? 0 : item.pathwaySteps.length + 1, total = item.pathwaySteps.length + 1;
      const workupStatus: MessageKey = item.workupVersion ? item.workupReviewStatus === "approved" ? "workupApprovedLabel" : item.workupReviewStatus === "returned" ? "workupReturnedLabel" : "workupAwaitingReview" : "workupPending";
      return <article className={`queue-card ${overdue ? "is-overdue" : ""} ${emergency ? "is-emergency" : ""}`} key={item.id} data-testid={`queue-${item.id}`} title={`${t("arrivalLabel")} ${formatDate(item.checkedInAt, true)}`}>
        <header className="qc-head"><div><h3>{item.name}</h3><small>{item.mrn}</small></div>{canManage && <details className="rq-more"><summary aria-label={t("moreActions")}><MoreHorizontal size={18}/></summary><div><button type="button" disabled={!!busy} onClick={() => setPending({ item, action: item.priority === "urgent" ? "routine" : "urgent" })}>{t(item.priority === "urgent" ? "setRoutine" : "markUrgent")}</button>{stage !== "consultation" && <button type="button" disabled={!!busy} onClick={() => setPending({ item, action: "left_before_seen" })}>{t("leftBeforeSeen")}</button>}</div></details>}</header>
        {emergency ? <p className="qc-tags"><strong className="emergency-tag"><Siren size={13}/>{t("emergencyTag")}</strong>{item.emergencyReason && <small className="rq-reason">{t(`emergency_${item.emergencyReason}` as MessageKey)}</small>}</p> : item.priority === "urgent" && <p className="qc-tags"><span className="rq-urgent">{t("urgentLabel")}</span></p>}
        {item.flags.length > 0 && <RiskFlags flags={item.flags}/>}
        <p className="qc-meta">{item.clinic} · {canAssign && (stage !== "consultation" || !item.doctorId) ? <AssignDoctor item={item} doctors={clinicDoctors.get(item.facilityId) ?? []} onDone={live.refresh} onError={setError}/> : item.doctor ?? <span className="doctor-unassigned">{t("doctorNotAssigned")}</span>}</p>
        <div className="qc-progress" role="img" aria-label={`${t("pathwayProgress")} ${progress}/${total}`}>{Array.from({ length: total }, (_, index) => <span key={index} className={index < progress ? "is-done" : ""}/>)}</div>
        <div className="qc-status"><span className={`qc-time ${overdue ? "is-overdue" : ""}`}><Clock3 size={13}/><span dir="ltr">{waited(elapsed)}</span>{overdue && <small>{t("overdue")}</small>}</span>{stage !== "waiting" && <span className={`qc-workup qc-${item.workupReviewStatus ?? (item.workupVersion ? "pending" : "none")}`}>{t(workupStatus)}</span>}</div>
        {stage === "dilation" && item.dilationReadyAt && <p className="dilation-countdown">{new Date(item.dilationReadyAt) > new Date(live.data!.serverNow) ? `${Math.ceil((new Date(item.dilationReadyAt).getTime() - new Date(live.data!.serverNow).getTime()) / 60000)} ${t("dilationRemaining")}` : t("dilationElapsed")}</p>}
        <div className="queue-card-actions">{stage === "waiting" && user.permissions.includes("queue:workup") && <button type="button" className="primary-button" disabled={!!busy || !!live.error} onClick={() => start(item)}>{t("startWorkup")}<ArrowRight size={13}/></button>}{user.permissions.includes("workup:read") && (stage !== "waiting" || item.workupVersion > 0) && <button type="button" className={stage === "workup" && user.permissions.includes("workup:write") ? "primary-button" : "secondary-button"} onClick={() => setSelected(item.id)}>{t(user.permissions.includes("workup:write") && stage === "workup" ? "openWorkup" : stage === "testing" || stage === "imaging" || stage === "dilation" ? "openCheckpoint" : "viewWorkup")}</button>}</div>
      </article>;
    })}{!stageCount(stage) && <p className="queue-empty">{t("emptyQueueShort")}</p>}</div></section>)}</div>
    {pending && <ReasonDialog title="queueChangeReason" busy={busy === pending.item.id} onClose={() => setPending(null)} onConfirm={reason => void manage(pending.item, pending.action, reason)}/>}
    {selected && <WorkupDialog id={selected} onClose={() => { setSelected(null); live.refresh(); }} onSaved={live.refresh}/>}
  </div>;
}
