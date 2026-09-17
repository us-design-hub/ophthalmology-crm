import { z } from "zod";
import { todayKarachi } from "./patients";

export const STAGES = ["waiting", "workup", "dilation", "consultation", "pharmacy_billing"] as const;
export type Stage = typeof STAGES[number];
export const VA_VALUES = ["6/4", "6/5", "6/6", "6/9", "6/12", "6/18", "6/24", "6/36", "6/60", "3/60", "1/60", "CF", "HM", "PL", "NPL", "not_tested"] as const;
export const IOP_METHODS = ["Goldmann", "NCT", "Tonopen"] as const;
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const date = new Date(`${value}T00:00:00Z`); return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value; });
export const bookingSchema = z.object({ patientId: z.uuid(), facilityId: z.uuid(), doctorId: z.uuid(), date: dateSchema, time: z.string().regex(/^\d{2}:\d{2}$/) }).strict();
export const transitionSchema = z.object({ encounterId: z.uuid(), version: z.number().int().positive(), to: z.enum(STAGES), reason: z.string().trim().max(500).default("") }).strict();
export const refractionSchema=z.object({sphere:z.number().min(-30).max(30).nullable(),cylinder:z.number().min(-15).max(0).nullable(),axis:z.number().int().min(0).max(180).nullable(),add:z.number().min(0).max(6).nullable(),pd:z.number().min(10).max(50).nullable()}).strict().refine(v=>!v.cylinder||v.axis!==null);
export function snellenLogmar(value:string):number|null{const match=/^(\d+)\/(\d+)$/.exec(value);return match?Math.round(Math.log10(Number(match[2])/Number(match[1]))*100)/100:null;}
const eyeSchema = z.object({ uncorrected: z.enum(VA_VALUES), pinhole: z.enum(VA_VALUES), corrected: z.enum(VA_VALUES), iop: z.number().min(1).max(80), method: z.enum(IOP_METHODS), measuredAt: z.iso.datetime({ offset: true }), refraction:refractionSchema.nullable().optional(), logmar:z.object({uncorrected:z.number().min(-0.5).max(3).nullable(),pinhole:z.number().min(-0.5).max(3).nullable(),corrected:z.number().min(-0.5).max(3).nullable()}).strict().nullable().optional() }).strict();
export const workupSchema = z.object({ encounterId: z.uuid(), version: z.number().int().nonnegative(), OD: eyeSchema, OS: eyeSchema, notes: z.string().trim().max(1000).default("") }).strict();
export type EyeMeasurements = z.infer<typeof eyeSchema>;
export type WorkupInput = z.infer<typeof workupSchema>;
export type Workup = WorkupInput & { id: string; authorId: string; author: string; savedAt: string };
export function isElevatedIop(value: number) { return value > 21; }
export function canTransition(from: Stage, to: Stage) { return (from === "waiting" && to === "workup") || (from === "workup" && (to === "dilation" || to === "consultation")) || (from === "dilation" && to === "consultation"); }
export function bookingDateAllowed(date: string, today = todayKarachi()) { return date >= today && date <= new Date(new Date(`${today}T00:00:00Z`).getTime() + 90 * 86400000).toISOString().slice(0, 10); }
export function slotTimes(start: number, end: number, duration: number) { const slots: string[] = []; for (let minute = start; minute + duration <= end; minute += duration) slots.push(`${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`); return slots; }
export type Clinic = { id: string; name: string; startMinute: number; endMinute: number; slotMinutes: number; doctors: { id: string; name: string }[] };
export type Appointment = { id: string; patientId: string; name: string; mrn: string; facilityId: string; clinic: string; doctorId: string; doctor: string; date: string; time: string; version:number; status: "booked" | "checked_in" | "cancelled" | "no_show" | "rescheduled"; encounterId: string | null; flags: { type: "allergy" | "risk"; value: string }[] };
export type Encounter = { id: string; patientId: string; name: string; mrn: string; clinic: string; facilityId: string; doctor: string; doctorId: string; stage: Stage; priority?: "routine"|"urgent"; version: number; checkedInAt: string; stageAt: string; dilationReadyAt: string | null; workupVersion: number; flags: Appointment["flags"] };
export type EncounterDetail = { encounter: Encounter; workup: Workup | null; history: { from: Stage | null; to: Stage; actor: string; at: string; reason: string }[] };
