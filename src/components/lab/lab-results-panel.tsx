"use client";
import { useState } from "react";
import { FlaskConical, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api-client";
import type { ClinicalDetail } from "@/lib/clinical";
import { formatLabResult, type LabSummary } from "@/lib/lab";
import type { MessageKey } from "@/lib/messages";
import { useLocale } from "../locale-provider";
import { ErrorNotice } from "../intake/shared";
import { LabChips } from "./lab-chips";

/**
 * BP and sugar for the doctor, above the examination. Ordering a test here
 * refreshes only this panel, so unsaved notes in the editor are untouched.
 */
export function LabResultsPanel({ encounterId, initial }: { encounterId: string; initial?: LabSummary }) {
  const { t } = useLocale(); const [labs, setLabs] = useState<LabSummary>(initial ?? []); const [error, setError] = useState<MessageKey | null>(null);
  const reload = () => { api<ClinicalDetail>(`/api/clinical/detail?encounterId=${encounterId}`).then(detail => setLabs(detail.encounter.labs ?? [])).catch(() => { /* the next open shows it */ }); };
  return <section className="clinical-section lab-results-panel"><h3><FlaskConical size={17}/>{t("labResults")}</h3>
    <ErrorNotice error={error}/>
    {labs.length > 0 && <dl className="lab-results">{labs.map(lab => <div key={lab.test} className={lab.abnormal ? "is-abnormal" : ""}><dt>{t(`labTest_${lab.test}` as MessageKey)}</dt>
      <dd>{lab.status === "done" && lab.result ? <><span dir="ltr">{formatLabResult(lab.test, lab.result)}</span>{lab.test === "sugar" && <small>{t((lab.result as { kind: string }).kind === "fasting" ? "sugarFasting" : "sugarRandom")}</small>}{lab.abnormal && <strong><TriangleAlert size={14}/>{t("labOutOfRange")}</strong>}</> : lab.status === "pending" ? <em>{t("labAwaiting")}</em> : <em>{t("labNotDone")}{lab.note && `: ${lab.note}`}</em>}</dd></div>)}</dl>}
    <LabChips encounterId={encounterId} labs={[]} hideExisting={labs.map(lab => lab.test)} onChanged={reload} onError={setError}/>
  </section>;
}
