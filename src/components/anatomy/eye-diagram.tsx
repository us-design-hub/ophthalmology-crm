"use client";

import { useId } from "react";
import { type AnatomySite, type Eye, SITE_COLORS } from "@/lib/anatomy";
import { useLocale } from "@/components/locale-provider";

type Props = { eye: Eye; selected: AnatomySite | null; onSelect: (site: AnatomySite) => void };

export function EyeDiagram({ eye, selected, onSelect }: Props) {
  const { t } = useLocale();
  const id = useId().replace(/:/g, "");
  const region = (site: AnatomySite) => ({
    role: "button" as const, tabIndex: 0, "aria-label": `${eye} ${t(site)}`, "aria-pressed": selected === site,
    onClick: () => onSelect(site), onKeyDown: (event: React.KeyboardEvent<SVGGElement>) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(site); }
    },
    className: `diagram-region ${selected === site ? "is-selected" : ""}`,
    style: { "--region-color": SITE_COLORS[site] } as React.CSSProperties,
  });

  return <svg className="eye-diagram" viewBox="0 0 440 285" role="group" aria-label={`${t(eye === "OD" ? "rightEye" : "leftEye")} — ${t("twoD")}`} data-testid={`diagram-${eye}`}>
    <defs>
      <radialGradient id={`${id}-globe`} cx="35%" cy="30%"><stop stopColor="#fcfbf3"/><stop offset="1" stopColor="#dadfd8"/></radialGradient>
      <radialGradient id={`${id}-gel`} cx="35%" cy="25%"><stop stopColor="#eef6f1"/><stop offset="1" stopColor="#bfd5d0"/></radialGradient>
      <linearGradient id={`${id}-nerve`} x2="0" y2="1"><stop stopColor="#f2d19b"/><stop offset="1" stopColor="#c28a46"/></linearGradient>
    </defs>
    <ellipse cx="237" cy="257" rx="136" ry="12" fill="#173e35" opacity=".055"/>
    <g {...region("adnexa")}><path d="M102 80 Q202 -1 325 70 L315 77 Q205 20 110 92Z" fill="#dfb2a1"/><title>{t("adnexa")}</title></g>
    <g {...region("extraocular_muscles")}><path d="M135 58 Q239 23 326 84 L312 91 Q242 48 148 72Z M135 224 Q239 261 326 207 L312 196 Q238 236 147 212Z" fill="#b77567"/><title>{t("extraocular_muscles")}</title></g>
    <g {...region("optic_nerve")}><path d="M315 125 Q347 137 385 125 Q409 140 387 158 Q348 147 315 163Z" fill={`url(#${id}-nerve)`} stroke="#bd8a52" strokeWidth="2"/><path d="M335 141 393 142" stroke="#b98043" opacity=".4"/><title>{t("optic_nerve")}</title></g>
    <g {...region("sclera")}><ellipse cx="226" cy="143" rx="117" ry="108" fill={`url(#${id}-globe)`} stroke="#b7c5bc" strokeWidth="2"/><title>{t("sclera")}</title></g>
    <g {...region("retina")}><ellipse cx="226" cy="143" rx="106" ry="97" fill="#d69a7f" stroke="#bb816b" strokeWidth="1.5"/><title>{t("retina")}</title></g>
    <g {...region("vitreous")}><ellipse cx="226" cy="143" rx="96" ry="87" fill={`url(#${id}-gel)`}/><path d="M250 69 Q299 86 306 121" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".55"/><title>{t("vitreous")}</title></g>
    <g {...region("macula")}><ellipse cx="320" cy="156" rx="8" ry="14" fill="#a65d46"/><circle cx="320" cy="156" r="3" fill="#f5cd90"/><title>{t("macula")}</title></g>
    <g {...region("anterior_chamber")}><path d="M132 95 Q88 143 132 192 L147 180 L147 106Z" fill="#b3dce1" opacity=".95"/><title>{t("anterior_chamber")}</title></g>
    <g {...region("cornea")}><path d="M129 91 C76 101 76 185 129 196 L134 187 C94 174 94 113 134 101Z" fill="#7fbac7" stroke="#528e9c" strokeWidth="1.5"/><title>{t("cornea")}</title></g>
    <g {...region("iris")}><path d="M140 93 L151 96 L151 129 L140 127Z M140 159 L151 157 L151 188 L140 192Z" fill="#9c7848" stroke="#75562e" strokeWidth="2"/><title>{t("iris")}</title></g>
    <g {...region("lens")}><ellipse cx="162" cy="143" rx="15" ry="38" fill="#f0d695" stroke="#c3a569" strokeWidth="2"/><path d="M158 117 Q150 140 157 165" fill="none" stroke="#fff" strokeWidth="2" opacity=".7"/><title>{t("lens")}</title></g>
    <g className="diagram-callouts" aria-hidden="true"><path d="M167 114 178 24H229 M326 151 367 198H420 M114 143H29"/><circle cx="167" cy="114" r="3"/><circle cx="326" cy="151" r="3"/><circle cx="114" cy="143" r="3"/></g>
  </svg>;
}
