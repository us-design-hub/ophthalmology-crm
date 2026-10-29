"use client";

import { useState } from "react";
import { CheckCircle2, Paperclip, Upload } from "lucide-react";
import { ClientApiError } from "@/lib/api-client";
import { DOCUMENT_LABELS, type DocumentCategory } from "@/lib/patient-documents";
import styles from "./workflow-document-upload.module.css";

export async function uploadWorkflowDocument(input:{patientId:string;encounterId:string;category:DocumentCategory;title:string;remarks?:string;file:File;capturedAt?:string}){
 const form=new FormData();form.set("patientId",input.patientId);form.set("encounterId",input.encounterId);form.set("category",input.category);form.set("title",input.title);form.set("remarks",input.remarks??"");form.set("capturedAt",input.capturedAt??new Date().toISOString());form.set("file",input.file);
 const response=await fetch("/api/patient-documents",{method:"POST",body:form,credentials:"same-origin"});if(!response.ok){const body=await response.json().catch(()=>({}));if(response.status===409&&body.error==="documentDuplicate")return body;throw new ClientApiError(body.error??"serviceUnavailable",response.status,body);}return response.json();
}

export function WorkflowDocumentUpload({patientId,encounterId,category,defaultTitle,onUploaded}:{patientId:string;encounterId:string;category:DocumentCategory;defaultTitle:string;onUploaded?:()=>void}){
 const [title,setTitle]=useState(defaultTitle),[remarks,setRemarks]=useState(""),[file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[saved,setSaved]=useState(false);
 async function submit(event:React.FormEvent){event.preventDefault();if(!file)return;setBusy(true);setError("");setSaved(false);try{await uploadWorkflowDocument({patientId,encounterId,category,title,remarks,file});setFile(null);setRemarks("");setSaved(true);onUploaded?.();}catch{setError("The document could not be uploaded. Use a JPEG, PNG, or PDF up to 5 MB.");}finally{setBusy(false);}}
 return <details className={`${styles.upload} workflow-document-upload`}><summary><Paperclip size={16}/>Upload handwritten or scanned document</summary><form onSubmit={submit}><p>{DOCUMENT_LABELS[category]}. It will also appear in Patient 360.</p><div className="workflow-document-fields"><label>Document title<input required minLength={2} maxLength={160} value={title} onChange={event=>setTitle(event.target.value)}/></label><label>File<input required type="file" accept="image/jpeg,image/png,application/pdf" onChange={event=>{setFile(event.target.files?.[0]??null);setSaved(false);}}/></label><label>Remarks<textarea maxLength={2000} value={remarks} onChange={event=>setRemarks(event.target.value)}/></label></div>{error&&<p className="form-error" role="alert">{error}</p>}{saved&&<p className="registration-success"><CheckCircle2 size={15}/>Added to the patient digital file.</p>}<button className="secondary-button" disabled={busy||!file}><Upload size={15}/>{busy?"Uploading...":"Upload document"}</button></form></details>;
}
