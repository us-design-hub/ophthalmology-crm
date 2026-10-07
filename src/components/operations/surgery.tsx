"use client";

import { useState } from "react";
import { useSession } from "../session-provider";
import { useLocale } from "../locale-provider";
import { ActionForm, LiveHeading, useOperations, choice, type Facility, type Field } from "./live-shared";
import { operationError } from "./live-shared";
import { karachiDate, type SurgeryReadiness } from "@/lib/surgery-worklist";
import { todayKarachi } from "@/lib/patients";
import { api } from "@/lib/api-client";
import type { ProcedureDefinition, ProcedureField } from '@/lib/administration';

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
type ConsentVersion = {
  id: string; version: number; eye: "OD" | "OS"; procedure: string; statementVersion: string;
  signatoryType: "patient" | "guardian"; signatoryName: string; relationship: string;
  witnessName: string; witnessRole: string; source: "structured" | "legacy"; recordHash: string;
  createdAt: string; createdBy: string; status: "created" | "confirmed" | "withdrawn";
  confirmedBy: string | null; confirmedAt: string | null; withdrawnBy: string | null; withdrawnAt: string | null;
  withdrawalReason: string | null; document: { id: string; filename: string };
};
type SurgeryCase = {
  id: string; version: number; eye: "OD" | "OS"; procedure: string; procedureCode: string | null; procedureVersion:number; procedureDefinition:ProcedureDefinition;
  stage: string; scheduled: string | null; patient: string; mrn: string; facilityId: string;
  theatre: string; surgeonId: string; surgeon: string; createdAt: string; readiness: SurgeryReadiness;
  history: { stage: string; eye: string; notes: string; actor: string; at: string }[];
  documents: { id: string; filename: string; eye: string; witness: string; at: string }[];
  consents: ConsentVersion[];
  preop: Preop | null; operationNote: OperationNote | null; followups: Followup[];
  workflowPreop:WorkflowRecord|null;workflowOperation:WorkflowRecord|null;workflowFollowups:WorkflowRecord[];
};
type WorkflowRecord={recordKey?:string;version:number;answers:Record<string,string|number|boolean>;createdAt:string};
type Surgery = {
  facilities: Facility[];
  encounters: { id: string; patient: string; mrn: string }[];
  procedures: { code: string; name: string; specialty: string }[];
  surgeons: { id: string; name: string }[];
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
  const [worklistScope, setWorklistScope] = useState<"scheduled" | "active">("scheduled");
  const [worklistDate, setWorklistDate] = useState(todayKarachi());
  const [worklistTheatre, setWorklistTheatre] = useState("all");
  const [worklistReadiness, setWorklistReadiness] = useState("all");
  const [selectedCase, setSelectedCase] = useState<string | null>(null);
  if (!live.data) return <LiveHeading {...live}/>;
  const data = live.data;
  const write = user.permissions.includes("surgery:write");
  const doctorWrite = write && user.roles.includes("doctor");

  return <div className="ops-workspace">
    <LiveHeading {...live}/>
    <TheatreWorklist
      cases={data.cases}
      theatres={data.facilities.filter(facility => facility.type === "theatre")}
      scope={worklistScope}
      date={worklistDate}
      theatre={worklistTheatre}
      readiness={worklistReadiness}
      onScope={setWorklistScope}
      onDate={setWorklistDate}
      onTheatre={setWorklistTheatre}
      onReadiness={setWorklistReadiness}
      onOpen={id => {
        setSelectedCase(id);
        setTimeout(() => document.getElementById(`surgery-case-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }}
    />
    {write && <ActionForm
      title="surgeryCreate"
      resource="surgery"
      onSaved={live.refresh}
      fields={[
        choice("encounterId", "surgeryEncounter", data.encounters.map(encounter => ({ value: encounter.id, label: encounter.patient + " / " + encounter.mrn }))),
        choice("facilityId", "surgeryTheatre", data.facilities.filter(facility => facility.type === "theatre").map(facility => ({ value: facility.id, label: facility.name }))),
        choice("surgeonId", "surgerySurgeon", data.surgeons.map(surgeon => ({ value: surgeon.id, label: surgeon.name }))),
        choice("eye", "surgeryEye", eyes),
        choice("procedureCode", "surgeryProcedure", data.procedures.map(procedure => ({ value: procedure.code, label: procedure.name }))),
      ]}
      body={form => ({ action: "create", encounterId: form.get("encounterId"), facilityId: form.get("facilityId"), surgeonId: form.get("surgeonId"), eye: form.get("eye"), procedureCode: form.get("procedureCode") })}
    />}
    <section className="panel ops-chart-panel">
      <h2>{t("surgeryCases")}</h2>
      {!data.cases.length && <p>{t("surgeryEmpty")}</p>}
      {data.cases.map(surgeryCase => <details id={`surgery-case-${surgeryCase.id}`} key={surgeryCase.id} className="ops-daily-table" open={selectedCase === surgeryCase.id || undefined} onToggle={event => { if (!event.currentTarget.open && selectedCase === surgeryCase.id) setSelectedCase(null); }}>
        <summary>{surgeryCase.patient} / {surgeryCase.mrn} / {surgeryCase.eye} / {surgeryCase.procedure} / {stageLabel(surgeryCase.stage)}</summary>
        <p>{surgeryCase.theatre} / {surgeryCase.surgeon}</p>
        {surgeryCase.scheduled && <p>{new Date(surgeryCase.scheduled).toLocaleString()}</p>}
        <h3>{t("surgeryHistory")}</h3>
        <ol className="ops-stage-history">{surgeryCase.history.map((history, index) => <li key={index}><strong>{stageLabel(history.stage)} / {history.eye}</strong><span>{history.notes}<small>{history.actor} / {new Date(history.at).toLocaleString()}</small></span></li>)}</ol>
        <h3>{t("surgeryConsent")}</h3>
        <ConsentHistory surgeryCase={surgeryCase} canWrite={write} doctorWrite={doctorWrite} onSaved={live.refresh}/>
        {write && ["planning", "consent", "preop", "scheduled"].includes(surgeryCase.stage) && <ConsentUpload surgeryCase={surgeryCase} onSaved={live.refresh}/>}
        {surgeryCase.procedureCode&&surgeryCase.procedureDefinition&&<ProcedureWorkflow surgeryCase={surgeryCase} canWrite={doctorWrite} onSaved={live.refresh}/>}
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

function TheatreWorklist({ cases, theatres, scope, date, theatre, readiness, onScope, onDate, onTheatre, onReadiness, onOpen }: {
  cases: SurgeryCase[]; theatres: Facility[]; scope: "scheduled" | "active"; date: string; theatre: string; readiness: string;
  onScope: (value: "scheduled" | "active") => void; onDate: (value: string) => void; onTheatre: (value: string) => void;
  onReadiness: (value: string) => void; onOpen: (id: string) => void;
}) {
  const visible = cases.filter(surgeryCase => {
    if (theatre !== "all" && surgeryCase.facilityId !== theatre) return false;
    if (readiness !== "all" && surgeryCase.readiness.status !== readiness) return false;
    if (scope === "scheduled") return Boolean(surgeryCase.scheduled && karachiDate(surgeryCase.scheduled) === date);
    return !["cancelled", "followup"].includes(surgeryCase.stage);
  }).sort((a, b) => (a.scheduled ?? a.createdAt).localeCompare(b.scheduled ?? b.createdAt));
  const counts = {
    total: visible.length,
    ready: visible.filter(item => item.readiness.status === "ready").length,
    action: visible.filter(item => item.readiness.status === "action_required").length,
    completed: visible.filter(item => item.readiness.status === "completed").length,
  };
  return <section className="panel surgery-worklist" aria-labelledby="theatre-worklist-title">
    <header><div><p className="ops-live-label">SURGERY OPERATIONS</p><h2 id="theatre-worklist-title">Theatre worklist</h2><p>Review the daily operating list, named surgeon, and readiness blockers before a patient enters theatre.</p></div></header>
    <div className="ops-filters surgery-worklist-filters">
      <label>View<select value={scope} onChange={event => onScope(event.target.value as "scheduled" | "active")}><option value="scheduled">Scheduled theatre list</option><option value="active">All active cases</option></select></label>
      {scope === "scheduled" && <label>Date<input type="date" value={date} onChange={event => onDate(event.target.value)}/></label>}
      <label>Theatre<select value={theatre} onChange={event => onTheatre(event.target.value)}><option value="all">All theatres</option>{theatres.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Readiness<select value={readiness} onChange={event => onReadiness(event.target.value)}><option value="all">All states</option><option value="ready">Ready</option><option value="action_required">Action required</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
    </div>
    <div className="surgery-worklist-metrics" aria-label="Visible worklist summary"><span><strong>{counts.total}</strong> cases</span><span><strong>{counts.ready}</strong> ready</span><span><strong>{counts.action}</strong> need action</span><span><strong>{counts.completed}</strong> completed</span></div>
    {!visible.length ? <div className="surgery-worklist-empty"><strong>No cases match this worklist.</strong><p>Choose another date or switch to all active cases.</p></div> : <div className="patient-table-wrap"><table className="patient-table surgery-worklist-table">
      <thead><tr><th>Time</th><th>Patient</th><th>Procedure</th><th>Theatre / surgeon</th><th>Readiness</th><th>Case</th></tr></thead>
      <tbody>{visible.map(surgeryCase => <tr key={surgeryCase.id}>
        <td>{surgeryCase.scheduled ? new Date(surgeryCase.scheduled).toLocaleTimeString("en-PK", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit" }) : "Unscheduled"}</td>
        <td><strong>{surgeryCase.patient}</strong><small>{surgeryCase.mrn}</small></td>
        <td><strong>{surgeryCase.procedure}</strong><small>{surgeryCase.eye} / {stageLabel(surgeryCase.stage)}</small></td>
        <td><strong>{surgeryCase.theatre}</strong><small>{surgeryCase.surgeon}</small></td>
        <td><span className={`ops-tag ${surgeryCase.readiness.status === "action_required" ? "warning" : surgeryCase.readiness.status}`}>{surgeryCase.readiness.status.replace("_", " ")}</span>{surgeryCase.readiness.blockers.length > 0 && <small>{surgeryCase.readiness.blockers.join("; ")}</small>}</td>
        <td><button type="button" className="secondary-button" onClick={() => onOpen(surgeryCase.id)}>Open case</button></td>
      </tr>)}</tbody>
    </table></div>}
  </section>;
}

const legacyPreopFields:ProcedureField[]=[
  {code:'axial_length',label:'Axial length (mm)',type:'number',required:true,min:15,max:40,step:.01},{code:'keratometry_k1',label:'Keratometry K1 (D)',type:'number',required:true,min:20,max:70,step:.01},{code:'keratometry_k2',label:'Keratometry K2 (D)',type:'number',required:true,min:20,max:70,step:.01},{code:'target_refraction',label:'Target refraction (D)',type:'number',required:true,min:-20,max:20,step:.01},{code:'iol_model',label:'IOL model',type:'text',required:true,maxLength:120},{code:'iol_power',label:'IOL power (D)',type:'number',required:true,min:-10,max:60,step:.01},{code:'anaesthesia',label:'Planned anaesthesia',type:'select',required:true,options:['topical','local','general']},{code:'notes',label:'Preoperative notes',type:'textarea',required:false,maxLength:2000},
];
const legacyFollowupFields:ProcedureField[]=[
  {code:'uncorrected_acuity',label:'Unaided visual acuity',type:'text',required:true,maxLength:40},{code:'corrected_acuity',label:'Corrected visual acuity',type:'text',required:false,maxLength:40},{code:'iop',label:'IOP (mmHg)',type:'number',required:true,min:0,max:80,step:.1},{code:'wound',label:'Wound',type:'text',required:true,maxLength:500},{code:'cornea',label:'Cornea',type:'text',required:true,maxLength:500},{code:'anterior_chamber',label:'Anterior chamber',type:'text',required:true,maxLength:500},{code:'iol_position',label:'IOL position',type:'text',required:true,maxLength:500},{code:'medications',label:'Medications',type:'textarea',required:true,maxLength:1000},{code:'plan',label:'Plan',type:'textarea',required:true,maxLength:1500},{code:'next_review',label:'Next review date',type:'date',required:false},
];
const checkLabels:Record<string,string>={biometry_verified:'Biometry verified',medical_clearance:'Medical clearance complete',pupil_dilation:'Pupil dilation confirmed'};

function workflowFields(surgeryCase:SurgeryCase,kind:'preop'|'operation'|'followup'){
  const definition=surgeryCase.procedureDefinition;
  if(kind==='operation')return definition.operationNoteFields;
  if(kind==='preop')return definition.preoperativeFields?.length?definition.preoperativeFields:surgeryCase.procedureCode==='cataract-phaco-iol'?legacyPreopFields:[];
  return definition.followupFields?.length?definition.followupFields:surgeryCase.procedureCode==='cataract-phaco-iol'?legacyFollowupFields:[];
}
function controls(fields:ProcedureField[],record?:WorkflowRecord|null):Field[]{return fields.map(field=>({name:field.code,label:'cataractNotes',literalLabel:field.label,type:field.type,choices:field.options?.map(option=>({value:option,label:option})),value:record?.answers[field.code] as string|number|undefined,min:field.min,max:field.max,step:field.step,maxLength:field.maxLength,optional:!field.required}));}
function answers(form:FormData,fields:ProcedureField[],checks:string[]=[]){const result:Record<string,string|number|boolean>={};for(const check of checks)result[check]=form.get(check)==='true';for(const field of fields){const value=form.get(field.code);if(value===null||value==='')continue;result[field.code]=field.type==='number'?Number(value):String(value);}return result;}
function summaryRows(fields:ProcedureField[],record:WorkflowRecord):[string,string][]{return fields.filter(field=>record.answers[field.code]!==undefined&&record.answers[field.code]!=='').map(field=>[field.label,String(record.answers[field.code])]);}

function ProcedureWorkflow({surgeryCase,canWrite,onSaved}:{surgeryCase:SurgeryCase;canWrite:boolean;onSaved:()=>void}){
  const preopFields=workflowFields(surgeryCase,'preop'),operationFields=workflowFields(surgeryCase,'operation'),followupFields=workflowFields(surgeryCase,'followup');
  const checks=surgeryCase.procedureDefinition.preoperativeChecks??[];
  const followupSchedule=surgeryCase.procedureCode==='cataract-phaco-iol'&&!surgeryCase.procedureDefinition.followupSchedule.some(item=>item.code==='other')?[...surgeryCase.procedureDefinition.followupSchedule,{code:'other',label:'Additional follow-up',daysAfter:0,required:false}]:surgeryCase.procedureDefinition.followupSchedule;
  const completed=new Map(surgeryCase.workflowFollowups.map(record=>[record.recordKey,record]));
  return <section className="cataract-pathway">
    <p className="admin-note"><strong>{surgeryCase.procedure}</strong> / catalogue version {surgeryCase.procedureVersion}. The recorded workflow remains bound to this version.</p>
    <h3>Preoperative assessment</h3>
    {surgeryCase.workflowPreop&&<RecordSummary rows={[...checks.map(check=>[checkLabels[check]??check.replaceAll('_',' '),surgeryCase.workflowPreop!.answers[check]===true?'Yes':'No'] as [string,string]),...summaryRows(preopFields,surgeryCase.workflowPreop)]}/>}
    {canWrite&&['consent','preop'].includes(surgeryCase.stage)&&(checks.length>0||preopFields.length>0)&&<ActionForm key={`workflow-preop-${surgeryCase.workflowPreop?.version??0}`} title="cataractPreopSave" resource="surgery" onSaved={onSaved} fields={[...checks.map(check=>selectedChoice(check,'cataractNotes',yesNo,surgeryCase.workflowPreop?.answers[check] as boolean|undefined)).map((field,index)=>({...field,literalLabel:checkLabels[checks[index]]??checks[index].replaceAll('_',' ')})),...controls(preopFields,surgeryCase.workflowPreop)]} body={form=>({action:'save_preop',id:surgeryCase.id,version:surgeryCase.workflowPreop?.version??0,eye:surgeryCase.eye,answers:answers(form,preopFields,checks)})}/>}
    <h3>Operation record</h3>
    {surgeryCase.workflowOperation&&<RecordSummary rows={summaryRows(operationFields,surgeryCase.workflowOperation)}/>}
    {canWrite&&surgeryCase.stage==='scheduled'&&<ActionForm key={`workflow-operation-${surgeryCase.workflowOperation?.version??0}`} title="cataractOperationSave" resource="surgery" onSaved={onSaved} fields={controls(operationFields,surgeryCase.workflowOperation)} body={form=>({action:'save_operation',id:surgeryCase.id,version:surgeryCase.workflowOperation?.version??0,eye:surgeryCase.eye,answers:answers(form,operationFields)})}/>}
    <h3>Follow-up schedule</h3>
    {!followupSchedule.length&&<p>No procedure-specific follow-up schedule is configured.</p>}
    {followupSchedule.map(schedule=>{const record=completed.get(schedule.code);return <div key={schedule.code}><h4>{schedule.label}{schedule.daysAfter?` / ${schedule.daysAfter} days`:''}{schedule.required?' / required':''}</h4>{record&&<RecordSummary rows={summaryRows(followupFields,record)}/>} {canWrite&&['operated','discharged','followup'].includes(surgeryCase.stage)&&<ActionForm key={`${schedule.code}-${record?.version??0}`} title="cataractFollowupSave" resource="surgery" onSaved={onSaved} fields={controls(followupFields,record)} body={form=>({action:'save_followup',id:surgeryCase.id,recordKey:schedule.code,version:record?.version??0,eye:surgeryCase.eye,answers:answers(form,followupFields)})}/>}</div>;})}
  </section>;
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

function ConsentHistory({ surgeryCase, canWrite, doctorWrite, onSaved }: { surgeryCase: SurgeryCase; canWrite: boolean; doctorWrite: boolean; onSaved: () => void }) {
  const latest = surgeryCase.consents[0];
  if (!surgeryCase.consents.length) return <p className="consent-empty">No structured consent has been recorded.</p>;
  return <div className="consent-history">{surgeryCase.consents.map(consent => <article key={consent.id} className="consent-version">
    <header><div><strong>Consent version {consent.version}</strong><span className={`ops-tag ${consent.status === "created" ? "warning" : consent.status === "confirmed" ? "ready" : "cancelled"}`}>{consent.status === "created" ? "Awaiting confirmation" : consent.status}</span></div><small>{consent.source === "legacy" ? "Legacy evidence" : consent.statementVersion}</small></header>
    <dl>
      <div><dt>Procedure and eye</dt><dd>{consent.procedure} / {consent.eye}</dd></div>
      <div><dt>{consent.signatoryType === "guardian" ? "Guardian" : "Patient signatory"}</dt><dd>{consent.signatoryName}{consent.relationship ? ` / ${consent.relationship}` : ""}</dd></div>
      <div><dt>Witness</dt><dd>{consent.witnessName} / {consent.witnessRole}</dd></div>
      <div><dt>Created</dt><dd>{consent.createdBy} / {new Date(consent.createdAt).toLocaleString()}</dd></div>
      {consent.confirmedAt && <div><dt>Doctor confirmation</dt><dd>{consent.confirmedBy} / {new Date(consent.confirmedAt).toLocaleString()}</dd></div>}
      {consent.withdrawnAt && <div><dt>Withdrawal</dt><dd>{consent.withdrawnBy} / {new Date(consent.withdrawnAt).toLocaleString()} / {consent.withdrawalReason}</dd></div>}
    </dl>
    <div className="admin-actions"><a className="secondary-button" href={`/api/operations/consent?id=${consent.document.id}`}>Open signed evidence</a>
      {canWrite && doctorWrite && latest?.id === consent.id && consent.status === "created" && <ConsentAction consentVersionId={consent.id} action="confirm" onSaved={onSaved}/>}
    </div>
    {canWrite && doctorWrite && latest?.id === consent.id && consent.status === "confirmed" && <ConsentAction consentVersionId={consent.id} action="withdraw" onSaved={onSaved}/>}
  </article>)}</div>;
}

function ConsentAction({ consentVersionId, action, onSaved }: { consentVersionId: string; action: "confirm" | "withdraw"; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <form className={action === "withdraw" ? "consent-withdraw" : ""} onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/operations/consent", { action, consentVersionId, ...(action === "withdraw" ? { reason: form.get("reason") } : {}) });
      onSaved();
    } catch (caught) { setError(operationError(caught)); }
    finally { setBusy(false); }
  }}>
    {action === "withdraw" && <label>Withdrawal reason<textarea name="reason" required minLength={8} maxLength={500}/></label>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className={action === "confirm" ? "primary-button" : "secondary-button"} disabled={busy}>{action === "confirm" ? "Confirm consent as doctor" : "Withdraw current consent"}</button>
  </form>;
}

function ConsentUpload({ surgeryCase, onSaved }: { surgeryCase: SurgeryCase; onSaved: () => void }) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [signatoryType, setSignatoryType] = useState<"patient" | "guardian">("patient");
  const [signatoryName, setSignatoryName] = useState(surgeryCase.patient);
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
      setSignatoryType("patient");
      setSignatoryName(surgeryCase.patient);
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }}>
    <h4>{t("surgeryUpload")}</h4>
    <p>This creates a new immutable consent version for <strong>{surgeryCase.procedure} / {surgeryCase.eye}</strong>. A doctor must confirm it before surgery can progress.</p>
    <input type="hidden" name="eye" value={surgeryCase.eye}/>
    <label>Signatory<select name="signatoryType" value={signatoryType} onChange={event => { const next = event.target.value as "patient" | "guardian"; setSignatoryType(next); setSignatoryName(next === "patient" ? surgeryCase.patient : ""); }}><option value="patient">Patient</option><option value="guardian">Guardian</option></select></label>
    <label>Signatory name<input name="signatoryName" required minLength={2} maxLength={160} value={signatoryName} onChange={event => setSignatoryName(event.target.value)}/></label>
    {signatoryType === "guardian" && <label>Relationship to patient<input name="relationship" required minLength={2} maxLength={120}/></label>}
    <label>Witness name<input name="witnessName" required minLength={2} maxLength={160}/></label>
    <label>Witness role<input name="witnessRole" required minLength={2} maxLength={120}/></label>
    <label>{t("surgeryFile")}<input type="file" name="file" accept="application/pdf,image/png,image/jpeg" required/></label>
    <label className="admin-check"><input type="checkbox" name="accepted" value="true" required/>The signatory and witness confirmed this procedure, surgical eye, risks, benefits, and alternatives.</label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="secondary-button" disabled={busy}>{t("surgeryUpload")}</button>
  </form>;
}
