import { notFound, redirect } from 'next/navigation';
import { pageSession } from '@/server/auth';
import { sampleReceipt } from '@/server/operations-service';
import { ApiError } from '@/server/http';
import { SampleReceipt } from '@/components/operations/receipt';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sample receipt | OpenEyes', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await pageSession(); if (!session) redirect('/login'); if(session.user.mustChangePassword)redirect('/');
  if (!session.user.permissions.includes('preview:billing')) notFound();
  try { return <SampleReceipt {...await sampleReceipt(session.user, (await params).id)}/>; }
  catch (error) { if (error instanceof ApiError && (error.status === 404 || error.status === 403)) notFound(); throw error; }
}
