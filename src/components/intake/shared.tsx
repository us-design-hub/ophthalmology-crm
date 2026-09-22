"use client";
import { useCallback, useEffect, useState } from "react";
import { CircleAlert, RefreshCw } from "lucide-react";
import { api, ClientApiError } from "@/lib/api-client";
import { en, type MessageKey } from "@/lib/messages";
import { useLocale } from "../locale-provider";
import type { Appointment } from "@/lib/intake";
export function intakeError(error: unknown): MessageKey { return error instanceof ClientApiError && error.code in en ? error.code as MessageKey : "serviceUnavailable"; }
export function useLiveData<T>(path: string) {
 const [data, setData] = useState<T | null>(null), [error, setError] = useState<MessageKey | null>(null), [updated, setUpdated] = useState<Date | null>(null), [generation, setGeneration] = useState(0);
 const refresh = useCallback(() => setGeneration(value => value + 1), []);
 useEffect(() => {
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>, running = false;
  setError(null);
  const run = async () => {
   if (controller.signal.aborted || running) return;
   if (document.visibilityState !== "visible") { timer = setTimeout(run, 5000); return; }
   running = true;
   try { const value = await api<T>(path, undefined, { signal: controller.signal }); if (!controller.signal.aborted) { setData(value); setUpdated(new Date()); setError(null); } }
   catch (error) { if (!controller.signal.aborted) setError(intakeError(error)); }
   finally { running = false; if (!controller.signal.aborted) timer = setTimeout(run, 5000); }
  };
  const visible = () => { if (document.visibilityState === "visible" && !running) { clearTimeout(timer); void run(); } };
  document.addEventListener("visibilitychange", visible);
  void run(); return () => { controller.abort(); clearTimeout(timer); document.removeEventListener("visibilitychange", visible); };
 }, [path, generation]);
 return { data, error, updated, refresh };
}
export function LiveStatus({ error, updated, refresh }: { error: MessageKey | null; updated: Date | null; refresh: () => void }) {
 const { t } = useLocale();
 return <div className={`intake-live ${error ? "is-stale" : ""}`} role="status"><span className="demo-dot"/><span>{error ? `${t("liveUnavailable")} ${t(error)}` : updated ? `${t("liveUpdated")} ${updated.toLocaleTimeString("en-GB", { timeZone: "Asia/Karachi", hour12: false })} PKT` : t("intakeLoading")}</span><button type="button" className="text-button" onClick={refresh}><RefreshCw size={13}/>{t("refreshIntake")}</button></div>;
}
export function RiskFlags({ flags }: { flags: Appointment["flags"] }) { const { t } = useLocale(); return <div className="intake-risk-flags">{flags.length ? flags.map((flag, index) => <span className={`flag-tag flag-${flag.type}`} key={index}><CircleAlert size={13}/><strong>{t(flag.type === "allergy" ? "allergyLabel" : "riskLabel")}:</strong> {flag.value}</span>) : <small>{t("riskNone")}</small>}</div>; }
export function ErrorNotice({ error }: { error: MessageKey | null }) { const { t } = useLocale(); return error ? <p className="form-error" role="alert">{t(error)}</p> : null; }
