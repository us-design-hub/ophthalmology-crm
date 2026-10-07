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
  procedureDefinition?: {preoperativeChecks?:string[];preoperativeFields?:{required?:boolean}[]}|null;
  surgeonId?: string | null;
  consents: { version: number; eye: string; procedure: string; status: "created" | "confirmed" | "withdrawn" }[];
  preop: null | {
    biometryVerified: boolean;
    medicalClearance: boolean;
    pupilDilation: boolean;
  };
  workflowPreop?:null|{answers:Record<string,unknown>};
};

export function surgeryReadiness(surgeryCase: ReadinessSource): SurgeryReadiness {
  const latestConsent = [...surgeryCase.consents].sort((a, b) => b.version - a.version)[0];
  const consentMatches = latestConsent?.eye === surgeryCase.eye && latestConsent.procedure === surgeryCase.procedure;
  const consentComplete = Boolean(latestConsent && consentMatches && latestConsent.status === "confirmed");
  const checks=surgeryCase.procedureDefinition?.preoperativeChecks??(surgeryCase.procedureCode?['biometry_verified','medical_clearance','pupil_dilation']:[]);
  const requiredFields=Boolean(surgeryCase.procedureDefinition?.preoperativeFields?.some(field=>field.required));
  const cataloguePreopRequired=checks.length>0||requiredFields;
  const legacyAnswers:Record<string,unknown>|null=surgeryCase.preop?{biometry_verified:surgeryCase.preop.biometryVerified,medical_clearance:surgeryCase.preop.medicalClearance,pupil_dilation:surgeryCase.preop.pupilDilation}:null;
  const preopAnswers=surgeryCase.workflowPreop?.answers??legacyAnswers;
  const preopComplete=!cataloguePreopRequired||Boolean(preopAnswers&&checks.every(check=>preopAnswers[check]===true));
  const blockers: string[] = [];
  if (!surgeryCase.surgeonId) blockers.push("Operating surgeon not assigned");
  if (!latestConsent) blockers.push("Structured consent missing");
  else if (!consentMatches) blockers.push("Consent no longer matches the procedure and eye");
  else if (latestConsent.status === "created") blockers.push("Consent awaiting doctor confirmation");
  else if (latestConsent.status === "withdrawn") blockers.push("Latest consent withdrawn");
  if (cataloguePreopRequired && !preopAnswers) blockers.push("Preoperative assessment missing");
  else if (cataloguePreopRequired) {
    const labels:Record<string,string>={biometry_verified:'Biometry not verified',medical_clearance:'Medical clearance incomplete',pupil_dilation:'Pupil dilation not confirmed'};
    for(const check of checks)if(preopAnswers?.[check]!==true)blockers.push(labels[check]??`${check.replaceAll('_',' ')} incomplete`);
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
