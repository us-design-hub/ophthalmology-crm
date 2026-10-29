import "server-only";

import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { ApiError } from "./http";

type ExportData={patient:{id:string;mrn:string;name:string;dob:string;gender:string;registeredAt:string};documents:{id:string;category:string;title:string;remarks:string;capturedAt:string;uploadedAt:string;filename:string;mime:string;hash:string;actor:string;actorRole:string;clinic:string;visitDate:string}[];activity:{id:string;kind:string;at:string;summary:string;clinic:string;author:string;status:string}[]};
const esc=(value:unknown)=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]!));
const date=(value:string)=>new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Karachi",dateStyle:"medium",timeStyle:"short",hour12:false}).format(new Date(value));

export function patientFileHtml(data:ExportData,generatedBy:string){return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Patient digital file</title><style>
@page{size:A4;margin:16mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#17223b}header{border-bottom:3px solid #922d43;padding-bottom:14px}h1{margin:0 0 6px;font-size:26px}.meta{background:#f3f5f7;padding:14px;margin:16px 0;line-height:1.8}.entry{border:1px solid #d9dee5;padding:12px;margin:10px 0;break-inside:avoid}.entry h2{font-size:14px;margin:0 0 8px}.tag{color:#922d43;font-weight:bold;text-transform:uppercase;font-size:10px}.remarks{white-space:pre-wrap}.hash{font-size:9px;color:#647084;overflow-wrap:anywhere}footer{margin-top:20px;border-top:1px solid #d9dee5;padding-top:9px;color:#647084;font-size:10px}</style></head><body>
<header><h1>Patient digital file</h1><strong>${esc(data.patient.name)}</strong> / MRN ${esc(data.patient.mrn)}</header>
<section class="meta">DOB: ${esc(data.patient.dob)} / Gender: ${esc(data.patient.gender)}<br>Registered: ${esc(date(data.patient.registeredAt))} PKT<br>Generated: ${esc(date(new Date().toISOString()))} PKT by ${esc(generatedBy)}</section>
<h2>Longitudinal clinical timeline (${data.activity.length})</h2>${data.activity.length?data.activity.map(item=>`<section class="entry"><span class="tag">${esc(item.kind.replaceAll("_"," "))}</span><h2>${esc(item.summary)}</h2><div>${esc(date(item.at))} PKT / ${esc(item.clinic)} / ${esc(item.author)} / ${esc(item.status.replaceAll("_"," "))}</div></section>`).join(""):"<p>No clinical activity is available in the assigned facilities.</p>"}
<h2>Uploaded physical records (${data.documents.length})</h2>${data.documents.length?data.documents.map(d=>`<section class="entry"><span class="tag">${esc(d.category.replaceAll("_"," "))}</span><h2>${esc(d.title)}</h2><div>${esc(date(d.capturedAt))} PKT / ${esc(d.clinic)} / ${esc(d.actor)} (${esc(d.actorRole.replaceAll("_"," "))})</div>${d.remarks?`<p class="remarks">${esc(d.remarks)}</p>`:""}<div>${esc(d.filename)} / ${esc(d.mime)}</div><p class="hash">SHA-256: ${esc(d.hash)}</p></section>`).join(""):"<p>No uploaded physical records.</p>"}
<footer>Patient ${esc(data.patient.id)} / This export is a point-in-time copy. The application audit trail records its generation.</footer></body></html>`}

let generating=false;
export async function patientFilePdf(data:ExportData,generatedBy:string){
 if(generating)throw new ApiError(429,"pdfBusy");generating=true;
 try{let executablePath=process.env.PDF_CHROMIUM_EXECUTABLE;
  if(!executablePath&&existsSync(resolve(".playwright"))){const folder=readdirSync(resolve(".playwright")).find(name=>name.startsWith("chromium_headless_shell-"));if(folder){const local=join(resolve(".playwright"),folder,"chrome-headless-shell-win64","chrome-headless-shell.exe");if(existsSync(local))executablePath=local;}}
  const browser=await chromium.launch({headless:true,executablePath,timeout:15000});const deadline=setTimeout(()=>void browser.close(),30000);
  try{const context=await browser.newContext({javaScriptEnabled:false,serviceWorkers:"block"});await context.route("**/*",route=>route.abort());const page=await context.newPage();await page.setContent(patientFileHtml(data,generatedBy),{waitUntil:"load",timeout:15000});return await page.pdf({format:"A4",printBackground:true,preferCSSPageSize:true});}finally{clearTimeout(deadline);await browser.close();}
 }finally{generating=false;}
}
