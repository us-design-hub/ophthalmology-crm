'use client';

import { useEffect,useState } from 'react';
import { CheckCircle2,CircleDot,History,RotateCcw } from 'lucide-react';
import { api } from '@/lib/api-client';
import type { ClinicalProblem,ClinicalProblemList } from '@/lib/clinical';
import type { MessageKey } from '@/lib/messages';
import { useLocale } from '../locale-provider';
import { useSession } from '../session-provider';
import { ErrorNotice,intakeError } from '../intake/shared';
import { formatDate } from '../patients/patients-workspace';
import { ReasonDialog } from '../reason-dialog';

export function PatientProblemList({patientId,onChanged}:{patientId:string;onChanged:()=>void}){
  const {t}=useLocale(),user=useSession();
  const [data,setData]=useState<ClinicalProblemList|null>(null);
  const [error,setError]=useState<MessageKey|null>(null);
  const [pending,setPending]=useState<ClinicalProblem|null>(null);
  const [busy,setBusy]=useState(false);
  const [revision,setRevision]=useState(0);
  const canManage=user.permissions.includes('clinical:write');

  useEffect(()=>{
    const controller=new AbortController();
    setError(null);
    api<ClinicalProblemList>('/api/clinical/problems?patientId='+patientId,undefined,{signal:controller.signal})
      .then(setData)
      .catch(error=>{if(!controller.signal.aborted)setError(intakeError(error));});
    return()=>controller.abort();
  },[patientId,revision]);

  async function changeStatus(reason:string){
    if(!pending)return;
    setBusy(true);setError(null);
    try{
      await api('/api/clinical/problem-status',{
        id:pending.id,
        version:pending.version,
        status:pending.status==='active'?'resolved':'active',
        reason,
      });
      setPending(null);
      setRevision(value=>value+1);
      onChanged();
    }catch(error){setError(intakeError(error));}
    finally{setBusy(false);}
  }

  const active=data?.problems.filter(problem=>problem.status==='active')??[];
  const resolved=data?.problems.filter(problem=>problem.status==='resolved')??[];
  return <section className="patient-problems" aria-label={t('problemList')}>
    <div className="patient-problems-heading">
      <div><h3><CircleDot size={19}/>{t('problemList')}</h3><p>{t('problemListHint')}</p></div>
      {data&&<span>{active.length} {t('problemActiveCount')}</span>}
    </div>
    <ErrorNotice error={error}/>
    {!data&&!error&&<p className="patient-activity-loading">{t('clinicalLoading')}</p>}
    <div className="patient-problem-grid">
      {active.map(problem=><ProblemCard key={problem.id} problem={problem} canManage={canManage} onChange={()=>setPending(problem)}/>)}
    </div>
    {data&&active.length===0&&<p className="patient-problem-empty"><CheckCircle2 size={16}/>{t('problemNoneActive')}</p>}
    {resolved.length>0&&<details className="resolved-problems"><summary><History size={16}/>{resolved.length} {t('problemResolvedCount')}</summary><div className="patient-problem-grid">{resolved.map(problem=><ProblemCard key={problem.id} problem={problem} canManage={canManage} onChange={()=>setPending(problem)}/>)}</div></details>}
    {pending&&<ReasonDialog title={pending.status==='active'?'problemResolveTitle':'problemReactivateTitle'} busy={busy} onClose={()=>setPending(null)} onConfirm={changeStatus}/>}
  </section>;
}

function ProblemCard({problem,canManage,onChange}:{problem:ClinicalProblem;canManage:boolean;onChange:()=>void}){
  const {t}=useLocale();
  return <article className={'patient-problem-card '+problem.status}>
    <div><span>{problem.eye}</span><strong>{problem.label}</strong></div>
    {problem.code&&<p>{problem.codeSystem} {problem.code}</p>}
    <small>{t('problemSince')} {formatDate(problem.onsetAt)} / {t('problemUpdatedBy')} {problem.updatedBy}</small>
    {problem.resolutionReason&&<p className="problem-resolution">{problem.resolutionReason}</p>}
    <details><summary>{t('problemHistory')} ({problem.history.length})</summary>{problem.history.map(item=><p key={item.id}><strong>{item.toStatus}</strong> / {item.reason}<br/><small>{item.actor} / {formatDate(item.at,true)}</small></p>)}</details>
    {canManage&&<button type="button" className="text-button" onClick={onChange}>{problem.status==='active'?<CheckCircle2 size={14}/>:<RotateCcw size={14}/>} {t(problem.status==='active'?'problemResolve':'problemReactivate')}</button>}
  </article>;
}
