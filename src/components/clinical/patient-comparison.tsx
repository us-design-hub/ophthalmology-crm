'use client';

import { useState } from 'react';
import { ChevronDown,ChevronUp,GitCompareArrows,TrendingUp } from 'lucide-react';
import { api } from '@/lib/api-client';
import type { ClinicalComparison,ClinicalComparisonVisit,ExaminationAnswers } from '@/lib/clinical';
import type { EyeMeasurements } from '@/lib/intake';
import { formatDate } from '../patients/patients-workspace';
import { ClinicalDrawingSheet } from './clinical-drawing-sheet';

type Eye='OD'|'OS';

function visualAcuity(eye:EyeMeasurements){
  return eye.uncorrected+(eye.corrected!=='not_tested'?' -> '+eye.corrected:'');
}
function signed(value:number|null){return value===null?'-':(value>=0?'+':'')+value.toFixed(2);}
function refraction(eye:EyeMeasurements){
  const value=eye.refraction;
  if(!value)return '-';
  return 'S '+signed(value.sphere)+' / C '+signed(value.cylinder)+(value.axis===null?'':' x '+value.axis)+(value.add===null?'':' / Add '+signed(value.add));
}
function diagnoses(visit:ClinicalComparisonVisit){
  return visit.event?.diagnoses.map(item=>item.eye+' '+item.label).join('; ')||'-';
}
function hasDrawing(visit:ClinicalComparisonVisit|null){
  if(!visit?.event)return false;
  return (['OD','OS'] as const).some(eye=>visit.event!.drawings[eye].strokes.length+visit.event!.drawings[eye].markers.length>0);
}
function answerText(value:ExaminationAnswers[string]){
  if(value!==null&&typeof value==='object')return 'OD: '+String(value.OD||'-')+' / OS: '+String(value.OS||'-');
  if(typeof value==='boolean')return value?'Yes':'No';
  return String(value);
}

function IopTrend({visits}:{visits:ClinicalComparisonVisit[]}){
  const points=visits.filter(visit=>visit.workup).slice().reverse();
  if(points.length<2)return <p className="comparison-empty">At least two saved workups are needed for an IOP trend.</p>;
  const width=720,height=220,pad=34,max=Math.max(30,...points.flatMap(visit=>[visit.workup!.OD.iop,visit.workup!.OS.iop]));
  const x=(index:number)=>pad+(points.length===1?0:index*(width-pad*2)/(points.length-1));
  const y=(value:number)=>height-pad-value*(height-pad*2)/max;
  const line=(eye:Eye)=>points.map((visit,index)=>x(index)+','+y(visit.workup![eye].iop)).join(' ');
  return <div className="iop-trend">
    <div className="trend-legend"><span className="od">OD right eye</span><span className="os">OS left eye</span><span className="limit">21 mmHg reference</span></div>
    <svg viewBox={'0 0 '+width+' '+height} role="img" aria-label="Intraocular pressure over time for both eyes">
      <line x1={pad} x2={width-pad} y1={y(21)} y2={y(21)} className="iop-limit"/>
      <text x={pad} y={y(21)-5}>21</text>
      <polyline points={line('OD')} className="iop-line od"/>
      <polyline points={line('OS')} className="iop-line os"/>
      {points.flatMap((visit,index)=>(['OD','OS'] as const).map(eye=><g key={visit.encounterId+eye}><circle cx={x(index)} cy={y(visit.workup![eye].iop)} r="5" className={'iop-point '+eye.toLowerCase()}/><title>{formatDate(visit.date)} {eye}: {visit.workup![eye].iop} mmHg</title></g>))}
      {points.map((visit,index)=><text key={visit.encounterId} x={x(index)} y={height-8} textAnchor="middle">{new Date(visit.date).toLocaleDateString(undefined,{month:'short',year:'2-digit'})}</text>)}
    </svg>
  </div>;
}


function eyeAnswer(visit:ClinicalComparisonVisit,key:string,eye:Eye){
  const value=visit.event?.answers[key];
  return value!==null&&typeof value==='object'&&!Array.isArray(value)?String(value[eye]??'-'):'-';
}
function scalarAnswer(visit:ClinicalComparisonVisit,key:string){
  const value=visit.event?.answers[key];
  return ['string','number'].includes(typeof value)?String(value):'-';
}
function GlaucomaMonitoring({visits}:{visits:ClinicalComparisonVisit[]}){
  if(!visits.length)return null;
  return <section><h4>Glaucoma monitoring history</h4><div className="comparison-table-wrap"><table className="comparison-table glaucoma-comparison-table">
    <thead><tr><th>Visit</th><th>OD stage</th><th>OD C/D</th><th>OD target</th><th>OD progression</th><th>OS stage</th><th>OS C/D</th><th>OS target</th><th>OS progression</th><th>Visual field OD / OS</th><th>OCT RNFL OD / OS</th></tr></thead>
    <tbody>{visits.map(visit=><tr key={visit.encounterId}><th><strong>{formatDate(visit.event!.signedAt)}</strong><small>{visit.clinic}</small></th><td>{eyeAnswer(visit,'glaucoma_stage','OD')}</td><td>{eyeAnswer(visit,'cup_disc_ratio','OD')}</td><td>{eyeAnswer(visit,'target_iop','OD')}</td><td>{eyeAnswer(visit,'progression_status','OD')}</td><td>{eyeAnswer(visit,'glaucoma_stage','OS')}</td><td>{eyeAnswer(visit,'cup_disc_ratio','OS')}</td><td>{eyeAnswer(visit,'target_iop','OS')}</td><td>{eyeAnswer(visit,'progression_status','OS')}</td><td>{eyeAnswer(visit,'visual_field_status','OD')} / {eyeAnswer(visit,'visual_field_status','OS')}</td><td>{eyeAnswer(visit,'oct_rnfl_status','OD')} / {eyeAnswer(visit,'oct_rnfl_status','OS')}</td></tr>)}</tbody>
  </table></div></section>;
}
function RetinaMonitoring({visits}:{visits:ClinicalComparisonVisit[]}){
  if(!visits.length)return null;
  return <section><h4>Retina monitoring history</h4><div className="comparison-table-wrap"><table className="comparison-table retina-comparison-table">
    <thead><tr><th>Visit</th><th>OD diagnosis</th><th>OD severity</th><th>OD activity</th><th>OD progression</th><th>OD OCT / fluid</th><th>OD CST</th><th>OS diagnosis</th><th>OS severity</th><th>OS activity</th><th>OS progression</th><th>OS OCT / fluid</th><th>OS CST</th><th>Treatment</th></tr></thead>
    <tbody>{visits.map(visit=><tr key={visit.encounterId}><th><strong>{formatDate(visit.event!.signedAt)}</strong><small>{visit.clinic}</small></th><td>{eyeAnswer(visit,'retina_diagnosis','OD')}</td><td>{eyeAnswer(visit,'retina_severity','OD')}</td><td>{eyeAnswer(visit,'retina_activity','OD')}</td><td>{eyeAnswer(visit,'retina_progression','OD')}</td><td>{eyeAnswer(visit,'oct_macula_status','OD')} / {eyeAnswer(visit,'retinal_fluid','OD')}</td><td>{eyeAnswer(visit,'central_subfield_thickness','OD')}</td><td>{eyeAnswer(visit,'retina_diagnosis','OS')}</td><td>{eyeAnswer(visit,'retina_severity','OS')}</td><td>{eyeAnswer(visit,'retina_activity','OS')}</td><td>{eyeAnswer(visit,'retina_progression','OS')}</td><td>{eyeAnswer(visit,'oct_macula_status','OS')} / {eyeAnswer(visit,'retinal_fluid','OS')}</td><td>{eyeAnswer(visit,'central_subfield_thickness','OS')}</td><td>{scalarAnswer(visit,'retina_treatment_decision')}<small>{scalarAnswer(visit,'treatment_laterality')}</small></td></tr>)}</tbody>
  </table></div></section>;
}
function VisitSelect({label,visits,value,onChange}:{label:string;visits:ClinicalComparisonVisit[];value:string;onChange:(value:string)=>void}){
  return <label>{label}<select value={value} onChange={event=>onChange(event.target.value)}>{visits.map(visit=><option key={visit.encounterId} value={visit.encounterId}>{formatDate(visit.event?.signedAt||visit.date)} - {visit.clinic}</option>)}</select></label>;
}

function FindingsCard({visit}:{visit:ClinicalComparisonVisit|null}){
  if(!visit?.event)return <article className="comparison-findings-card"><p>No signed Doctor Event is available.</p></article>;
  const answers=Object.entries(visit.event.answers);
  return <article className="comparison-findings-card">
    <header><strong>{formatDate(visit.event.signedAt,true)}</strong><span>{visit.clinic} / {visit.event.author}</span>{visit.event.synthetic&&<small>Synthetic history</small>}</header>
    <div className="comparison-eyes"><section><h5>OD findings</h5><p>{visit.event.findings.OD||'-'}</p></section><section><h5>OS findings</h5><p>{visit.event.findings.OS||'-'}</p></section></div>
    <section><h5>Diagnoses</h5><ul>{visit.event.diagnoses.map((item,index)=><li key={item.label+index}><strong>{item.eye}</strong> {item.label}{item.code?' ('+item.code+')':''}</li>)}</ul></section>
    {answers.length>0&&<details><summary>Structured examination values ({answers.length})</summary><dl>{answers.map(([key,value])=><div key={key}><dt>{key.replaceAll('_',' ')}</dt><dd>{answerText(value)}</dd></div>)}</dl></details>}
  </article>;
}

export function PatientComparison({patientId}:{patientId:string}){
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
  const [data,setData]=useState<ClinicalComparison|null>(null),[left,setLeft]=useState(''),[right,setRight]=useState('');

  async function toggle(){
    const next=!open;setOpen(next);
    if(!next||data||busy)return;
    setBusy(true);setFailed(false);
    try{
      const result=await api<ClinicalComparison>('/api/clinical/comparison?patientId='+patientId);
      setData(result);
      const eventVisits=result.visits.filter(visit=>visit.event);
      setLeft(eventVisits[0]?.encounterId||'');
      setRight(eventVisits[1]?.encounterId||eventVisits[0]?.encounterId||'');
    }catch{setFailed(true);}finally{setBusy(false);}
  }

  const workups=data?.visits.filter(visit=>visit.workup)??[];
  const eventVisits=data?.visits.filter(visit=>visit.event)??[];
  const glaucomaVisits=eventVisits.filter(visit=>['glaucoma_stage','cup_disc_ratio','target_iop','progression_status'].some(key=>visit.event?.answers[key]!==undefined));
  const retinaVisits=eventVisits.filter(visit=>['retina_diagnosis','retina_severity','retina_activity','retina_progression'].some(key=>visit.event?.answers[key]!==undefined));
  const leftVisit=eventVisits.find(visit=>visit.encounterId===left)||null;
  const rightVisit=eventVisits.find(visit=>visit.encounterId===right)||null;
  return <section className="patient-comparison">
    <button type="button" className="patient-comparison-toggle" aria-expanded={open} onClick={toggle}><span><GitCompareArrows size={19}/><strong>Compare visits</strong><small>VA, IOP, refraction, specialty monitoring, findings, diagnoses, and drawings</small></span>{open?<ChevronUp size={18}/>:<ChevronDown size={18}/>}</button>
    {open&&<div className="patient-comparison-body">
      {busy&&<p role="status">Loading longitudinal comparison...</p>}
      {failed&&<p role="alert">The comparison could not be loaded. Close this section and try again.</p>}
      {data&&<>
        <section className="comparison-trend-section"><h4><TrendingUp size={18}/>IOP trend</h4><IopTrend visits={data.visits}/></section>
        <GlaucomaMonitoring visits={glaucomaVisits}/>
        <RetinaMonitoring visits={retinaVisits}/>
        <section><h4>Visual acuity and refraction history</h4>
          {workups.length===0?<p className="comparison-empty">No saved workups are available.</p>:<div className="comparison-table-wrap"><table className="comparison-table"><thead><tr><th>Visit</th><th>OD VA</th><th>OD IOP</th><th>OD refraction</th><th>OS VA</th><th>OS IOP</th><th>OS refraction</th><th>Diagnoses</th></tr></thead><tbody>{workups.map(visit=><tr key={visit.encounterId}><th><strong>{formatDate(visit.date)}</strong><small>{visit.clinic}</small></th><td>{visualAcuity(visit.workup!.OD)}</td><td className={visit.workup!.OD.iop>21?'elevated':''}>{visit.workup!.OD.iop} <small>{visit.workup!.OD.method}</small></td><td>{refraction(visit.workup!.OD)}</td><td>{visualAcuity(visit.workup!.OS)}</td><td className={visit.workup!.OS.iop>21?'elevated':''}>{visit.workup!.OS.iop} <small>{visit.workup!.OS.method}</small></td><td>{refraction(visit.workup!.OS)}</td><td>{diagnoses(visit)}</td></tr>)}</tbody></table></div>}
        </section>
        <section><h4>Examination findings and diagnoses</h4>
          {eventVisits.length===0?<p className="comparison-empty">No signed Doctor Events are available.</p>:<>
            <div className="comparison-selectors"><VisitSelect label="Earlier / comparison visit" visits={eventVisits} value={right} onChange={setRight}/><VisitSelect label="Later / current visit" visits={eventVisits} value={left} onChange={setLeft}/></div>
            <div className="comparison-findings"><FindingsCard visit={rightVisit}/><FindingsCard visit={leftVisit}/></div>
            {(hasDrawing(leftVisit)||hasDrawing(rightVisit))&&<details className="comparison-drawings"><summary>Compare signed clinical drawings</summary><div>{[rightVisit,leftVisit].map((visit,index)=><section key={visit?.encounterId||index}><h5>{visit?formatDate(visit.event!.signedAt)+' - '+visit.clinic:'No visit selected'}</h5>{visit&&hasDrawing(visit)?<ClinicalDrawingSheet value={visit.event!.drawings} disabled onChange={()=>{}} recordKey={'comparison-'+visit.event!.id} showCatalogueNote={false}/>:<p>No signed drawing for this visit.</p>}</section>)}</div></details>}
          </>}
        </section>
      </>}
    </div>}
  </section>;
}
