'use client';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { MessageKey } from '@/lib/messages';
import { useLocale } from './locale-provider';

export const REASON_MIN = 8;

/**
 * Captures a free-text reason that is written to the audit trail.
 *
 * Replaces window.prompt(), which could not enforce the minimum length, could
 * not show why input was rejected, and returned null on Cancel in a way that
 * silently abandoned the whole action. Here the confirm button stays disabled
 * until the reason is long enough, and cancelling is explicit.
 */
export function ReasonDialog({ title, onConfirm, onClose, busy = false }: {
  title: MessageKey;
  onConfirm: (reason: string) => void;
  onClose: () => void;
  busy?: boolean;
}) {
  const { t } = useLocale();
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  useEffect(() => { ref.current?.showModal(); }, []);
  const trimmed = reason.trim();
  const tooShort = trimmed.length < REASON_MIN;
  return <dialog ref={ref} className="confirm-dialog reason-dialog" aria-labelledby="reason-title" onCancel={onClose}>
    <form method="dialog" onSubmit={event => { event.preventDefault(); if (!tooShort && !busy) onConfirm(trimmed); }}>
      <div className="reason-dialog-head">
        <h2 id="reason-title">{t(title)}</h2>
        <button type="button" className="icon-button" aria-label={t('reasonCancel')} onClick={onClose}><X size={20}/></button>
      </div>
      <label className="reason-field">
        <span>{t('reasonLabel')}</span>
        <textarea
          autoFocus
          value={reason}
          maxLength={500}
          minLength={REASON_MIN}
          required
          aria-describedby="reason-hint"
          aria-invalid={touched && tooShort}
          onBlur={() => setTouched(true)}
          onChange={event => setReason(event.target.value)}
        />
      </label>
      <p id="reason-hint" className="reason-hint">{t('reasonHint')}</p>
      {touched && tooShort && <p className="form-error" role="alert">{t('reasonTooShort')}</p>}
      <div>
        <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>{t('reasonCancel')}</button>
        <button type="submit" className="primary-button" disabled={tooShort || busy}>{t('reasonConfirm')}</button>
      </div>
    </form>
  </dialog>;
}
