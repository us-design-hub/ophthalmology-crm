import {redirect,notFound} from 'next/navigation';
import {pageSession} from '@/server/auth';
import {report} from '@/server/reports-service';
import {ApiError} from '@/server/http';
import {todayKarachi} from '@/lib/patients';
import {PrintButton} from '@/components/operations/print-button';
export const dynamic='force-dynamic';
export default async function ReportPage({params,searchParams}:{params:Promise<{kind:string}>;searchParams:Promise<{date?:string}>}){const session=await pageSession();if(!session)redirect('/login');if(session.user.mustChangePassword)redirect('/');let data;try{data=await report(session.user,(await params).kind,(await searchParams).date||todayKarachi(),{});}catch(e){if(e instanceof ApiError&&[400,403,404].includes(e.status))notFound();throw e;}const columns=Object.keys(data.rows[0]||{});return <main className="ops-receipt"><PrintButton/><article className="panel ops-receipt-paper"><header><div><h1>{session.user.tenantName}</h1><h2>{data.title}</h2><p>{data.date} · {data.rows.length} records</p></div></header>{!data.rows.length?<p>No records match this report.</p>:<div className="patient-table-wrap"><table className="patient-table"><thead><tr>{columns.map(c=><th key={c}>{c.replaceAll('_',' ')}</th>)}</tr></thead><tbody>{data.rows.map((r,i)=><tr key={i}>{columns.map(c=><td key={c}>{r[c] instanceof Date?(r[c] as Date).toLocaleString('en-PK',{timeZone:'Asia/Karachi'}):String(r[c]??'')}</td>)}</tr>)}</tbody></table></div>}<footer>Powered by Logic box</footer></article></main>;}
