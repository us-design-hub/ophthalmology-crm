import { z } from "zod";

/** A machine the hospital runs, as listed in Administration. */
export type Machine = {
  id: string; name: string; purpose: string; needsDilation: boolean; needsDoctorApproval: boolean;
  active: boolean; displayOrder: number; revision: number; suggestedFacilityIds: string[];
};
export const MACHINE_EYES = ["OD", "OS", "OU"] as const;
export type MachineEye = typeof MACHINE_EYES[number];
export type MachineOrderStatus = "requested" | "awaiting_approval" | "ordered" | "done" | "not_done" | "declined";

export const machineOrderInput = z.object({ machineId: z.uuid(), eye: z.enum(MACHINE_EYES) }).strict();
export type MachineOrderInput = z.infer<typeof machineOrderInput>;
export const machineSchema = z.object({
  id: z.uuid().optional(), revision: z.number().int().positive().optional(),
  name: z.string().trim().min(2).max(80), purpose: z.string().trim().max(160).default(""),
  needsDilation: z.boolean(), needsDoctorApproval: z.boolean(), active: z.boolean().default(true),
  displayOrder: z.number().int().min(0).max(1000).default(100), suggestedFacilityIds: z.array(z.uuid()).max(50).default([]),
}).strict();

/** One machine test on a visit, as the queue card, doctor and operator see it. */
export type MachineOrder = {
  id: string; version: number; machineId: string; machine: string; needsDilation: boolean; eye: MachineEye; status: MachineOrderStatus;
  orderedBy: string; orderedAt: string; approvedBy: string | null; findings: string; keyValues: string; note: string;
  resultedBy: string | null; resultedAt: string | null; reports: { id: string; filename: string; mime: string }[];
};
export type MachineWorkItem = MachineOrder & {
  encounterId: string; patientId: string; name: string; mrn: string; gender: string; dob: string; clinic: string; stage: string;
  checkedInAt: string; dilationReadyAt: string | null; visitType: string; flags: { type: "allergy" | "risk"; value: string }[];
};
