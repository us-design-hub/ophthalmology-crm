"use client";

import { useEffect,useState } from "react";
import { Download,FileArchive,FileText,Paperclip,Upload } from "lucide-react";
import { api } from "@/lib/api-client";
import { DOCUMENT_LABELS,type DocumentCategory,type PatientDocumentData } from "@/lib/patient-documents";
import { formatDate } from "./patients-workspace";
import styles from "./patient-documents.module.css";

export function PatientDocuments({patientId,onChanged}:{patientId:string;onChanged?:()=>void}){
 const [data,setData]=useState<PatientDocumentData|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 async function refresh(){try{setData(await api(`/api/patient-documents?patientId=${patientId}`));setError("");}catch{setError("The patient digital file could not be loaded.");}}
 useEffect(()=>{void refresh();},[patientId]);
 async function upload(event:React.FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError("");try{const form=new FormData(event.currentTarget);form.set("patientId",patientId);form.set("capturedAt",new Date(String(form.get("capturedAt"))).toISOString());const response=await fetch("/api/patient-documents",{method:"POST",body:form,credentials:"same-origin"});if(!response.ok)throw new Error();event.currentTarget.reset();await refresh();onChanged?.();}catch{setError("The document could not be uploaded. Check the file, visit, category, and captured time.");}finally{setBusy(false);}}
 const firstEncounter=data?.encounters[0]?.id;
 return <section className={`${styles.documents} patient-documents`}>
  <div className="patient-documents-heading"><div><h3><Paperclip size={19}/>Patient digital file</h3><p>Scanned and photographed clinical records retained with this patient across departments.</p></div>{data?.canExport&&<div className="patient-document-exports"><a className="secondary-button" href={`/api/patient-documents?patientId=${patientId}&format=pdf`}><FileText size={16}/>Download PDF index</a><a className="secondary-button" href={`/api/patient-documents?patientId=${patientId}&format=zip`}><FileArchive size={16}/>Download originals</a></div>}</div>
  {error&&<p className="form-error" role="alert">{error}</p>}
  {!!data?.uploadCategories.length&&!!data.encounters.length&&<form className="patient-document-form" onSubmit={upload}>
   <h4><Upload size={17}/>Add a physical clinical record</h4><p>Uploads are append-only. To correct a record, upload a new document with an explanatory remark.</p>
   <div className="patient-document-fields"><label>Visit<select name="encounterId" defaultValue={firstEncounter} required>{data.encounters.map(item=><option value={item.id} key={item.id}>{formatDate(item.date,true)} / {item.clinic} / {item.stage.replaceAll("_"," ")}</option>)}</select></label>
   <label>Document type<select name="category" required>{data.uploadCategories.map(category=><option value={category} key={category}>{DOCUMENT_LABELS[category]}</option>)}</select></label>
   <label>Title<input name="title" required minLength={2} maxLength={160}/></label>
   <label>Captured at<input name="capturedAt" type="datetime-local" required max={new Date().toISOString().slice(0,16)}/></label>
   <label className="patient-document-file">JPEG, PNG, or PDF (maximum 5 MB)<input name="file" type="file" accept="image/jpeg,image/png,application/pdf" required/></label>
   <label className="patient-document-remarks">Remarks<textarea name="remarks" maxLength={2000}/></label></div>
   <button className="primary-button" disabled={busy}>{busy?"Uploading...":"Upload to patient file"}</button>
  </form>}
  <div className="patient-document-list">{data?.documents.map(item=><article key={item.id}><span className="patient-document-icon"><FileText size={18}/></span><div><strong>{item.title}</strong><span>{DOCUMENT_LABELS[item.category as DocumentCategory]} / {formatDate(item.capturedAt,true)}</span><small>{item.clinic} / {item.actor} ({item.actorRole.replaceAll("_"," ")})</small>{item.remarks&&<p>{item.remarks}</p>}<code>SHA-256: {item.hash}</code></div><div><a className="text-button" target="_blank" rel="noreferrer" href={`/api/patient-documents?id=${item.id}`}>Preview</a><a className="text-button" href={`/api/patient-documents?id=${item.id}&download=1`}><Download size={14}/>Download</a></div></article>)}</div>
  {data?.documents.length===0&&<p className="intake-empty">No physical clinical documents have been uploaded for this patient yet.</p>}
  {!data&&!error&&<p>Loading patient digital file...</p>}
 </section>;
}
