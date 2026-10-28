import { z } from "zod";

/** Point-of-care tests the lab assistant runs during a visit. */
export const LAB_TESTS = ["bp", "sugar"] as const;
export type LabTest = typeof LAB_TESTS[number];
/** Why a test was ordered: an automatic rule, or a member of staff. */
export const LAB_REASONS = ["diabetes", "hypertension", "age_40", "glaucoma", "pre_op", "manual"] as const;
export type LabReason = typeof LAB_REASONS[number];

export const bpResultSchema = z.object({ systolic: z.number().int().min(50).max(300), diastolic: z.number().int().min(30).max(200) }).strict()
  .refine(value => value.systolic > value.diastolic, "systolicAboveDiastolic");
export const sugarResultSchema = z.object({ value: z.number().int().min(20).max(700), kind: z.enum(["random", "fasting"]) }).strict();
export type BpResult = z.infer<typeof bpResultSchema>;
export type SugarResult = z.infer<typeof sugarResultSchema>;
export type LabResult = BpResult | SugarResult;

// Adult screening thresholds: BP 140/90 or above, or below 90/60; sugar below
// 70 mg/dL, or at least 200 random / 126 fasting.
export function isAbnormal(test: LabTest, result: LabResult): boolean {
  if (test === "bp") { const { systolic, diastolic } = result as BpResult; return systolic >= 140 || diastolic >= 90 || systolic < 90 || diastolic < 60; }
  const { value, kind } = result as SugarResult; return value < 70 || value >= (kind === "fasting" ? 126 : 200);
}
export function formatLabResult(test: LabTest, result: LabResult): string {
  if (test === "bp") { const { systolic, diastolic } = result as BpResult; return `${systolic}/${diastolic} mmHg`; }
  const { value } = result as SugarResult; return `${value} mg/dL`;
}

/** What the queue card needs: which tests are waiting and whether any result is out of range. */
export type LabSummary = { test: LabTest; status: "pending" | "done" | "not_done"; abnormal: boolean | null; result: LabResult | null; note: string }[];
export type LabOrder = {
  id: string; version: number; test: LabTest; reasons: LabReason[]; status: "pending" | "done" | "not_done";
  result: LabResult | null; abnormal: boolean | null; note: string; orderedAt: string; resultedAt: string | null; resultedBy: string | null;
};
export type LabWorkItem = LabOrder & {
  encounterId: string; patientId: string; name: string; mrn: string; gender: string; dob: string; clinic: string; stage: string; checkedInAt: string;
  visitType: string; flags: { type: "allergy" | "risk"; value: string }[];
};
