import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";

export const IDENTIFIER_TYPES = ["cnic", "passport", "guardian_cnic"] as const;
export type IdentifierType = typeof IDENTIFIER_TYPES[number];

export function todayKarachi(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function normalizePhone(input: string): string | null {
  const normalized = input.trim().replace(/^00/, "+");
  const phone = parsePhoneNumberFromString(normalized, "PK");
  return phone?.isValid() ? phone.number : null;
}

export function normalizeIdentifier(value: string, type: IdentifierType): string {
  return type === "passport" ? value.replace(/[\s-]/g, "").toUpperCase() : value.replace(/[\s-]/g, "");
}

export function ageFromDob(dob: string, today = todayKarachi()): number {
  const [year, month, day] = dob.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - year - (tm < month || (tm === month && td < day) ? 1 : 0);
}

export function estimatedDob(age: number, today = todayKarachi()): string {
  const year = Number(today.slice(0, 4)) - age;
  const monthDay = today.slice(4);
  const candidate = `${year}${monthDay}`;
  return candidate.endsWith("02-29") && new Date(`${candidate}T00:00:00Z`).toISOString().slice(0, 10) !== candidate ? `${year}-02-28` : candidate;
}

const validDob = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value && value <= todayKarachi() && ageFromDob(value) <= 120;
const shortText = (max: number) => z.string().trim().max(max);
export const patientInputSchema = z.object({
  givenName: z.string().trim().min(1).max(80), familyName: shortText(80).default(""),
  gender: z.enum(["female", "male", "other", "unknown"]),
  dob: z.string().refine(validDob, "invalidDate"), dobEstimated: z.boolean().default(false),
  phone: z.string().transform(value => normalizePhone(value)).refine(value => value !== null, "invalidPhone"),
  identifierType: z.enum(IDENTIFIER_TYPES), identifier: z.string().trim().min(1).max(30),
  city: shortText(80).default(""), address: shortText(240).default(""),
  preferredLanguage: z.enum(["en", "ur"]).default("en"),
  allergy: shortText(160).default(""), risk: shortText(160).default(""),
  nextOfKinName: shortText(100).default(""), nextOfKinPhone: shortText(30).default(""),
  duplicateReviewToken: z.string().max(160).optional(), duplicateReason: shortText(240).optional(),
}).strict().superRefine((value, context) => {
  const identifier = normalizeIdentifier(value.identifier, value.identifierType);
  if (value.identifierType === "passport" ? !/^[A-Z0-9]{6,20}$/.test(identifier) : !/^\d{13}$/.test(identifier)) {
    context.addIssue({ code: "custom", path: ["identifier"], message: "invalidIdentifier" });
  }
  if (value.identifierType === "guardian_cnic" && ageFromDob(value.dob) >= 18) context.addIssue({ code: "custom", path: ["identifierType"], message: "guardianMinorOnly" });
  if (value.nextOfKinPhone && !normalizePhone(value.nextOfKinPhone)) context.addIssue({ code: "custom", path: ["nextOfKinPhone"], message: "invalidPhone" });
});
export type PatientInput = z.infer<typeof patientInputSchema>;
export type PatientSummary = {
  id: string; mrn: string; givenName: string; familyName: string; gender: string; dob: string; dobEstimated: boolean;
  phone: string; identifierType: IdentifierType; identifierMasked: string; city: string; createdAt: string;
  flags: { type: "allergy" | "risk"; value: string }[];
};
export type PatientDetail = PatientSummary & { version:number; address: string; preferredLanguage: string; nextOfKinName: string; nextOfKinPhone: string };
export type PatientList = { patients: PatientSummary[]; total: number; page: number; pageSize: number };

export function patientName(patient: Pick<PatientSummary, "givenName" | "familyName">): string { return `${patient.givenName} ${patient.familyName}`.trim(); }
