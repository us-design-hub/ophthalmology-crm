"use client";
import { useEffect,useRef,useState } from 'react';
import { ArrowRight,CalendarDays,Clock3,FileCheck2,FileSignature,HeartPulse,MessageSquarePlus,NotebookPen,Paperclip,PenTool,Pill,Scissors,Stethoscope,X } from 'lucide-react';
import { api } from '@/lib/api-client';
import type { ClinicalList,PatientTimelineActivity,Timeline } from '@/lib/clinical';
import type { MessageKey } from '@/lib/messages';
import { useLocale } from '../locale-provider';
import { useSession } from '../session-provider';
import { ErrorNotice,intakeError,LiveStatus,RiskFlags,useLiveData } from '../intake/shared';
import { formatDate } from '../patients/patients-workspace';
import { DoctorEditor } from './doctor-editor';
import { PatientProblemList } from './patient-problem-list';
import { PatientComparison } from './patient-comparison';

export function ClinicalWorkspace(){const {t}=useLocale(),user=useSession();const live=useLiveData<ClinicalList>('/api/clinical/list');const [selected,setSelected]=useState<string|null>(null);return <div className="clinical-home"><LiveStatus {...live}/><div className="clinical-encounter-grid">{live.data?.encounters.map(item=><article className="panel clinical-encounter" key={item.id}><div><span className="patient-avatar">{item.name[0]}</span><div><h2>{item.name}</h2><small>{item.mrn}</small></div><span className="intake-status">{item.eventStatus?t(item.eventStatus==='signed'?'clinicalSigned':'clinicalDraft'):t(('stage_'+item.stage) as MessageKey)}</span></div><RiskFlags flags={item.flags}/><dl><div><dt>{t('clinicLabel')}</dt><dd>{item.clinic}</dd></div><div><dt>{t(item.doctorId===user.id?'clinicalMine':'clinicalOther')}</dt><dd>{item.doctor}</dd></div></dl><p><Clock3 size={13}/>{formatDate(item.checkedInAt,true)}</p><button type="button" className="primary-button" onClick={()=>setSelected(item.id)}>{t('openClinical')}<ArrowRight size={15}/></button></article>)}</div>{live.data?.encounters.length===0&&<p className="intake-empty">{t('clinicalNoEncounters')}</p>}{selected&&<DoctorEditor id={selected} onClose={()=>{setSelected(null);live.refresh();}}/>}</div>;}

export function HistoryList({patientId,currentId,onOpen,refresh=0}:{patientId:string;currentId?:string;onOpen:(id:string)=>void;refresh?:number}){const {t}=useLocale();const [data,setData]=useState<Timeline|null>(null),[error,setError]=useState<MessageKey|null>(null);useEffect(()=>{const controller=new AbortController();api<Timeline>('/api/clinical/timeline?patientId='+patientId,undefined,{signal:controller.signal}).then(setData).catch(error=>{if(!controller.signal.aborted)setError(intakeError(error));});return()=>controller.abort();},[patientId,refresh]);return <section className="clinical-history"><h3><FileCheck2 size={17}/>{t('clinicalHistory')}</h3><p>{t('patient360Hint')}</p><ErrorNotice error={error}/>{data?.entries.map(item=><button className={item.id===currentId?'selected':''} type="button" key={item.id} onClick={()=>onOpen(item.id)}><strong>{formatDate(item.date)}</strong><span>{item.clinic}</span><small>{item.author}</small><span className={'history-status '+(item.status??'')}>{item.id===currentId?t('currentEncounter'):item.status?t(item.status==='signed'?'clinicalSigned':'clinicalDraft'):t('workup')}</span>{item.synthetic&&<small>{t('importedHistory')}</small>}{item.addendumCount>0&&<small>{item.addendumCount} {t('addendaLabel')}</small>}</button>)}{data?.entries.length===0&&<p>{t('historyEmpty')}</p>}</section>;}

const activityLabels:Record<PatientTimelineActivity['kind'],MessageKey>={
  appointment:'timelineAppointment',
  checkin:'timelineCheckin',
  workup:'timelineWorkup',
  investigation:'timelineInvestigation',
  investigation_evidence:'timelineInvestigationEvidence',
  doctor_event:'timelineDoctorEvent',
  drawing:'timelineDrawing',
  prescription:'timelinePrescription',
  prescription_evidence:'timelineEvidence',
  addendum:'timelineAddendum',
  consent:'timelineConsent',
  surgery:'timelineSurgery',
  operation_note:'timelineOperation',
  surgery_followup:'timelineFollowup',
  problem:'timelineProblem',
};
function ActivityIcon({kind}:{kind:PatientTimelineActivity['kind']}){
  const props={size:18,'aria-hidden':true as const};
  if(kind==='appointment')return <CalendarDays {...props}/>;
  if(kind==='checkin'||kind==='workup'||kind==='investigation')return <HeartPulse {...props}/>;
  if(kind==='doctor_event')return <Stethoscope {...props}/>;
  if(kind==='drawing')return <PenTool {...props}/>;
  if(kind==='prescription')return <Pill {...props}/>;
  if(kind==='prescription_evidence'||kind==='investigation_evidence')return <Paperclip {...props}/>;
  if(kind==='addendum')return <MessageSquarePlus {...props}/>;
  if(kind==='consent')return <FileSignature {...props}/>;
  if(kind==='surgery')return <Scissors {...props}/>;
  return <NotebookPen {...props}/>;
}
function PatientActivityTimeline({patientId,onOpen,refresh=0}:{patientId:string;onOpen:(id:string)=>void;refresh?:number}){
  const {t}=useLocale();
  const [data,setData]=useState<Timeline|null>(null),[error,setError]=useState<MessageKey|null>(null);
  useEffect(()=>{const controller=new AbortController();setError(null);api<Timeline>('/api/clinical/timeline?patientId='+patientId,undefined,{signal:controller.signal}).then(setData).catch(error=>{if(!controller.signal.aborted)setError(intakeError(error));});return()=>controller.abort();},[patientId,refresh]);
  return <section className="patient-activity" aria-label={t('patientTimeline')}>
    <div className="patient-activity-intro"><div><h3><Clock3 size={19}/>{t('patientTimeline')}</h3><p>{t('patientTimelineHint')}</p></div>{data&&<span>{data.activity.length} {t('timelineItems')}</span>}</div>
    <ErrorNotice error={error}/>
    {!data&&!error&&<p className="patient-activity-loading">{t('clinicalLoading')}</p>}
    <div className="patient-activity-list">
      {data?.activity.map(item=><article className={'patient-activity-item kind-'+item.kind} key={item.id}>
        <span className="patient-activity-icon"><ActivityIcon kind={item.kind}/></span>
        <div className="patient-activity-content">
          <div className="patient-activity-heading"><strong>{t(activityLabels[item.kind])}</strong><time dateTime={item.at}>{formatDate(item.at,true)}</time></div>
          <p>{item.summary}</p>
          <small>{item.clinic} / {item.author}</small>
        </div>
        <div className="patient-activity-action"><span>{item.status.replaceAll('_',' ')}</span>{item.encounterId&&<button type="button" className="text-button" onClick={()=>onOpen(item.encounterId!)}>{t('timelineOpenRecord')}<ArrowRight size={14}/></button>}</div>
      </article>)}
    </div>
    {data?.activity.length===0&&<p className="intake-empty">{t('timelineEmpty')}</p>}
  </section>;
}

export function PatientTimelineDialog({patientId,onClose}:{patientId:string;onClose:()=>void}){const {t}=useLocale(),ref=useRef<HTMLDialogElement>(null),[selected,setSelected]=useState<string|null>(null),[revision,setRevision]=useState(0);useEffect(()=>{ref.current?.showModal();},[]);return <><dialog ref={ref} className="intake-dialog history-dialog" aria-label={t('patient360')} onCancel={onClose}><div className="patient-record-header"><h2>{t('patient360')}</h2><button type="button" className="icon-button" aria-label={t('closeClinical')} onClick={onClose}><X size={20}/></button></div><div className="intake-dialog-body"><PatientProblemList patientId={patientId} onChanged={()=>setRevision(value=>value+1)}/><PatientComparison patientId={patientId}/><PatientActivityTimeline patientId={patientId} onOpen={setSelected} refresh={revision}/></div></dialog>{selected&&<DoctorEditor id={selected} onClose={()=>setSelected(null)}/>}</>;}
