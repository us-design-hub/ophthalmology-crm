"use client";

import { useState } from "react";
import { useSession } from "../session-provider";
import { useLocale } from "../locale-provider";
import { ActionForm, LiveHeading, useOperations, choice, type Facility, type Field } from "./live-shared";

const stages = ["planning", "consent", "preop", "scheduled", "operated", "discharged", "followup"];
const stageLabel = (stage: string) => stage === "estimate" ? "planning" : stage;
const eyes = [{ value: "OD", label: "OD - Right eye" }, { value: "OS", label: "OS - Left eye" }];
const yesNo = [{ value: "true", label: "Yes" }, { value: "false", label: "No" }];
const anaesthesia = [{ value: "topical", label: "Topical" }, { value: "local", label: "Local" }, { value: "general", label: "General" }];
const followupTypes = [
  { value: "day_1", label: "Day 1" },
  { value: "week_1", label: "Week 1" },
  { value: "month_1", label: "Month 1" },
  { value: "other", label: "Additional follow-up" },
];

type Preop = {
  version: number; axialLength: number; keratometryK1: number; keratometryK2: number;
  targetRefraction: number; iolModel: string; iolPower: number; anaesthesia: string;
  biometryVerified: boolean; medicalClearance: boolean; pupilDilation: boolean; notes: string;
};
type OperationNote = {
  version: number; procedurePerformed: string; anaesthesia: string; incision: string;
  capsulorhexis: string; phacoTechnique: string; iolModel: string; iolPower: number;
  complications: string; postoperativeInstructions: string;
};
type Followup = {
  version: number; visitType: string; uncorrectedAcuity: string; correctedAcuity: string;
  iop: number; wound: string; cornea: string; anteriorChamber: string; iolPosition: string;
  medications: string; plan: string; nextReview: string | null;
};
type SurgeryCase = {
  id: string; version: number; eye: "OD" | "OS"; procedure: string; procedureCode: string | null;
  stage: string; scheduled: string | null; patient: string; mrn: string;
  history: { stage: string; eye: string; notes: string; actor: string; at: string }[];
  documents: { id: string; filename: string; eye: string; witness: string; at: string }[];
  preop: Preop | null; operationNote: OperationNote | null; followups: Followup[];
};
type Surgery = {
  facilities: Facility[];
  encounters: { id: string; patient: string; mrn: string }[];
  procedures: { code: string; name: string; specialty: string }[];
  cases: SurgeryCase[];
};

const numeric = (form: FormData, name: string) => Number(form.get(name));
const boolean = (form: FormData, name: string) => form.get(name) === "true";
const selectedChoice = (name: string, label: Field["label"], choices: { value: string; label: string }[], value?: string | boolean): Field => ({
  name, label, type: "select", choices, value: value === undefined ? undefined : String(value),
});

export function SurgeryWorkspace() {
  const { t } = useLocale();
  const user = useSession();
  const live = useOperations<Surgery>("surgery");
  if (!live.data) return <LiveHeading {...live}/>;
  const data = live.data;
  const write = user.permissions.includes("surgery:write");
  const doctorWrite = write && user.roles.includes("doctor");

  return <div className="ops-workspace">
    <LiveHeading {...live}/>
    {write && <ActionForm
      title="surgeryCreate"
      resource="surgery"
      onSaved={live.refresh}
      fields={[
        choice("encounterId", "surgeryEncounter", data.encounters.map(encounter => ({ value: encounter.id, label: encounter.patient + " / " + encounter.mrn }))),
        choice("facilityId", "surgeryTheatre", data.facilities.filter(facility => facility.type === "theatre").map(facility => ({ value: facility.id, label: facility.name }))),
        choice("eye", "surgeryEye", eyes),
        choice("procedureCode", "surgeryProcedure", data.procedures.map(procedure => ({ value: procedure.code, label: procedure.name }))),
      ]}
      body={form => ({ action: "create", encounterId: form.get("encounterId"), facilityId: form.get("facilityId"), eye: form.get("eye"), procedureCode: form.get("procedureCode") })}
    />}
    <section className="panel ops-chart-panel">
      <h2>{t("surgeryCases")}</h2>
      {!data.cases.length && <p>{t("surgeryEmpty")}</p>}
      {data.cases.map(surgeryCase => <details key={surgeryCase.id} className="ops-daily-table">
        <summary>{surgeryCase.patient} / {surgeryCase.mrn} / {surgeryCase.eye} / {surgeryCase.procedure} / {stageLabel(surgeryCase.stage)}</summary>
        {surgeryCase.scheduled && <p>{new Date(surgeryCase.scheduled).toLocaleString()}</p>}
        <h3>{t("surgeryHistory")}</h3>
        <ol className="ops-stage-history">{surgeryCase.history.map((history, index) => <li key={index}><strong>{stageLabel(history.stage)} / {history.eye}</strong><span>{history.notes}<small>{history.actor} / {new Date(history.at).toLocaleString()}</small></span></li>)}</ol>
        <h3>{t("surgeryConsent")}</h3>
        {surgeryCase.documents.map(document => <p key={document.id}><a href={"/api/operations/consent?id=" + document.id}>{document.filename}</a> / {document.eye} / {document.witness}</p>)}
        {write && ["planning", "consent", "preop"].includes(surgeryCase.stage) && <ConsentUpload surgeryCase={surgeryCase} onSaved={live.refresh}/>}
        {surgeryCase.procedureCode === "cataract-phaco-iol" && <CataractPathway surgeryCase={surgeryCase} canWrite={doctorWrite} onSaved={live.refresh}/>}
        {write && !["followup", "cancelled"].includes(surgeryCase.stage) && <ActionForm
          key={"advance-" + surgeryCase.version}
          title="surgeryAdvance"
          resource="surgery"
          onSaved={live.refresh}
          fields={[
            choice("stage", "surgeryNext", [
              ...(stages[stages.indexOf(surgeryCase.stage) + 1] ? [{ value: stages[stages.indexOf(surgeryCase.stage) + 1], label: stageLabel(stages[stages.indexOf(surgeryCase.stage) + 1]) }] : []),
              ...(["planning", "consent", "preop", "scheduled"].includes(surgeryCase.stage) ? [{ value: "cancelled", label: t("surgeryCancel") }] : []),
            ]),
            choice("eye", "surgeryEye", eyes),
            { name: "notes", label: "surgeryNotes", type: "textarea" },
            ...(surgeryCase.stage === "preop" ? [{ name: "scheduled", label: "surgeryScheduled" as const, type: "datetime-local" as const }] : []),
          ]}
          body={form => ({
            action: "advance", id: surgeryCase.id, version: surgeryCase.version, stage: form.get("stage"),
            eye: form.get("eye"), notes: form.get("notes"),
            ...(form.get("scheduled") ? { scheduled: new Date(String(form.get("scheduled"))).toISOString() } : {}),
          })}
        />}
      </details>)}
    </section>
  </div>;
}

function CataractPathway({ surgeryCase, canWrite, onSaved }: { surgeryCase: SurgeryCase; canWrite: boolean; onSaved: () => void }) {
  const { t } = useLocale();
  const preop = surgeryCase.preop;
  const operation = surgeryCase.operationNote;
  const remainingFollowups = followupTypes.filter(type => !surgeryCase.followups.some(followup => followup.visitType === type.value));
  return <section className="cataract-pathway">
    <h3>{t("cataractPreopTitle")}</h3>
    {preop && <RecordSummary rows={[
      ["Axial length", preop.axialLength + " mm"],
      ["Keratometry", preop.keratometryK1 + " / " + preop.keratometryK2 + " D"],
      ["IOL", preop.iolModel + " / " + preop.iolPower + " D"],
      ["Target", preop.targetRefraction + " D"],
      ["Clearance", preop.biometryVerified && preop.medicalClearance ? "Ready" : "Incomplete"],
    ]}/>}
    {canWrite && ["consent", "preop"].includes(surgeryCase.stage) && <PreopForm surgeryCase={surgeryCase} onSaved={onSaved}/>}
    <h3>{t("cataractOperationTitle")}</h3>
    {operation && <RecordSummary rows={[
      ["Procedure", operation.procedurePerformed],
      ["Technique", operation.phacoTechnique],
      ["IOL", operation.iolModel + " / " + operation.iolPower + " D"],
      ["Complications", operation.complications || "None recorded"],
    ]}/>}
    {canWrite && surgeryCase.stage === "scheduled" && <OperationForm surgeryCase={surgeryCase} onSaved={onSaved}/>}
    <h3>{t("cataractFollowupTitle")}</h3>
    {surgeryCase.followups.map(followup => <div key={followup.visitType}>
      <RecordSummary rows={[
        ["Visit", followupTypes.find(type => type.value === followup.visitType)?.label ?? followup.visitType],
        ["Visual acuity", followup.uncorrectedAcuity + (followup.correctedAcuity ? " / " + followup.correctedAcuity : "")],
        ["IOP", followup.iop + " mmHg"],
        ["Plan", followup.plan],
      ]}/>
      {canWrite && ["operated", "discharged", "followup"].includes(surgeryCase.stage) && <FollowupForm surgeryCase={surgeryCase} choices={followupTypes.filter(type => type.value === followup.visitType)} current={followup} onSaved={onSaved}/>}
    </div>)}
    {canWrite && ["operated", "discharged", "followup"].includes(surgeryCase.stage) && remainingFollowups.length > 0 && <FollowupForm surgeryCase={surgeryCase} choices={remainingFollowups} onSaved={onSaved}/>}
    {remainingFollowups.length === 0 && <p>{t("cataractNoFurtherFollowups")}</p>}
  </section>;
}

function RecordSummary({ rows }: { rows: [string, string][] }) {
  return <dl className="cataract-record">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

function PreopForm({ surgeryCase, onSaved }: { surgeryCase: SurgeryCase; onSaved: () => void }) {
  const current = surgeryCase.preop;
  const fields: Field[] = [
    { name: "axialLength", label: "cataractAxialLength", type: "number", min: 15, max: 40, step: .01, value: current?.axialLength },
    { name: "keratometryK1", label: "cataractK1", type: "number", min: 20, max: 70, step: .01, value: current?.keratometryK1 },
    { name: "keratometryK2", label: "cataractK2", type: "number", min: 20, max: 70, step: .01, value: current?.keratometryK2 },
    { name: "targetRefraction", label: "cataractTargetRefraction", type: "number", min: -20, max: 20, step: .01, value: current?.targetRefraction },
    { name: "iolModel", label: "cataractIolModel", value: current?.iolModel },
    { name: "iolPower", label: "cataractIolPower", type: "number", min: -10, max: 60, step: .01, value: current?.iolPower },
    selectedChoice("anaesthesia", "cataractAnaesthesia", anaesthesia, current?.anaesthesia ?? surgeryCase.preop?.anaesthesia),
    choice("biometryVerified", "cataractBiometryVerified", yesNo),
    choice("medicalClearance", "cataractMedicalClearance", yesNo),
    choice("pupilDilation", "cataractPupilDilation", yesNo),
    { name: "notes", label: "cataractNotes", type: "textarea", value: current?.notes, optional: true },
  ];
  return <ActionForm key={"preop-" + (current?.version ?? 0)} title="cataractPreopSave" resource="surgery" fields={fields} onSaved={onSaved} body={form => ({
    action: "save_preop", id: surgeryCase.id, version: current?.version ?? 0, eye: surgeryCase.eye,
    axialLength: numeric(form, "axialLength"), keratometryK1: numeric(form, "keratometryK1"), keratometryK2: numeric(form, "keratometryK2"),
    targetRefraction: numeric(form, "targetRefraction"), iolModel: form.get("iolModel"), iolPower: numeric(form, "iolPower"),
    anaesthesia: form.get("anaesthesia"), biometryVerified: boolean(form, "biometryVerified"),
    medicalClearance: boolean(form, "medicalClearance"), pupilDilation: boolean(form, "pupilDilation"), notes: form.get("notes"),
  })}/>;
}

function OperationForm({ surgeryCase, onSaved }: { surgeryCase: SurgeryCase; onSaved: () => void }) {
  const current = surgeryCase.operationNote;
  return <ActionForm key={"operation-" + (current?.version ?? 0)} title="cataractOperationSave" resource="surgery" onSaved={onSaved} fields={[
    { name: "procedurePerformed", label: "cataractProcedurePerformed", value: current?.procedurePerformed ?? surgeryCase.procedure },
    choice("anaesthesia", "cataractAnaesthesia", anaesthesia),
    { name: "incision", label: "cataractIncision", value: current?.incision },
    { name: "capsulorhexis", label: "cataractCapsulorhexis", value: current?.capsulorhexis },
    { name: "phacoTechnique", label: "cataractPhacoTechnique", value: current?.phacoTechnique },
    { name: "iolModel", label: "cataractIolModel", value: current?.iolModel ?? surgeryCase.preop?.iolModel },
    { name: "iolPower", label: "cataractIolPower", type: "number", min: -10, max: 60, step: .01, value: current?.iolPower ?? surgeryCase.preop?.iolPower },
    { name: "complications", label: "cataractComplications", type: "textarea", value: current?.complications ?? "None" },
    { name: "postoperativeInstructions", label: "cataractPostopInstructions", type: "textarea", value: current?.postoperativeInstructions },
  ]} body={form => ({
    action: "save_operation", id: surgeryCase.id, version: current?.version ?? 0, eye: surgeryCase.eye,
    procedurePerformed: form.get("procedurePerformed"), anaesthesia: form.get("anaesthesia"), incision: form.get("incision"),
    capsulorhexis: form.get("capsulorhexis"), phacoTechnique: form.get("phacoTechnique"), iolModel: form.get("iolModel"),
    iolPower: numeric(form, "iolPower"), complications: form.get("complications"), postoperativeInstructions: form.get("postoperativeInstructions"),
  })}/>;
}

function FollowupForm({ surgeryCase, choices, current, onSaved }: { surgeryCase: SurgeryCase; choices: { value: string; label: string }[]; current?: Followup; onSaved: () => void }) {
  return <ActionForm title="cataractFollowupSave" resource="surgery" onSaved={onSaved} fields={[
    selectedChoice("visitType", "cataractVisitType", choices, current?.visitType),
    { name: "uncorrectedAcuity", label: "cataractUnaidedAcuity", value: current?.uncorrectedAcuity },
    { name: "correctedAcuity", label: "cataractCorrectedAcuity", value: current?.correctedAcuity, optional: true },
    { name: "iop", label: "cataractIop", type: "number", min: 0, max: 80, step: .1, value: current?.iop },
    { name: "wound", label: "cataractWound", value: current?.wound },
    { name: "cornea", label: "cataractCornea", value: current?.cornea },
    { name: "anteriorChamber", label: "cataractAnteriorChamber", value: current?.anteriorChamber },
    { name: "iolPosition", label: "cataractIolPosition", value: current?.iolPosition },
    { name: "medications", label: "cataractMedications", type: "textarea", value: current?.medications },
    { name: "plan", label: "cataractPlan", type: "textarea", value: current?.plan },
    { name: "nextReview", label: "cataractNextReview", type: "date", value: current?.nextReview ?? undefined, optional: true },
  ]} body={form => ({
    action: "save_followup", id: surgeryCase.id, version: current?.version ?? 0, visitType: form.get("visitType"), eye: surgeryCase.eye,
    uncorrectedAcuity: form.get("uncorrectedAcuity"), correctedAcuity: form.get("correctedAcuity"), iop: numeric(form, "iop"),
    wound: form.get("wound"), cornea: form.get("cornea"), anteriorChamber: form.get("anteriorChamber"),
    iolPosition: form.get("iolPosition"), medications: form.get("medications"), plan: form.get("plan"),
    ...(form.get("nextReview") ? { nextReview: form.get("nextReview") } : {}),
  })}/>;
}

function ConsentUpload({ surgeryCase, onSaved }: { surgeryCase: SurgeryCase; onSaved: () => void }) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <form className="admin-form" onSubmit={async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set("caseId", surgeryCase.id);
    setBusy(true);
    setError("");
    try {
      const result = await fetch("/api/operations/consent", { method: "POST", body: data });
      if (!result.ok) {
        const body = await result.json();
        throw new Error(body.error);
      }
      form.reset();
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }}>
    <h4>{t("surgeryUpload")}</h4>
    <label>{t("surgeryEye")}<select name="eye" required defaultValue=""><option value="">Select...</option><option>OD</option><option>OS</option></select></label>
    <label>{t("surgeryWitness")}<input name="witness" required minLength={3} maxLength={160}/></label>
    <label>{t("surgeryFile")}<input type="file" name="file" accept="application/pdf,image/png,image/jpeg" required/></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="secondary-button" disabled={busy}>{t("surgeryUpload")}</button>
  </form>;
}
