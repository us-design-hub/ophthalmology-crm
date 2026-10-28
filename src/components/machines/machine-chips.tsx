"use client";
import { ScanEye } from "lucide-react";
import type { MachineOrder } from "@/lib/machines";
import type { MessageKey } from "@/lib/messages";
import { useLocale } from "../locale-provider";

/** A visit's machine tests in one line: "OCT done · Fundus camera waiting". */
export function MachineChips({ orders = [] }: { orders?: MachineOrder[] }) {
  const { t } = useLocale();
  if (!orders.length) return null;
  return <p className="lab-chips machine-chips"><ScanEye size={13} aria-hidden="true"/><span className="sr-only">{t("machineTestsShort")}:</span>
    {orders.map(order => <span key={order.id} className={`lab-chip is-${order.status === "done" ? "done" : order.status === "ordered" || order.status === "awaiting_approval" ? "pending" : "not_done"}`}>{order.machine}{order.eye !== "OU" && ` ${order.eye}`} <i>{t(`machineStatus_${order.status}` as MessageKey)}</i></span>)}</p>;
}
