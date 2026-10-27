import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic, Poppins } from "next/font/google";
import { LocaleProvider } from "@/components/locale-provider";
import "./tokens.css";
import "./globals.css";
import "./foundation.css";
import "./intake.css";
import "./clinical.css";
import "./operations.css";
import "./overview.css";
import "./contrast.css";
import "./theme.css";

// Self-hosted at build time by next/font: no runtime request to Google, no
// layout shift, and the same rendering on every machine. Poppins is the
// Fillow interface face; it is not a variable font, so its weights are listed.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
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
  description: "OpenEyes ophthalmology clinical workspace for connected patient care. Powered by Logic box.",
  robots: { index: false, follow: false },
};

// Browser extensions (Grammarly, ColorZilla and similar) write attributes onto
// <body> before React hydrates, which reports as a hydration mismatch even
// though the app renders <body> with no attributes at all. suppressHydration-
// Warning applies one level deep — this element's own attributes and text — so
// genuine mismatches inside the app tree are still reported.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`${poppins.variable} ${plexArabic.variable}`}><body suppressHydrationWarning><LocaleProvider>{children}</LocaleProvider></body></html>;
}
