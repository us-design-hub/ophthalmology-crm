export type SurgeryReadiness = {
  status: "ready" | "action_required" | "completed" | "cancelled";
  blockers: string[];
  consentComplete: boolean;
  preopComplete: boolean;
};

type ReadinessSource = {
  eye: string;
  stage: string;
  procedureCode: string | null;
  surgeonId?: string | null;
  documents: { eye: string }[];
  preop: null | {
    biometryVerified: boolean;
    medicalClearance: boolean;
    pupilDilation: boolean;
  };
};

export function surgeryReadiness(surgeryCase: ReadinessSource): SurgeryReadiness {
  const consentComplete = surgeryCase.documents.some(document => document.eye === surgeryCase.eye);
  const cataloguePreopRequired = Boolean(surgeryCase.procedureCode);
  const preopComplete = !cataloguePreopRequired || Boolean(
    surgeryCase.preop?.biometryVerified
    && surgeryCase.preop.medicalClearance
    && surgeryCase.preop.pupilDilation,
  );
  const blockers: string[] = [];
  if (!surgeryCase.surgeonId) blockers.push("Operating surgeon not assigned");
  if (!consentComplete) blockers.push("Signed consent missing");
  if (cataloguePreopRequired && !surgeryCase.preop) blockers.push("Preoperative assessment missing");
  else if (cataloguePreopRequired) {
    if (!surgeryCase.preop?.biometryVerified) blockers.push("Biometry not verified");
    if (!surgeryCase.preop?.medicalClearance) blockers.push("Medical clearance incomplete");
    if (!surgeryCase.preop?.pupilDilation) blockers.push("Pupil dilation not confirmed");
  }
  if (surgeryCase.stage === "cancelled") return { status: "cancelled", blockers: [], consentComplete, preopComplete };
  if (["operated", "discharged", "followup"].includes(surgeryCase.stage)) return { status: "completed", blockers: [], consentComplete, preopComplete };
  return { status: blockers.length ? "action_required" : "ready", blockers, consentComplete, preopComplete };
}

export function karachiDate(value: string): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
