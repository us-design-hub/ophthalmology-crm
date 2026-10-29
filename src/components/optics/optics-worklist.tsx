"use client";
import { Glasses } from "lucide-react";
import type { OpticsReferral, RefractionEye } from "@/lib/optics";
import { LiveStatus, RiskFlags, useLiveData } from "../intake/shared";

const number = (value: number | null | undefined) => value === null || value === undefined ? "--" : `${value >= 0 ? "+" : ""}${Number(value).toFixed(2)}`;
function eye(label: string, reading: RefractionEye) {
  return `${label} ${number(reading.sphere)} / ${number(reading.cylinder)} x ${reading.axis ?? "--"}${reading.add !== null && reading.add !== undefined ? `  ADD ${number(reading.add)}` : ""}`;
}

export function OpticsWorklist() {
  const live = useLiveData<{ referrals: OpticsReferral[]; serverNow: string }>("/api/optics/worklist");
  return <div className="optics-worklist">
    <div className="reception-queue-toolbar"><div><h2>Patients requiring optics</h2><p>Review patients marked by their doctor, using the approved workup readings and any doctor suggestion.</p></div><LiveStatus {...live}/></div>
    <section className="optics-grid" aria-label="Patients requiring optics">
      {(live.data?.referrals ?? []).map(referral => <article className="panel optics-card" key={referral.id}>
        <header><span className="patient-avatar">{referral.patient[0]}</span><div><h3>{referral.patient}</h3><p>{referral.mrn} / {referral.phone}</p></div><span className="optics-status is-ready">Optics required</span></header>
        {referral.flags.length > 0 && <RiskFlags flags={referral.flags}/>}<dl><div><dt>Clinic</dt><dd>{referral.clinic}</dd></div><div><dt>Marked by</dt><dd>{referral.doctor}</dd></div><div><dt>Marked</dt><dd>{new Date(referral.markedAt).toLocaleString()}</dd></div></dl>
        {referral.referralNote && <div className="optics-referral-note"><strong>Doctor note</strong><p>{referral.referralNote}</p></div>}
        <div className="optics-comparison"><WorkupBlock referral={referral}/>{referral.doctorSuggestion ? <SuggestionBlock referral={referral}/> : <div className="optics-previous-empty"><strong>Doctor suggestion</strong><p>No final glasses prescription was suggested. Assess using the approved workup readings.</p></div>}</div>
      </article>)}
      {live.data && !live.data.referrals.length && <div className="panel optics-empty"><Glasses size={24}/><h3>No patients marked for optics</h3><p>Patients appear here after a doctor signs the consultation record and marks Optics Required.</p></div>}
    </section>
  </div>;
}

function WorkupBlock({ referral }: { referral: OpticsReferral }) {
  const workup = referral.workup;
  if (!workup) return <div className="optics-previous-empty"><strong>Workup readings</strong><p>No saved workup readings are available for this visit.</p></div>;
  return <div className="optics-rx"><div className="optics-rx-heading"><strong>{workup.source === "senior" ? "Senior-approved workup" : "Technician workup"}</strong><time dateTime={workup.reviewedAt ?? workup.savedAt}>{new Date(workup.reviewedAt ?? workup.savedAt).toLocaleString()}</time></div><span>{eye("OD", workup.OD)}</span><span>{eye("OS", workup.OS)}</span><span>PD {workup.pd ?? "--"} mm</span><small>Corrected VA: OD {workup.OD.corrected ?? "--"} / OS {workup.OS.corrected ?? "--"}</small></div>;
}

function SuggestionBlock({ referral }: { referral: OpticsReferral }) {
  const od: RefractionEye = { sphere: referral.odSphere, cylinder: referral.odCylinder, axis: referral.odAxis, add: referral.odAdd };
  const os: RefractionEye = { sphere: referral.osSphere, cylinder: referral.osCylinder, axis: referral.osAxis, add: referral.osAdd };
  return <div className="optics-rx"><div className="optics-rx-heading"><strong>Doctor-suggested glasses</strong></div><span>{eye("OD", od)}{referral.odPrism ? `  Prism ${referral.odPrism}` : ""}</span><span>{eye("OS", os)}{referral.osPrism ? `  Prism ${referral.osPrism}` : ""}</span><span>PD {referral.pd ?? "--"} mm / {referral.lensType?.replaceAll("_", " ") ?? "lens type not specified"}</span>{referral.instructions && <p>{referral.instructions}</p>}</div>;
}
