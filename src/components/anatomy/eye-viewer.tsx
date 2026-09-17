"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useState, type ReactNode } from "react";
import { Check, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { ANATOMY_SITES, SITE_COLORS, type AnatomySite, type Eye, type ViewMode } from "@/lib/anatomy";
import { useLocale } from "@/components/locale-provider";
import { EyeDiagram } from "./eye-diagram";

function SceneLoading() {
  const { t } = useLocale();
  return <div className="scene-loading"><span className="loading-orbit"/><strong>{t("loadingModel")}</strong><span>{t("loadingDetail")}</span></div>;
}
const EyeScene = dynamic(() => import("./eye-scene"), { ssr: false, loading: SceneLoading });

class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode; onUnavailable: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onUnavailable(); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch { return false; }
}

type Props = {
  eye: Eye; selected: AnatomySite | null; onSelect: (site: AnatomySite) => void;
  view: ViewMode; cutaway: boolean; onUnavailable: () => void;
};

export function EyeViewer({ eye, selected, onSelect, view, cutaway, onUnavailable }: Props) {
  const { t } = useLocale();
  const [resetKey, setResetKey] = useState(0);
  const [zoom, setZoom] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); if (!supportsWebGL()) onUnavailable(); }, [onUnavailable]);
  const diagram = <EyeDiagram eye={eye} selected={selected} onSelect={onSelect} />;

  return <section className={`eye-card eye-${eye.toLowerCase()}`} aria-labelledby={`heading-${eye}`}>
    <div className="eye-card-header">
      <div className="eye-heading"><span className="eye-badge" dir="ltr">{eye}</span><h3 id={`heading-${eye}`}>{t(eye === "OD" ? "rightEye" : "leftEye")}</h3></div>
      <span className="eye-view-caption">{t(view === "2d" ? "twoD" : cutaway ? "cutaway" : "fullEye")}</span>
    </div>
    <div className="eye-stage" dir="ltr">
      <span className="stage-watermark" aria-hidden="true">{eye}</span>
      {view === "2d" ? diagram : ready ? <SceneBoundary key={view} onUnavailable={onUnavailable} fallback={diagram}>
        <EyeScene eye={eye} selected={selected} onSelect={onSelect} cutaway={cutaway} resetKey={resetKey} zoom={zoom} onUnavailable={onUnavailable} />
      </SceneBoundary> : <SceneLoading />}
      {view === "3d" && <div className="viewer-tools">
        <button type="button" aria-label={`${eye} ${t("zoomIn")}`} title={t("zoomIn")} disabled={zoom >= 4} onClick={() => setZoom(z => Math.min(4, z + 1))}><ZoomIn size={15}/></button>
        <button type="button" aria-label={`${eye} ${t("zoomOut")}`} title={t("zoomOut")} disabled={zoom <= -4} onClick={() => setZoom(z => Math.max(-4, z - 1))}><ZoomOut size={15}/></button>
        <button type="button" aria-label={`${eye} ${t("resetView")}`} title={t("resetView")} onClick={() => { setZoom(0); setResetKey(k => k + 1); }}><RotateCcw size={15}/></button>
      </div>}
      <span className="viewer-hint">{t(view === "3d" ? "rotateHint" : "diagramHint")}</span>
    </div>
    <div className="eye-selection" aria-live="polite"><span className="selection-dot" style={{ background: selected ? SITE_COLORS[selected] : undefined }}/><span>{selected ? t(selected) : t("noneSelected")}</span>{selected && <Check size={14}/>}</div>
    <div className="structure-picker" role="group" aria-label={`${eye} ${t("selectStructure")}`}>
      {ANATOMY_SITES.map(site => <button key={site} type="button" data-testid={`select-${eye}-${site}`} aria-pressed={selected === site} title={t(`${site}_detail`)} onClick={() => onSelect(site)} className={selected === site ? "structure selected" : "structure"}>
        <span style={{ background: SITE_COLORS[site] }}/>{t(site)}
      </button>)}
    </div>
  </section>;
}
