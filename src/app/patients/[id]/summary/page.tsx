import {redirect,notFound} from 'next/navigation';
import {pageSession} from '@/server/auth';
import {getPatient} from '@/server/patient-service';
import {withTenant} from '@/server/db';
import {audit} from '@/server/audit';
import {ApiError} from '@/server/http';
import {PrintButton} from '@/components/operations/print-button';
export const dynamic='force-dynamic';
export default async function Summary({params}:{params:Promise<{id:string}>}){const session=await pageSession();if(!session)redirect('/login');if(session.user.mustChangePassword)redirect('/');if(!session.user.permissions.includes('patient:read')||!session.user.permissions.includes('reports:read'))notFound();let p;try{p=await getPatient(session.user,(await params).id,{});}catch(e){if(e instanceof ApiError&&e.status===404)notFound();throw e;}await withTenant(session.user.tenantId,session.user.id,db=>audit(db,{tenantId:session.user.tenantId,actorId:session.user.id,action:'patient.summary_exported',entityType:'patient',entityId:p.id,metadata:{rowCount:1}}));return <main className="ops-receipt"><PrintButton/><article className="panel ops-receipt-paper"><header><div><h1>{session.user.tenantName}</h1><h2>Patient registration summary</h2></div></header><h2>{p.givenName} {p.familyName}</h2><p>MRN: {p.mrn}</p><p>Date of birth: {p.dob}{p.dobEstimated?' (estimated)':''} · Gender: {p.gender}</p><p>Identity: {p.identifierType} {p.identifierMasked}</p><p>Phone: {p.phone}</p><p>Address: {p.address} {p.city}</p><p>Next of kin: {p.nextOfKinName} {p.nextOfKinPhone}</p><h3>Active alerts</h3>{p.flags.length?p.flags.map((f,i)=><p key={i}><strong>{f.type}: </strong>{f.value}</p>):<p>No recorded active flags.</p>}<footer>Powered by Logic box</footer></article></main>;}
