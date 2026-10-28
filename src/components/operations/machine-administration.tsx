"use client";
import { useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { api } from "@/lib/api-client";
import type { Machine } from "@/lib/machines";
import type { MessageKey } from "@/lib/messages";
import { useLocale } from "../locale-provider";
import { ErrorNotice, intakeError } from "../intake/shared";

type Clinic = { id: string; name: string };
const blank: Omit<Machine, "id" | "revision"> = { name: "", purpose: "", needsDilation: false, needsDoctorApproval: false, active: true, displayOrder: 100, suggestedFacilityIds: [] };

/**
 * The hospital's machines. Each says whether the eye must be dilated first and
 * whether a doctor must approve it, and which clinics usually need it (those
 * tests come pre-ticked for the senior technician).
 */
export function MachineAdministration({ clinics, canWrite }: { clinics: Clinic[]; canWrite: boolean }) {
  const { t } = useLocale();
  const [machines, setMachines] = useState<Machine[] | null>(null), [editing, setEditing] = useState<Partial<Machine> | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<MessageKey | null>(null), [refresh, setRefresh] = useState(0);
  useEffect(() => { const controller = new AbortController(); api<{ machines: Machine[] }>("/api/machines/list", undefined, { signal: controller.signal }).then(result => setMachines(result.machines)).catch(value => { if (!controller.signal.aborted) setError(intakeError(value)); }); return () => controller.abort(); }, [refresh]);
  const clinicName = new Map(clinics.map(clinic => [clinic.id, clinic.name]));
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!editing) return;
    setBusy(true); setError(null);
    try { await api("/api/machines/save", { ...blank, ...editing }); setEditing(null); setRefresh(value => value + 1); }
    catch (value) { setError(intakeError(value)); }
    finally { setBusy(false); }
  }
  const set = <K extends keyof Machine>(key: K, value: Machine[K]) => setEditing(current => ({ ...current, [key]: value }));

  return <section className="panel">
    <div className="registry-heading"><div><h2>{t("adminTabMachines")}</h2><p className="admin-note">{t("machinesAdminNote")}</p></div>{canWrite && <button type="button" className="primary-button" onClick={() => setEditing({ ...blank })}><Plus size={16}/>{t("addMachine")}</button>}</div>
    <ErrorNotice error={error}/>
    {editing && <form className="admin-form" onSubmit={save}>
      <div className="admin-grid">
        <label>{t("machineName")}<input required minLength={2} maxLength={80} value={editing.name ?? ""} onChange={event => set("name", event.target.value)}/></label>
        <label>{t("machinePurpose")}<input maxLength={160} value={editing.purpose ?? ""} onChange={event => set("purpose", event.target.value)}/></label>
        <label>{t("machineDisplayOrder")}<input type="number" min={0} max={1000} value={editing.displayOrder ?? 100} onChange={event => set("displayOrder", Number(event.target.value))}/></label>
      </div>
      <fieldset><legend>{t("machineRules")}</legend>
        <label className="admin-check"><input type="checkbox" checked={!!editing.needsDilation} onChange={event => set("needsDilation", event.target.checked)}/>{t("machineNeedsDilation")}</label>
        <label className="admin-check"><input type="checkbox" checked={!!editing.needsDoctorApproval} onChange={event => set("needsDoctorApproval", event.target.checked)}/>{t("machineNeedsApproval")}</label>
        <label className="admin-check"><input type="checkbox" checked={editing.active ?? true} onChange={event => set("active", event.target.checked)}/>{t("machineActive")}</label>
      </fieldset>
      <fieldset><legend>{t("machineSuggestedFor")}</legend>{clinics.map(clinic => <label className="admin-check" key={clinic.id}><input type="checkbox" checked={editing.suggestedFacilityIds?.includes(clinic.id) ?? false} onChange={event => set("suggestedFacilityIds", event.target.checked ? [...(editing.suggestedFacilityIds ?? []), clinic.id] : (editing.suggestedFacilityIds ?? []).filter(id => id !== clinic.id))}/>{clinic.name}</label>)}</fieldset>
      <div className="admin-actions"><button type="submit" className="primary-button" disabled={busy}>{t(busy ? "adminSaving" : "adminSaveChanges")}</button><button type="button" className="secondary-button" disabled={busy} onClick={() => setEditing(null)}>{t("adminCancel")}</button></div>
    </form>}
    <div className="intake-table-wrap"><table className="patient-table"><thead><tr><th>{t("machineName")}</th><th>{t("machineRules")}</th><th>{t("machineSuggestedFor")}</th><th>{t("adminColStatus")}</th>{canWrite && <th/>}</tr></thead>
      <tbody>{machines?.map(machine => <tr key={machine.id}><td><strong>{machine.name}</strong><small>{machine.purpose}</small></td>
        <td>{[machine.needsDilation && t("machineNeedsDilationShort"), machine.needsDoctorApproval && t("machineNeedsApprovalShort")].filter(Boolean).join(" · ") || "—"}</td>
        <td>{machine.suggestedFacilityIds.map(id => clinicName.get(id)).filter(Boolean).join(", ") || "—"}</td>
        <td>{t(machine.active ? "machineActiveShort" : "machineInactiveShort")}</td>
        {canWrite && <td><button type="button" className="text-button" onClick={() => setEditing(machine)}><Pencil size={14}/>{t("machineEdit")}</button></td>}</tr>)}</tbody></table></div>
  </section>;
}
