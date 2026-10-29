import type { Role } from "./access";

export const DOCUMENT_CATEGORIES = ["workup", "senior_review", "doctor_note", "prescription", "machine_test", "lab_result", "surgery", "external", "other"] as const;
export type DocumentCategory = typeof DOCUMENT_CATEGORIES[number];
export const DOCUMENT_LABELS: Record<DocumentCategory, string> = {
  workup: "Technician workup / readings", senior_review: "Senior technician review", doctor_note: "Doctor notes / remarks",
  prescription: "Handwritten prescription", machine_test: "Machine test report", lab_result: "Laboratory result", surgery: "Surgery document",
  external: "External clinical document", other: "Other clinical document",
};
export const ROLE_DOCUMENT_CATEGORIES: Partial<Record<Role, readonly DocumentCategory[]>> = {
  nurse: ["workup", "external", "other"], senior_technician: ["workup", "senior_review", "external", "other"],
  doctor: ["doctor_note", "prescription", "surgery", "external", "other"], machine_operator: ["machine_test"], lab_assistant: ["lab_result"],
};

const ALL_DOCUMENT_CATEGORIES: readonly DocumentCategory[] = DOCUMENT_CATEGORIES;
export function uploadDocumentCategories(roles: readonly Role[]): DocumentCategory[] {
  return [...new Set(roles.flatMap(role => ROLE_DOCUMENT_CATEGORIES[role] ?? []))];
}
export function visibleDocumentCategories(roles: readonly Role[]): DocumentCategory[] {
  if (roles.some(role => ["nurse", "senior_technician", "doctor", "hospital_admin", "auditor"].includes(role))) return [...ALL_DOCUMENT_CATEGORIES];
  const visible: Partial<Record<Role, readonly DocumentCategory[]>> = {
    pharmacist: ["prescription"],
    optician: ["workup", "senior_review", "doctor_note", "prescription"],
    machine_operator: ["workup", "doctor_note", "machine_test", "external"],
    lab_assistant: ["workup", "doctor_note", "lab_result", "external"],
    ot_coordinator: ["doctor_note", "machine_test", "lab_result", "surgery"],
  };
  return [...new Set(roles.flatMap(role => visible[role] ?? []))];
}
export type PatientDocument = {
  id: string; patientId: string; encounterId: string; category: DocumentCategory; title: string; remarks: string;
  capturedAt: string; uploadedAt: string; actor: string; actorRole: string; filename: string; mime: string; hash: string;
  clinic: string; visitDate: string;
};
export type PatientDocumentData = {
  documents: PatientDocument[]; encounters: { id: string; clinic: string; date: string; stage: string }[];
  uploadCategories: DocumentCategory[]; canExport: boolean;
};
