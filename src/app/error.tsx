"use client";
import { CircleAlert } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useLocale();
  return <main className="app-error"><CircleAlert size={32}/><h1>{t("serviceUnavailable")}</h1><button type="button" className="primary-button" onClick={reset}>{t("retry")}</button></main>;
}
