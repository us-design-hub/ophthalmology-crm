export type SurgeryReadiness = {
  status: "ready" | "action_required" | "completed" | "cancelled";
  blockers: string[];
  consentComplete: boolean;
  preopComplete: boolean;
};

type ReadinessSource = {
  eye: string;
  procedure: string;
  stage: string;
  procedureCode: string | null;
  surgeonId?: string | null;
  consents: { version: number; eye: string; procedure: string; status: "created" | "confirmed" | "withdrawn" }[];
  preop: null | {
    biometryVerified: boolean;
    medicalClearance: boolean;
    pupilDilation: boolean;
  };
};

export function surgeryReadiness(surgeryCase: ReadinessSource): SurgeryReadiness {
  const latestConsent = [...surgeryCase.consents].sort((a, b) => b.version - a.version)[0];
  const consentMatches = latestConsent?.eye === surgeryCase.eye && latestConsent.procedure === surgeryCase.procedure;
  const consentComplete = Boolean(latestConsent && consentMatches && latestConsent.status === "confirmed");
  const cataloguePreopRequired = Boolean(surgeryCase.procedureCode);
  const preopComplete = !cataloguePreopRequired || Boolean(
    surgeryCase.preop?.biometryVerified
    && surgeryCase.preop.medicalClearance
    && surgeryCase.preop.pupilDilation,
  );
  const blockers: string[] = [];
  if (!surgeryCase.surgeonId) blockers.push("Operating surgeon not assigned");
  if (!latestConsent) blockers.push("Structured consent missing");
  else if (!consentMatches) blockers.push("Consent no longer matches the procedure and eye");
  else if (latestConsent.status === "created") blockers.push("Consent awaiting doctor confirmation");
  else if (latestConsent.status === "withdrawn") blockers.push("Latest consent withdrawn");
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
