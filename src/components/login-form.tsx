"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Eye, EyeOff, Globe2, LockKeyhole, Stethoscope } from "lucide-react";
import { useLocale } from "./locale-provider";
import { api, ClientApiError } from "@/lib/api-client";
import type { DemoAccount } from "@/server/auth";
import type { MessageKey } from "@/lib/messages";

export function LoginForm({ demo, hospitalName }: { hospitalName: string; demo: { accounts: DemoAccount[]; password: string } | null }) {
  const { locale, setLocale, t } = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState<MessageKey | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try { await api("/api/auth/login", { email: email.trim().toLowerCase(), password }); router.replace("/"); router.refresh(); }
    catch (caught) { setError(caught instanceof ClientApiError && caught.code === "invalidCredentials" ? "invalidCredentials" : caught instanceof ClientApiError && caught.status === 429 ? "tooManyAttempts" : "serviceUnavailable"); setBusy(false); }
  }

  return <main className="login-page">
    <div className="login-topline">
      <span className="login-wordmark"><Eye size={20}/>{t("appName")}</span>
      <button type="button" className="language-button" aria-label={t("language")} onClick={() => setLocale(locale === "en" ? "ur" : "en")}><Globe2 size={15}/>{locale === "en" ? t("urdu") : t("english")}</button>
    </div>

    <div className={`login-card${demo ? " login-card-with-demo" : ""}`}>
      {/* Identity panel: establishes which institution and which environment
          this is before any credential is typed. */}
      <section className="login-story">
        <div className="login-hospital">
          <span className="login-hospital-mark"><Eye size={25}/></span>
          <div><strong>{hospitalName}</strong><small>{t("brandCaption")}</small></div>
        </div>

        <div className="login-demo-note">
          <span className="demo-dot"/>
          <span>{t("demoOnly")}</span>
          <small>{t("notClinical")}</small>
        </div>
      </section>

      <section className="login-form-panel">
        <div className="login-form-heading">
          <span className="eyebrow">{t("secureAccess")}</span>
          <h1>{t("welcomeBack")}</h1>
          <p>{t("signInDescription")}</p>
        </div>

        <form onSubmit={submit} className="login-form">
          <label>
            <span>{t("emailAddress")}</span>
            <input name="email" type="email" autoComplete="username" required maxLength={160} value={email} onChange={event => setEmail(event.target.value)} placeholder={t("emailPlaceholder")}/>
          </label>
          <label>
            <span>{t("passwordLabel")}</span>
            <div className="password-input">
              <input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required maxLength={256} value={password} onChange={event => setPassword(event.target.value)}/>
              <button type="button" aria-label={t(showPassword ? "hidePassword" : "showPassword")} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button>
            </div>
          </label>
          {error && <div className="form-error" role="alert">{t(error)}</div>}
          <button className="primary-button sign-in-button" type="submit" disabled={busy}><LockKeyhole size={16}/>{t(busy ? "signingIn" : "signIn")}<ArrowRight size={16}/></button>
        </form>
      </section>

        {demo && <section className="demo-accounts">
          <div className="demo-accounts-head">
            <Stethoscope size={15}/>
            <strong>{t("chooseDemoAccount")}</strong>
            <span className="demo-env">{t("prototype")}</span>
          </div>
          <p>{t("demoAccountHelp")}</p>
          <div className="demo-account-grid">
            {demo.accounts.map(account => <button
              type="button" key={account.email}
              data-testid={`demo-account-${account.email.split("@")[0]}`}
              className={email === account.email ? "selected" : ""}
              aria-pressed={email === account.email}
              onClick={() => { setEmail(account.email); setPassword(demo.password); setError(null); }}>
              <span>{t(`role_${account.role}`)}</span>
              <strong>{account.name}</strong>
              {email === account.email && <Check size={13}/>}
            </button>)}
          </div>
        </section>}

    </div>

    <p className="login-footer">{t("footer")}</p>
  </main>;
}
