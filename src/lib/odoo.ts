import { z } from "zod";
import { ageFromDob, IDENTIFIER_TYPES, normalizeIdentifier, normalizePhone, todayKarachi } from "./patients";

const schema = z.object({
  externalId: z.string().trim().min(1).max(120),
  externalUpdatedAt: z.iso.datetime({ offset: true }).optional(),
  givenName: z.string().trim().min(1).max(80),
  familyName: z.string().trim().max(80).default(""),
  dob: z.iso.date(),
  dobEstimated: z.boolean().default(false),
  gender: z.enum(["female", "male", "other", "unknown"]).default("unknown"),
  phone: z.string().trim().min(1).max(40),
  identifierType: z.enum(IDENTIFIER_TYPES),
  identifier: z.string().trim().min(1).max(30),
  city: z.string().trim().max(80).default(""),
  address: z.string().trim().max(240).default(""),
  preferredLanguage: z.enum(["en", "ur"]).default("en"),
  nextOfKinName: z.string().trim().max(100).default(""),
  nextOfKinPhone: z.string().trim().max(30).default(""),
}).strict();

export type OdooPatient = z.infer<typeof schema>;
export type OdooPatientParse =
  | { success: true; data: OdooPatient }
  | { success: false; fields: Record<string, string> };

export function parseOdooPatient(value: unknown): OdooPatientParse {
  const result = schema.safeParse(value);
  if (!result.success) {
    return { success: false, fields: Object.fromEntries(result.error.issues.map(issue => [issue.path.join(".") || "payload", issue.message])) };
  }
  const phone = normalizePhone(result.data.phone);
  const nextOfKinPhone = result.data.nextOfKinPhone ? normalizePhone(result.data.nextOfKinPhone) : "";
  const identifier = normalizeIdentifier(result.data.identifier, result.data.identifierType);
  const validIdentifier = result.data.identifierType === "passport" ? /^[A-Z0-9]{6,20}$/.test(identifier) : /^\d{13}$/.test(identifier);
  const calendarDob = Number.isFinite(Date.parse(`${result.data.dob}T00:00:00Z`)) && new Date(`${result.data.dob}T00:00:00Z`).toISOString().slice(0, 10) === result.data.dob;
  const age = calendarDob ? ageFromDob(result.data.dob) : Number.NaN;
  const fields: Record<string, string> = {};
  if (!phone) fields.phone = "Invalid phone number";
  if (nextOfKinPhone === null) fields.nextOfKinPhone = "Invalid phone number";
  if (!validIdentifier) fields.identifier = "Invalid identifier";
  if (!calendarDob || result.data.dob > todayKarachi() || age > 120) fields.dob = "Invalid date of birth";
  if (result.data.identifierType === "guardian_cnic" && age >= 18) fields.identifierType = "Guardian CNIC is limited to minors";
  if (Object.keys(fields).length) return { success: false, fields };
  return { success: true, data: { ...result.data, phone: phone!, nextOfKinPhone: nextOfKinPhone!, identifier } };
}
