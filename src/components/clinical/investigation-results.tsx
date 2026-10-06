import { FileText,FlaskConical } from 'lucide-react';
import { INVESTIGATION_CATALOGUE,type InvestigationResult } from '@/lib/investigations';
import { formatDate } from '../patients/patients-workspace';

export function InvestigationResults({results}:{results:InvestigationResult[]}){
 return <section className="clinical-section investigation-results"><h3><FlaskConical size={18}/>Diagnostic investigations</h3>{results.length===0?<p className="intake-help">No structured investigations were recorded for this encounter.</p>:<div className="investigation-results-list">{results.map(result=><article key={result.id}><header><strong>{INVESTIGATION_CATALOGUE[result.kind].label} · {result.eye}</strong><span>{formatDate(result.performedAt,true)} · {result.author}</span></header><p>{result.findings}</p>{Object.keys(result.measurements).length>0&&<dl>{Object.entries(result.measurements).map(([key,value])=><div key={key}><dt>{key.replace(/([A-Z])/g,' $1')}</dt><dd>{String(value)}</dd></div>)}</dl>}{result.device&&<small>Device: {result.device}</small>}{result.evidence.length>0&&<div className="investigation-result-evidence">{result.evidence.map(file=><a key={file.id} href={'/api/intake/investigation-evidence?id='+file.id} target="_blank" rel="noreferrer"><FileText size={14}/>{file.filename}</a>)}</div>}</article>)}</div>}</section>;
}
