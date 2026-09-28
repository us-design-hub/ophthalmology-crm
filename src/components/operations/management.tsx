"use client";

import { useLocale } from "../locale-provider";
import { LiveHeading, Table, useOperations } from "./live-shared";
import type { MessageKey } from "@/lib/messages";

type Management = {
  bookings: { total: number; attended: number; cancelled: number; missed: number };
  surgery: { stage: string; count: number }[];
  documentation: { visits: number; signed: number };
  waits: { stage: string; minutes: number }[];
};

export function ManagementWorkspace({ navigate }: { navigate: (page: "surgery" | "overview") => void }) {
  const { t } = useLocale();
  const live = useOperations<Management>("management");
  if (!live.data) return <LiveHeading {...live}/>;
  const data = live.data;
  const metrics = [
    { label: "dashBookings", value: data.bookings.total },
    { label: "dashAttended", value: data.bookings.attended },
    { label: "dashCancelled", value: data.bookings.cancelled },
    { label: "dashMissed", value: data.bookings.missed },
    { label: "dashDocumentation", value: `${data.documentation.signed} / ${data.documentation.visits}` },
  ] as { label: MessageKey; value: string | number }[];

  return <div className="ops-workspace">
    <LiveHeading {...live}/>
    <div className="ops-metrics">{metrics.map(metric => <article className="panel" key={metric.label}>
      <span>{t(metric.label)}</span><strong>{metric.value}</strong>
    </article>)}</div>
    <div className="ops-chart-grid">
      <section className="panel ops-chart-panel"><h2>{t("dashWait")}</h2>
        <Table heads={["dashStage", "dashMinutes"]}>{data.waits.map(wait => <tr key={wait.stage}><td>{wait.stage}</td><td>{wait.minutes}</td></tr>)}</Table>
      </section>
      <section className="panel ops-chart-panel"><h2>{t("dashPipeline")}</h2>
        <Table heads={["dashStage", "dashCount"]}>{data.surgery.map(stage => <tr key={stage.stage}><td>{stage.stage}</td><td>{stage.count}</td></tr>)}</Table>
      </section>
    </div>
    <div className="admin-actions"><button className="secondary-button" onClick={() => navigate("surgery")}>{t("opsViewSurgery")}</button></div>
  </div>;
}
