'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CircleHelp, RefreshCw, X } from 'lucide-react';
import { api } from '@/lib/api-client';
import type { MessageKey } from '@/lib/messages';
import { useLocale } from '../locale-provider';
import { ErrorNotice, intakeError } from '../intake/shared';
export const money = (amount: number) => new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(amount);
export function usePreview<T>(resource: string) {
  const [data, setData] = useState<T | null>(null), [error, setError] = useState<MessageKey | null>(null), [generation, setGeneration] = useState(0);
  useEffect(() => { const controller = new AbortController(); setError(null); setData(null); api<T>(`/api/previews/${resource}`, undefined, { signal: controller.signal }).then(setData).catch(error => { if (!controller.signal.aborted) setError(intakeError(error)); }); return () => controller.abort(); }, [resource, generation]);
  return { data, error, refresh: () => setGeneration(value => value + 1) };
}
export function PreviewState({ error, refresh }: { error: MessageKey | null; refresh: () => void }) { const { t } = useLocale(); return <div className="panel ops-loading"><ErrorNotice error={error}/>{!error && <p role="status">{t('intakeLoading')}</p>}{error && <button type="button" className="secondary-button" onClick={refresh}><RefreshCw size={15}/>{t('refresh')}</button>}</div>; }
export function SampleBanner({ asOf }: { asOf: string }) { const { t } = useLocale(); return <div className="ops-banner"><CircleHelp size={21}/><div><strong>{t('opsSample')}</strong><p>{t('opsBoundary')}</p></div><small>{t('opsSnapshot')}<b>{asOf}</b></small></div>; }
export function PreviewActions({ actions }: { actions: MessageKey[] }) { const { t } = useLocale(); return <div className="ops-disabled"><div>{actions.map(action => <button type="button" className="secondary-button" disabled title={t('opsPreviewDisabled')} key={action}>{t(action)}</button>)}</div><small>{t('opsPreviewDisabled')}</small></div>; }
export function PreviewDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) { const { t } = useLocale(); const ref = useRef<HTMLDialogElement>(null); useEffect(() => { ref.current?.showModal(); }, []); return <dialog ref={ref} className="intake-dialog ops-dialog" aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }}><div className="patient-record-header"><div><p className="eyebrow">{t('opsSample')}</p><h2>{title}</h2></div><button type="button" className="icon-button" aria-label={t('opsClose')} onClick={onClose}><X size={20}/></button></div><div className="intake-dialog-body">{children}</div></dialog>; }
export function Metrics({ items }: { items: { label: string; value: string | number; note?: string }[] }) { return <div className="ops-metrics">{items.map(item => <article className="panel" key={item.label}><span>{item.label}</span><strong>{item.value}</strong>{item.note && <small>{item.note}</small>}</article>)}</div>; }
