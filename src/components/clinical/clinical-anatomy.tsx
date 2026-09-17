"use client";
import { useCallback,useState } from 'react';
import { EyeViewer } from '../anatomy/eye-viewer';
import { EYES,appendSelection,selectSite,type PlanRow,type Selection,type ViewMode } from '@/lib/anatomy';
import { useLocale } from '../locale-provider';
export function ClinicalAnatomy({plans,onChange,disabled}:{plans:PlanRow[];onChange:(plans:PlanRow[])=>void;disabled:boolean}){
 const {t}=useLocale();const [selection,setSelection]=useState<Selection>({OD:null,OS:null}),[view,setView]=useState<ViewMode>('3d'),[fallback,setFallback]=useState(false),[cutaway,setCutaway]=useState(true);const unavailable=useCallback(()=>{setFallback(true);setView('2d');},[]);
 return <div className="clinical-anatomy"><p>{t('clinicalPlanHelp')}</p><div className="anatomy-toolbar"><div className="view-switch"><button type="button" disabled={fallback} aria-pressed={view==='3d'} onClick={()=>setView('3d')}>{t('threeD')}</button><button type="button" aria-pressed={view==='2d'} onClick={()=>setView('2d')}>{t('twoD')}</button></div><label><input type="checkbox" checked={cutaway} onChange={event=>setCutaway(event.target.checked)}/>{t('cutaway')}</label></div><div className="bilateral-grid" dir="ltr">{EYES.map(eye=><EyeViewer key={eye} eye={eye} selected={selection[eye]} onSelect={site=>setSelection(value=>selectSite(value,eye,site))} view={view} cutaway={cutaway} onUnavailable={unavailable}/>)}</div><button type="button" className="primary-button" disabled={disabled||!EYES.some(eye=>selection[eye]&&!plans.some(plan=>plan.eye===eye&&plan.anatomySite===selection[eye]))} onClick={()=>onChange(appendSelection(plans,selection,()=>crypto.randomUUID()))}>{t('attachClinicalPlan')}</button></div>;
}
