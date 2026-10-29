import { z } from "zod";

export const LENS_TYPES = ["distance", "near", "bifocal", "progressive", "occupational"] as const;
export type LensType = typeof LENS_TYPES[number];

const optionalNumber = (minimum: number, maximum: number) => z.number().min(minimum).max(maximum).nullable();
export const opticsReferralInputSchema = z.object({
  encounterId: z.uuid(), encounterVersion: z.number().int().positive(), doctorSuggestion: z.boolean(),
  odSphere: optionalNumber(-30, 30), odCylinder: optionalNumber(-10, 10), odAxis: optionalNumber(0, 180), odAdd: optionalNumber(0, 6), odPrism: z.string().trim().max(40),
  osSphere: optionalNumber(-30, 30), osCylinder: optionalNumber(-10, 10), osAxis: optionalNumber(0, 180), osAdd: optionalNumber(0, 6), osPrism: z.string().trim().max(40),
  pd: optionalNumber(40, 80), lensType: z.enum(LENS_TYPES).nullable(), instructions: z.string().trim().max(2000), referralNote: z.string().trim().max(1000),
}).strict().superRefine((value, context) => {
  if (value.odCylinder && value.odAxis === null) context.addIssue({ code: "custom", path: ["odAxis"], message: "Axis is required when cylinder is entered" });
  if (value.osCylinder && value.osAxis === null) context.addIssue({ code: "custom", path: ["osAxis"], message: "Axis is required when cylinder is entered" });
  if (value.doctorSuggestion && (value.odSphere === null || value.osSphere === null || value.pd === null || value.lensType === null)) context.addIssue({ code: "custom", path: ["doctorSuggestion"], message: "Suggested prescription requires both eyes, PD and lens type" });
});
export type OpticsReferralInput = z.infer<typeof opticsReferralInputSchema>;

export type RefractionEye = { sphere?: number | null; cylinder?: number | null; axis?: number | null; add?: number | null; pd?: number | null; bcva?: string; corrected?: string; near?: string; glasses?: string };
export type OpticsWorkup = { source: "senior" | "technician"; savedAt: string; reviewedAt: string | null; pd: number | null; OD: RefractionEye; OS: RefractionEye } | null;
export type OpticsReferral = Omit<OpticsReferralInput, "encounterVersion"> & {
  id: string; patientId: string; doctorEventId: string; patient: string; mrn: string; dob: string; gender: string; phone: string;
  clinic: string; doctor: string; markedAt: string; workup: OpticsWorkup; flags: { type: "allergy" | "risk"; value: string }[];
};
