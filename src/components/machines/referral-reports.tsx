"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, ScanEye } from "lucide-react";
import type { MachineOrder } from "@/lib/machines";
import type { MessageKey } from "@/lib/messages";
import { ageFromDob } from "@/lib/patients";
import { useLocale } from "../locale-provider";
import { useLiveData } from "../intake/shared";
import { formatDate } from "../patients/patients-workspace";
import { MachineChips } from "./machine-chips";

type ReferralVisit = { id: string; stage: string; closedAt: string | null; checkedInAt: string; referralDoctor: string; referralSource: string; name: string; mrn: string; gender: string; dob: string; clinic: string; hospital: string; machines: MachineOrder[]; letters: { id: string }[] };

/**
 * Today's referral visits at reception. Once every test is finished the visit
 * closes and the report can be printed for the patient's own doctor.
 */
export function ReferralReports() {
  const { t } = useLocale(); const live = useLiveData<{ visits: ReferralVisit[] }>("/api/machines/referrals");
  const [printing, setPrinting] = useState<ReferralVisit | null>(null);
  // Print once the report is on the page; clear it when the print dialog closes.
  useEffect(() => { if (!printing) return; const done = () => setPrinting(null); window.addEventListener("afterprint", done); const timer = setTimeout(() => window.print(), 300); return () => { clearTimeout(timer); window.removeEventListener("afterprint", done); }; }, [printing]);
  const visits = live.data?.visits ?? [];
  if (!visits.length) return null;
  return <section className="panel referral-reports" aria-label={t("referralReports")}>
    <h2><ScanEye size={18}/>{t("referralReports")}<span>{visits.length}</span></h2>
    <ul>{visits.map(visit => <li key={visit.id} data-testid={`referral-${visit.id}`}>
      <div><strong>{visit.name}</strong><small>{visit.mrn} · {t("referredBy")} {visit.referralDoctor}{visit.referralSource && `, ${visit.referralSource}`}</small><MachineChips orders={visit.machines}/></div>
      <span className={`rq-pill ${visit.closedAt ? "rq-doctor" : "rq-technician"}`}>{t(visit.closedAt ? "referralReady" : "referralInProgress")}</span>
      <button type="button" className={visit.closedAt ? "primary-button" : "secondary-button"} disabled={!visit.closedAt} onClick={() => setPrinting(visit)}><Printer size={15}/>{t("printReport")}</button>
    </li>)}</ul>
    {printing && createPortal(<ReferralReport visit={printing}/>, document.body)}
  </section>;
}

/** The printed page: only this is visible on paper. */
function ReferralReport({ visit }: { visit: ReferralVisit }) {
  const { t } = useLocale();
  const finished = visit.machines.filter(order => order.status === "done" || order.status === "not_done");
  return <article className="print-report" aria-hidden="true">
    <header><div><p className="print-hospital">{visit.hospital}</p><h1>{t("reportTitle")}</h1></div><p>{t("reportDate")}: {formatDate(visit.closedAt ?? visit.checkedInAt, true)}</p></header>
    <dl className="print-facts">
      <div><dt>{t("patientColumn")}</dt><dd>{visit.name}</dd></div><div><dt>{t("mrnLabel")}</dt><dd>{visit.mrn}</dd></div>
      <div><dt>{t("ageLabel")}</dt><dd>{ageFromDob(visit.dob)} {t("years")} · {t(`gender_${visit.gender}` as MessageKey)}</dd></div>
      <div><dt>{t("reportFor")}</dt><dd>{visit.referralDoctor}{visit.referralSource && `, ${visit.referralSource}`}</dd></div>
    </dl>
    {finished.length ? finished.map(order => <section key={order.id} className="print-test">
      <h2>{order.machine} · {t(`eye_${order.eye}` as MessageKey)}</h2>
      {order.status === "done" ? <><p>{order.findings}</p>{order.keyValues && <p className="print-values">{order.keyValues}</p>}</> : <p>{t("reportNotDone")}{order.note && `: ${order.note}`}</p>}
      {order.reports.filter(report => report.mime !== "application/pdf").map(report => <img key={report.id} src={`/api/machines/report?id=${report.id}`} alt={report.filename}/>)}
      {order.reports.some(report => report.mime === "application/pdf") && <p className="print-note">{t("reportAttachments")}: {order.reports.filter(report => report.mime === "application/pdf").map(report => report.filename).join(", ")}. {t("reportPdfNote")}</p>}
      <p className="print-note">{t("reportPerformedBy")}: {order.resultedBy}{order.resultedAt && ` · ${formatDate(order.resultedAt, true)}`}</p>
    </section>) : <p>{t("reportNoResults")}</p>}
    <footer>{visit.hospital} · {visit.clinic}</footer>
  </article>;
}
