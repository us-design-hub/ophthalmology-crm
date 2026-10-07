'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {api,ClientApiError} from '@/lib/api-client';
import type {MessageKey} from '@/lib/messages';
import {useLocale} from '../locale-provider';

export type Facility={id:string;name:string;type:string};
export type Choice={value:string;label:string};
export type Field={name:string;label:MessageKey;literalLabel?:string;type?:'text'|'number'|'date'|'datetime-local'|'select'|'textarea';choices?:Choice[];value?:string|number;min?:number;max?:number;step?:number;maxLength?:number;optional?:boolean};

const errors:Record<string,string>={
 consentDocumentRequired:'Upload the signed consent document before progressing.',
 confirmedConsentRequired:'The latest consent must be confirmed by a doctor and match the procedure and surgical eye.',
 consentDraftExists:'Confirm the current consent version before creating another.',
 consentVersionStale:'This consent is no longer the current version. Refresh before acting.',
 consentContextChanged:'The procedure or surgical eye changed. Create and confirm a new consent version.',
 consentStateConflict:'This consent action cannot follow its current status.',
 lateralityMismatch:'The confirmed eye does not match this surgery.',
 stageConflict:'This stage cannot follow the current stage.',
 futureSurgeryRequired:'Choose a future surgery date and time.',
 doctorRequired:'A doctor must record this clinical stage.',
 recordChanged:'This record changed. Refresh before trying again.',
 validationFailed:'Check the form entries and required fields.',
 accessDenied:'Your role or facility assignment does not allow this action.',
 signedEventRequired:'A signed doctor event is required.',
 theatreRequired:'Select a theatre facility.',
 surgeonUnavailable:'Select an active doctor assigned to this theatre.',
 procedureNotFound:'Select an active procedure from the catalogue.',
 procedureEyeNotAllowed:'The selected procedure is not configured for this surgical eye.',
 procedureWorkflowUnavailable:'This procedure version does not contain a valid workflow definition.',
 workflowInvalid:'Complete the configured procedure fields using valid values.',
 cataractProcedureRequired:'This record is not configured as a cataract procedure.',
 preopRequired:'Complete every required preoperative check before scheduling.',
 operationNoteRequired:'Save the configured operation record before recording the surgery as completed.'
};

export function operationError(e:unknown){return e instanceof ClientApiError?(errors[e.code]||'Unable to save ('+e.code+').'):'Unable to connect. Please try again.';}

export function useOperations<T>(resource:string){
 const [data,setData]=useState<T|null>(null),[error,setError]=useState(''),[updated,setUpdated]=useState('');
 const pending=useRef<AbortController|null>(null);
 const refresh=useCallback(async()=>{
  if(pending.current)return;
  const controller=new AbortController();pending.current=controller;
  try{setData(await api('/api/operations/'+resource,undefined,{signal:controller.signal}));setError('');setUpdated(new Date().toLocaleTimeString());}
  catch(e){if(!controller.signal.aborted)setError(operationError(e));}
  finally{if(pending.current===controller)pending.current=null;}
 },[resource]);
 useEffect(()=>{
  void refresh();
  const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},30000);
  const visible=()=>{if(document.visibilityState==='visible')void refresh();};
  document.addEventListener('visibilitychange',visible);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visible);pending.current?.abort();pending.current=null;};
 },[refresh]);
 return {data,error,updated,refresh};
}

export function LiveHeading({error,updated,refresh}:{error:string;updated:string;refresh:()=>void}){const {t}=useLocale();return <div className="admin-actions"><span className="ops-live-label">{t('liveRecords')} {updated&&' - '+t('liveUpdated')+' '+updated}</span><button type="button" className="text-button" onClick={refresh}>{t('refresh')}</button>{error&&<p className="form-error" role="alert">{error}</p>}</div>;}

export function Controls({fields}:{fields:Field[]}){const {t}=useLocale();return <div className="admin-grid">{fields.map(f=><label key={f.name}>{f.literalLabel??t(f.label)}{f.type==='select'?<select name={f.name} required={!f.optional} defaultValue={f.value??''}><option value="">{t('liveSelect')}</option>{f.choices?.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>:f.type==='textarea'?<textarea name={f.name} required={!f.optional} defaultValue={f.value} maxLength={f.maxLength??500}/>:<input name={f.name} type={f.type||'text'} required={!f.optional} defaultValue={f.value} min={f.min} max={f.max} step={f.step} maxLength={f.maxLength??500}/>}</label>)}</div>;}

export function ActionForm({title,resource,fields,body,onSaved,children}:{title:MessageKey;resource:string;fields:Field[];body:(f:FormData,requestId:string)=>unknown;onSaved:()=>void;children?:React.ReactNode}){const {t}=useLocale();const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);const requestId=useRef('');return <details className="panel ops-daily-table"><summary>{t(title)}</summary><form className="admin-form" onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');setSaved(false);requestId.current||=crypto.randomUUID();try{await api('/api/operations/'+resource,body(new FormData(event.currentTarget),requestId.current));requestId.current='';setSaved(true);onSaved();}catch(e){setError(operationError(e));}finally{setBusy(false);}}}><fieldset disabled={busy}><Controls fields={fields}/>{children}<button className="primary-button" disabled={busy}>{busy?t('liveSaving'):t(title)}</button></fieldset>{error&&<p role="alert" className="form-error">{error}</p>}{saved&&<p role="status">{t('liveSaved')}</p>}</form></details>;}

export function Table({heads,children}:{heads:MessageKey[];children:React.ReactNode}){const {t}=useLocale();return <div className="patient-table-wrap"><table className="patient-table"><thead><tr>{heads.map(h=><th key={h}>{t(h)}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;}
export const choice=(name:string,label:MessageKey,choices:Choice[],optional=false):Field=>({name,label,type:'select',choices,optional});
