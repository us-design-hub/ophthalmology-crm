"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, History } from "lucide-react";
import { api } from "@/lib/api-client";
import type { DrawingHistory } from "@/lib/clinical";
import { formatDate } from "../patients/patients-workspace";
import { ClinicalDrawingSheet } from "./clinical-drawing-sheet";

export function PriorDrawingComparison({ patientId, currentEncounterId }: { patientId: string; currentEncounterId: string }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [entries, setEntries] = useState<DrawingHistory["entries"]>([]);
  const [selected, setSelected] = useState(0);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || loaded || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const result = await api<DrawingHistory>(`/api/clinical/drawing-history?patientId=${patientId}&encounterId=${currentEncounterId}`);
      setEntries(result.entries);
      setSelected(0);
      setLoaded(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const entry = entries[selected];
  return <section className="drawing-comparison">
    <button type="button" className="secondary-button drawing-comparison-toggle" aria-expanded={open} onClick={toggle}><History size={16} />Compare prior signed drawings{open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>
    {open && <div className="drawing-comparison-body">
      {busy && <p role="status">Loading prior drawings…</p>}
      {failed && <p role="alert">Prior drawings could not be loaded. Try again.</p>}
      {loaded && !entries.length && <p>No earlier signed drawings are available for this patient.</p>}
      {entry && <>
        <div className="drawing-comparison-header">
          <label>Prior visit<select aria-label="Prior drawing visit" value={selected} onChange={event => setSelected(Number(event.target.value))}>{entries.map((item, index) => <option key={item.eventId} value={index}>{formatDate(item.signedAt, true)} · {item.clinic}</option>)}</select></label>
          <p><strong>{entry.author}</strong><span>{formatDate(entry.signedAt, true)} · {entry.clinic}</span></p>
        </div>
        <ClinicalDrawingSheet value={entry.drawings} disabled onChange={() => {}} recordKey={entry.eventId} showCatalogueNote={false} />
      </>}
    </div>}
  </section>;
}
