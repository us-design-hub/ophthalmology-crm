import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Sans_Arabic, IBM_Plex_Serif } from "next/font/google";
import { LocaleProvider } from "@/components/locale-provider";
import "./tokens.css";
import "./globals.css";
import "./foundation.css";
import "./intake.css";
import "./clinical.css";
import "./operations.css";
import "./overview.css";
import "./contrast.css";

// Self-hosted at build time by next/font: no runtime request to Google, no
// layout shift, and the same rendering on every machine. The previous stack
// started with "Segoe UI", which only exists on Windows and silently fell back
// to Arial elsewhere.
//
// Plex Sans is loaded as a variable font (wght 100-700) because the type scale
// uses non-standard weights (550, 650) that only interpolate on a variable
// face. Plex Serif and Plex Sans Arabic ship static weights only, so theirs are
// listed explicitly.
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexSerif = IBM_Plex_Serif({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-plex-serif",
  display: "swap",
});

// Urdu (Naskh). Latin is included so mixed-script strings in RTL mode stay in
// one family rather than falling back mid-sentence.
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "OpenEyes · Clinical workspace",
  description: "OpenEyes ophthalmology demo — patient intake and bilateral ophthalmic workup. Powered by Logic box.",
  robots: { index: false, follow: false },
};

// Browser extensions (Grammarly, ColorZilla and similar) write attributes onto
// <body> before React hydrates, which reports as a hydration mismatch even
// though the app renders <body> with no attributes at all. suppressHydration-
// Warning applies one level deep — this element's own attributes and text — so
// genuine mismatches inside the app tree are still reported.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`${plexSans.variable} ${plexSerif.variable} ${plexArabic.variable}`}><body suppressHydrationWarning><LocaleProvider>{children}</LocaleProvider></body></html>;
}
