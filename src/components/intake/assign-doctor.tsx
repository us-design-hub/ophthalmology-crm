"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { Clinic } from "@/lib/intake";
import type { MessageKey } from "@/lib/messages";
import { useLocale } from "../locale-provider";
import { intakeError } from "./shared";

/** Doctors per clinic, loaded once for every card on the board. */
export function useClinicDoctors(enabled: boolean) {
  const [doctors, setDoctors] = useState<Map<string, Clinic["doctors"]>>(new Map());
  useEffect(() => { if (!enabled) return; const controller = new AbortController(); api<{ clinics: Clinic[] }>("/api/intake/clinics", undefined, { signal: controller.signal }).then(result => setDoctors(new Map(result.clinics.map(clinic => [clinic.id, clinic.doctors])))).catch(() => { /* the control stays hidden */ }); return () => controller.abort(); }, [enabled]);
  return doctors;
}

/** Choosing a doctor saves straight away; the queue refreshes to show the new owner. */
export function AssignDoctor({ item, doctors, onDone, onError }: { item: { id: string; version: number; doctorId: string | null; doctor: string | null }; doctors: Clinic["doctors"]; onDone: () => void; onError: (error: MessageKey) => void }) {
  const { t } = useLocale(); const [busy, setBusy] = useState(false);
  // Until the roster loads (or for a clinic with no doctors) the card just shows the current owner.
  if (!doctors.length) return <>{item.doctor ?? t("doctorNotAssigned")}</>;
  async function assign(doctorId: string) {
    if (!doctorId) return;
    setBusy(true);
    try { await api("/api/intake/assign-doctor", { id: item.id, version: item.version, doctorId }); onDone(); }
    catch (error) { onError(intakeError(error)); }
    finally { setBusy(false); }
  }
  return <label className="assign-doctor"><span className="sr-only">{t("assignDoctor")}</span><select aria-label={t("assignDoctor")} value={item.doctorId ?? ""} disabled={busy} onChange={event => void assign(event.target.value)}>
    {!item.doctorId && <option value="">{t("assignDoctor")}…</option>}{doctors.map(doctor => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}</select></label>;
}
