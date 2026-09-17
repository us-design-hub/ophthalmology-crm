import { notFound } from 'next/navigation';
import { verifyPrescription } from '@/server/clinical-service';
import { consumeLimit } from '@/server/auth';
export const dynamic='force-dynamic';
export const metadata={title:'OpenEyes · Signature verification',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function Verification({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{token?:string}>}){
 await consumeLimit('public-prescription-verification',100,60);const {id}=await params,{token}=await searchParams;const result=await verifyPrescription(id,token);if(!result)notFound();
 return <main className="signature-verification"><p className="eyebrow">OPENEYES · SIGNATURE VERIFICATION</p><h1>Signed prescription</h1><p>{result.hospital}</p><dl><dt>Signed at (PKT)</dt><dd>{new Date(result.signedAt).toLocaleString('en-GB',{timeZone:'Asia/Karachi',hour12:false})}</dd><dt>Prescription addenda</dt><dd>{result.addendumCount}</dd><dt>Original content hash</dt><dd className="signature-hash">{result.contentHash}</dd></dl><p>Match this hash to the prescription PDF. Patient identity and medication details are not displayed here.</p><strong>Powered by Logic box</strong></main>;
}
