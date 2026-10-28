"use client";
import { useEffect, useRef, useState } from "react";
import { ScanEye } from "lucide-react";
import { api } from "@/lib/api-client";
import { MACHINE_EYES, type Machine, type MachineEye, type MachineOrderInput } from "@/lib/machines";
import type { MessageKey } from "@/lib/messages";
import { useLocale } from "../locale-provider";

/** Active machines, loaded once per screen. */
export function useMachines() {
  const [machines, setMachines] = useState<Machine[]>([]);
  useEffect(() => { const controller = new AbortController(); api<{ machines: Machine[] }>("/api/machines/list", undefined, { signal: controller.signal }).then(result => setMachines(result.machines.filter(machine => machine.active))).catch(() => { /* the picker stays empty */ }); return () => controller.abort(); }, []);
  return machines;
}

/**
 * Tick the machine tests a patient needs, each for one or both eyes. Tests this
 * clinic usually needs start ticked; a person always confirms the final list.
 */
export function MachinePicker({ facilityId, value, onChange, disabled = false }: { facilityId: string; value: MachineOrderInput[]; onChange: (orders: MachineOrderInput[]) => void; disabled?: boolean }) {
  const { t } = useLocale(); const machines = useMachines(); const suggested = useRef(false);
  // Pre-tick the clinic's usual tests once, when the list first arrives.
  useEffect(() => {
    if (suggested.current || !machines.length) return; suggested.current = true;
    onChange(machines.filter(machine => machine.suggestedFacilityIds.includes(facilityId)).map(machine => ({ machineId: machine.id, eye: "OU" })));
  }, [machines, facilityId, onChange]);
  if (!machines.length) return null;
  const chosen = new Map(value.map(order => [order.machineId, order.eye]));
  const toggle = (id: string, on: boolean) => onChange(on ? [...value, { machineId: id, eye: "OU" }] : value.filter(order => order.machineId !== id));
  const setEye = (id: string, eye: MachineEye) => onChange(value.map(order => order.machineId === id ? { ...order, eye } : order));
  return <fieldset className="machine-picker" disabled={disabled}><legend><ScanEye size={16}/>{t("machineTestsLabel")}</legend><p className="intake-help">{t("machineTestsHelp")}</p>
    <div className="machine-options">{machines.map(machine => { const eye = chosen.get(machine.id); return <div key={machine.id} className={`machine-option ${eye ? "is-selected" : ""}`}>
      <label><input type="checkbox" checked={!!eye} onChange={event => toggle(machine.id, event.target.checked)}/><span><strong>{machine.name}</strong><small>{[machine.purpose, machine.needsDilation && t("machineNeedsDilationShort"), machine.needsDoctorApproval && t("machineNeedsApprovalShort")].filter(Boolean).join(" · ")}</small></span></label>
      {eye && <select aria-label={`${t("machineEyeLabel")}: ${machine.name}`} value={eye} onChange={event => setEye(machine.id, event.target.value as MachineEye)}>{MACHINE_EYES.map(option => <option key={option} value={option}>{t(`eye_${option}` as MessageKey)}</option>)}</select>}
    </div>; })}</div></fieldset>;
}
