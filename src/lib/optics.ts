import { z } from "zod";

export const LENS_TYPES = ["distance", "near", "bifocal", "progressive", "occupational"] as const;
export const OPTICS_STATUSES = ["issued", "in_progress", "ready", "collected", "cancelled"] as const;
export type LensType = typeof LENS_TYPES[number];
export type OpticsStatus = typeof OPTICS_STATUSES[number];

const optionalNumber = (minimum: number, maximum: number) => z.number().min(minimum).max(maximum).nullable();
export const spectacleInputSchema = z.object({
  encounterId: z.uuid(), encounterVersion: z.number().int().positive(),
  odSphere: z.number().min(-30).max(30), odCylinder: optionalNumber(-10, 10), odAxis: optionalNumber(0, 180), odAdd: optionalNumber(0, 6), odPrism: z.string().trim().max(40),
  osSphere: z.number().min(-30).max(30), osCylinder: optionalNumber(-10, 10), osAxis: optionalNumber(0, 180), osAdd: optionalNumber(0, 6), osPrism: z.string().trim().max(40),
  pd: z.number().min(40).max(80), lensType: z.enum(LENS_TYPES), instructions: z.string().trim().max(2000),
}).strict().superRefine((value, context) => {
  if (value.odCylinder && value.odAxis === null) context.addIssue({ code: "custom", path: ["odAxis"], message: "Axis is required when cylinder is entered" });
  if (value.osCylinder && value.osAxis === null) context.addIssue({ code: "custom", path: ["osAxis"], message: "Axis is required when cylinder is entered" });
});
export type SpectacleInput = z.infer<typeof spectacleInputSchema>;

export type SpectacleOrder = Omit<SpectacleInput, "encounterVersion"> & {
  id: string; version: number; patientId: string; doctorEventId: string; patient: string; mrn: string;
  dob: string; gender: string; phone: string; clinic: string; doctor: string; prescribedAt: string;
  status: OpticsStatus; dispensingNote: string; statusBy: string | null; statusAt: string; flags: { type: "allergy" | "risk"; value: string }[];
};
