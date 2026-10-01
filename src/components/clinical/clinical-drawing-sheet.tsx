"use client";

import { useEffect, useRef, useState } from "react";
import { Hand, MapPin, Maximize2, Pencil, Redo2, RotateCcw, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import type { ClinicalDrawings } from "@/lib/clinical";
import {
  CLINICAL_MARKER_CATALOGUE,
  clinicalMarkerDefinition,
  clinicalMarkersForTemplate,
  markerAllowedOnTemplate,
  suggestedDrawingSection,
  type ClinicalMarkerType,
  type DrawingSection,
} from "@/lib/clinical-drawing";

type Eye = "OD" | "OS";
type EyeDrawing = ClinicalDrawings[Eye];
type Stroke = EyeDrawing["strokes"][number];
type Marker = EyeDrawing["markers"][number];
type Tool = "draw" | "marker" | "pan";
type View = { zoom: number; cx: number; cy: number };

const EYES: readonly Eye[] = ["OD", "OS"];
const COLORS = ["#7f1d1d", "#1d4ed8", "#15803d", "#111827"] as const;
const EMPTY_HISTORY: Record<Eye, EyeDrawing[]> = { OD: [], OS: [] };
const DEFAULT_VIEWS: Record<Eye, View> = { OD: { zoom: 1, cx: 500, cy: 250 }, OS: { zoom: 1, cx: 500, cy: 250 } };

function Template({ kind }: { kind: EyeDrawing["template"] }) {
  if (kind === "blank") return <path d="M0 250H1000M500 0V500" stroke="#d8ddd5" strokeWidth="2" strokeDasharray="12 12" />;
  if (kind === "anterior") return <g fill="none" stroke="#9aa894"><ellipse cx="500" cy="250" rx="360" ry="205" strokeWidth="8" /><circle cx="500" cy="250" r="145" strokeWidth="7" /><circle cx="500" cy="250" r="58" fill="#eef1ea" strokeWidth="6" /><path d="M150 250Q500 75 850 250Q500 425 150 250Z" strokeWidth="3" /></g>;
  return <g fill="none" stroke="#9aa894"><circle cx="500" cy="250" r="215" strokeWidth="8" /><circle cx="650" cy="235" r="54" fill="#eef1ea" strokeWidth="6" /><circle cx="420" cy="250" r="20" fill="#aeb9a8" strokeWidth="4" /><path d="M650 180C570 210 520 235 440 248M650 290C570 275 520 262 440 252M650 235C720 175 760 140 795 95" strokeWidth="5" /></g>;
}

function MarkerSymbol({ marker }: { marker: Marker }) {
  const definition = clinicalMarkerDefinition(marker.type);
  const transform = `translate(${marker.x} ${marker.y}) rotate(${marker.rotation}) scale(${marker.size / 40})`;
  let symbol: React.ReactNode;
  switch (marker.type) {
    case "retinal_tear": symbol = <path d="M0 -18L18 15L-18 15Z" fill="none" stroke={definition.color} strokeWidth="6" />; break;
    case "retinal_haemorrhage": symbol = <path d="M0 -20C13 -6 18 3 18 11A18 18 0 1 1-18 11C-18 3-13-6 0-20Z" fill={definition.color} opacity=".82" />; break;
    case "hard_exudate": symbol = <path d="M0 -19L5 -6L19 -6L8 3L12 17L0 9L-12 17L-8 3L-19-6L-5-6Z" fill={definition.color} />; break;
    case "laser_spot": symbol = <g fill={definition.color}>{[[-12,-12],[12,-12],[-12,12],[12,12],[0,0]].map(([x,y])=><circle key={`${x}:${y}`} cx={x} cy={y} r="5" />)}</g>; break;
    case "optic_disc_cupping": symbol = <g fill="none" stroke={definition.color}><circle r="20" strokeWidth="5" /><circle r="11" strokeWidth="4" /></g>; break;
    case "corneal_scar": symbol = <g stroke={definition.color} strokeWidth="6" strokeLinecap="round"><path d="M-17-10L16 12M-14 15L13-14" /></g>; break;
    case "corneal_graft": symbol = <circle r="20" fill="none" stroke={definition.color} strokeWidth="5" strokeDasharray="8 5" />; break;
    case "intraocular_lens": symbol = <g fill="none" stroke={definition.color} strokeWidth="4"><ellipse rx="17" ry="13" /><path d="M-17 0C-30-15-30 15-17 0M17 0C30-15 30 15 17 0" /></g>; break;
    case "drainage_tube": symbol = <g fill="none" stroke={definition.color} strokeWidth="6" strokeLinecap="round"><path d="M-20 15Q-5-20 20-12" /><circle cx="20" cy="-12" r="6" fill={definition.color} /></g>; break;
  }
  return <g transform={transform} pointerEvents="none"><title>{marker.label || definition.label}</title>{symbol}</g>;
}

function path(points: readonly (readonly [number, number])[]) {
  return points.map((point, index) => `${index ? "L" : "M"}${point[0]} ${point[1]}`).join(" ");
}

function clampView(view: View): View {
  const zoom = Math.max(1, Math.min(4, view.zoom));
  const halfWidth = 500 / zoom, halfHeight = 250 / zoom;
  return { zoom, cx: Math.max(halfWidth, Math.min(1000 - halfWidth, view.cx)), cy: Math.max(halfHeight, Math.min(500 - halfHeight, view.cy)) };
}

export function ClinicalDrawingSheet({
  value,
  onChange,
  disabled,
  sections = [],
  recordKey = "drawing",
  showCatalogueNote = true,
}: {
  value: ClinicalDrawings;
  onChange: (value: ClinicalDrawings) => void;
  disabled: boolean;
  sections?: readonly DrawingSection[];
  recordKey?: string;
  showCatalogueNote?: boolean;
}) {
  const [tool, setTool] = useState<Tool>("draw");
  const [color, setColor] = useState<(typeof COLORS)[number]>(COLORS[0]);
  const [width, setWidth] = useState(6);
  const [markerSize, setMarkerSize] = useState(42);
  const [markerRotation, setMarkerRotation] = useState(0);
  const [markerLabel, setMarkerLabel] = useState("");
  const [markerTypes, setMarkerTypes] = useState<Record<Eye, ClinicalMarkerType>>({ OD: "retinal_tear", OS: "retinal_tear" });
  const [active, setActive] = useState<{ eye: Eye; stroke: Stroke } | null>(null);
  const [undoStacks, setUndoStacks] = useState<Record<Eye, EyeDrawing[]>>(EMPTY_HISTORY);
  const [redoStacks, setRedoStacks] = useState<Record<Eye, EyeDrawing[]>>(EMPTY_HISTORY);
  const [views, setViews] = useState<Record<Eye, View>>(DEFAULT_VIEWS);
  const activeRef = useRef<{ eye: Eye; stroke: Stroke } | null>(null);
  const panRef = useRef<{ eye: Eye; pointerId: number; x: number; y: number; view: View } | null>(null);
  const svgRefs = useRef<Record<Eye, SVGSVGElement | null>>({ OD: null, OS: null });

  useEffect(() => {
    setUndoStacks({ OD: [], OS: [] });
    setRedoStacks({ OD: [], OS: [] });
    setViews({ OD: { zoom: 1, cx: 500, cy: 250 }, OS: { zoom: 1, cx: 500, cy: 250 } });
    activeRef.current = null;
    panRef.current = null;
    setActive(null);
  }, [recordKey]);

  function viewBox(eye: Eye) {
    const view = views[eye], width = 1000 / view.zoom, height = 500 / view.zoom;
    return `${view.cx - width / 2} ${view.cy - height / 2} ${width} ${height}`;
  }

  function point(eye: Eye, event: React.PointerEvent<SVGSVGElement>): [number, number] {
    const box = svgRefs.current[eye]!.getBoundingClientRect(), view = views[eye];
    const viewWidth = 1000 / view.zoom, viewHeight = 500 / view.zoom;
    return [
      Math.round(Math.max(0, Math.min(1000, view.cx - viewWidth / 2 + (event.clientX - box.left) / box.width * viewWidth))),
      Math.round(Math.max(0, Math.min(500, view.cy - viewHeight / 2 + (event.clientY - box.top) / box.height * viewHeight))),
    ];
  }

  function commit(eye: Eye, drawing: EyeDrawing) {
    setUndoStacks(current => ({ ...current, [eye]: [...current[eye], structuredClone(value[eye])].slice(-30) }));
    setRedoStacks(current => ({ ...current, [eye]: [] }));
    onChange({ ...value, [eye]: drawing });
  }

  function undo(eye: Eye) {
    const stack = undoStacks[eye], prior = stack.at(-1);
    if (!prior) return;
    setUndoStacks(current => ({ ...current, [eye]: current[eye].slice(0, -1) }));
    setRedoStacks(current => ({ ...current, [eye]: [...current[eye], structuredClone(value[eye])].slice(-30) }));
    onChange({ ...value, [eye]: prior });
  }

  function redo(eye: Eye) {
    const stack = redoStacks[eye], next = stack.at(-1);
    if (!next) return;
    setRedoStacks(current => ({ ...current, [eye]: current[eye].slice(0, -1) }));
    setUndoStacks(current => ({ ...current, [eye]: [...current[eye], structuredClone(value[eye])].slice(-30) }));
    onChange({ ...value, [eye]: next });
  }

  function start(eye: Eye, event: React.PointerEvent<SVGSVGElement>) {
    if (tool === "pan") {
      event.currentTarget.setPointerCapture(event.pointerId);
      panRef.current = { eye, pointerId: event.pointerId, x: event.clientX, y: event.clientY, view: views[eye] };
      return;
    }
    if (disabled) return;
    if (tool === "marker") {
      const type = markerTypes[eye];
      if (!markerAllowedOnTemplate(type, value[eye].template)) return;
      const [x, y] = point(eye, event);
      const marker: Marker = { id: crypto.randomUUID(), type, x, y, size: markerSize, rotation: markerRotation, label: markerLabel.trim() };
      commit(eye, { ...value[eye], markers: [...(value[eye].markers ?? []), marker].slice(-60) });
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = { eye, stroke: { id: crypto.randomUUID(), color, width, points: [point(eye, event)] } };
    activeRef.current = next;
    setActive(next);
  }

  function move(eye: Eye, event: React.PointerEvent<SVGSVGElement>) {
    const pan = panRef.current;
    if (tool === "pan" && pan?.eye === eye && pan.pointerId === event.pointerId) {
      const box = event.currentTarget.getBoundingClientRect();
      setViews(current => ({ ...current, [eye]: clampView({ ...pan.view, cx: pan.view.cx - (event.clientX - pan.x) / box.width * (1000 / pan.view.zoom), cy: pan.view.cy - (event.clientY - pan.y) / box.height * (500 / pan.view.zoom) }) }));
      return;
    }
    const current = activeRef.current;
    if (tool !== "draw" || !current || current.eye !== eye || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const nextPoint = point(eye, event), last = current.stroke.points.at(-1)!;
    if (Math.hypot(nextPoint[0] - last[0], nextPoint[1] - last[1]) < 4 / views[eye].zoom) return;
    const next = { ...current, stroke: { ...current.stroke, points: [...current.stroke.points, nextPoint].slice(0, 240) } };
    activeRef.current = next;
    setActive(next);
  }

  function finish() {
    if (panRef.current) panRef.current = null;
    const current = activeRef.current;
    if (!current) return;
    if (current.stroke.points.length > 1) commit(current.eye, { ...value[current.eye], strokes: [...value[current.eye].strokes, current.stroke].slice(-40) });
    activeRef.current = null;
    setActive(null);
  }

  function changeTemplate(eye: Eye, template: EyeDrawing["template"]) {
    const allowed = clinicalMarkersForTemplate(template);
    const markers = (value[eye].markers ?? []).filter(marker => markerAllowedOnTemplate(marker.type, template));
    const selected = markerTypes[eye];
    setMarkerTypes(current => ({ ...current, [eye]: markerAllowedOnTemplate(selected, template) ? selected : allowed[0].type }));
    const suggested = suggestedDrawingSection(sections, template);
    commit(eye, { ...value[eye], template, markers, sectionId: suggested.id, sectionLabel: suggested.title });
  }

  function changeSection(eye: Eye, id: string) {
    const section = sections.find(item => item.id === id);
    if (section) commit(eye, { ...value[eye], sectionId: section.id, sectionLabel: section.title });
  }

  function zoom(eye: Eye, factor: number) {
    setViews(current => ({ ...current, [eye]: clampView({ ...current[eye], zoom: current[eye].zoom * factor }) }));
  }

  return <div className="clinical-drawing-sheet">
    <div className="drawing-tools">
      <div><strong>Clinical drawing sheet</strong><span>Use freehand ink or place structured markers.</span></div>
      <div className="drawing-tool-switch" role="group" aria-label="Drawing tool">
        <button type="button" aria-pressed={tool === "draw"} onClick={() => setTool("draw")} disabled={disabled}><Pencil size={15} />Freehand</button>
        <button type="button" aria-pressed={tool === "marker"} onClick={() => setTool("marker")} disabled={disabled}><MapPin size={15} />Marker</button>
        <button type="button" aria-pressed={tool === "pan"} onClick={() => setTool("pan")}><Hand size={15} />Pan</button>
      </div>
      {tool === "draw" ? <div className="drawing-options">
        {COLORS.map(item => <button key={item} type="button" className="drawing-color" aria-label={`Ink ${item}`} aria-pressed={color === item} style={{ background: item }} onClick={() => setColor(item)} disabled={disabled} />)}
        <label>Width <input type="range" min="2" max="16" value={width} onChange={event => setWidth(Number(event.target.value))} disabled={disabled} /></label>
      </div> : tool === "marker" ? <div className="drawing-options marker-options">
        <label>Size <input type="range" min="20" max="90" value={markerSize} onChange={event => setMarkerSize(Number(event.target.value))} disabled={disabled} /></label>
        <label>Rotation <input type="range" min="-180" max="180" step="15" value={markerRotation} onChange={event => setMarkerRotation(Number(event.target.value))} disabled={disabled} /></label>
        <label>Clinical label <input type="text" maxLength={120} value={markerLabel} onChange={event => setMarkerLabel(event.target.value)} disabled={disabled} placeholder="Optional note" /></label>
      </div> : <p className="drawing-pan-help">Drag either drawing to inspect a zoomed area.</p>}
    </div>
    <div className="drawing-eye-grid" dir="ltr">
      {EYES.map(eye => {
        const drawing = value[eye], markers = drawing.markers ?? [];
        const strokes = [...drawing.strokes, ...(active?.eye === eye ? [active.stroke] : [])];
        const availableMarkers = clinicalMarkersForTemplate(drawing.template);
        return <section key={eye} className="drawing-eye">
          <header>
            <strong>{eye} · {eye === "OD" ? "Right eye" : "Left eye"}</strong>
            <select aria-label={`${eye} drawing template`} value={drawing.template} disabled={disabled} onChange={event => changeTemplate(eye, event.target.value as EyeDrawing["template"])}><option value="fundus">Fundus</option><option value="anterior">Anterior segment</option><option value="blank">Blank sheet</option></select>
            <button type="button" className="icon-button" aria-label={`Undo ${eye}`} title="Undo last drawing change" disabled={disabled || !undoStacks[eye].length} onClick={() => undo(eye)}><RotateCcw size={15} /></button>
            <button type="button" className="icon-button" aria-label={`Redo ${eye}`} title="Redo drawing change" disabled={disabled || !redoStacks[eye].length} onClick={() => redo(eye)}><Redo2 size={15} /></button>
            <button type="button" className="icon-button" aria-label={`Clear ${eye}`} title="Clear this drawing" disabled={disabled || (!drawing.strokes.length && !markers.length)} onClick={() => commit(eye, { ...drawing, strokes: [], markers: [] })}><Trash2 size={15} /></button>
          </header>
          <div className="drawing-context">
            {sections.length ? <label>Examination section<select aria-label={`${eye} examination section`} value={drawing.sectionId} disabled={disabled} onChange={event => changeSection(eye, event.target.value)}>{sections.map(section => <option key={section.id} value={section.id}>{section.title}</option>)}</select></label> : <span>{drawing.sectionLabel || "Clinical drawing"}</span>}
            <div className="drawing-zoom" role="group" aria-label={`${eye} zoom controls`}><button type="button" className="icon-button" aria-label={`Zoom out ${eye}`} disabled={views[eye].zoom <= 1} onClick={() => zoom(eye, .8)}><ZoomOut size={14} /></button><span>{Math.round(views[eye].zoom * 100)}%</span><button type="button" className="icon-button" aria-label={`Zoom in ${eye}`} disabled={views[eye].zoom >= 4} onClick={() => zoom(eye, 1.25)}><ZoomIn size={14} /></button><button type="button" className="icon-button" aria-label={`Reset zoom ${eye}`} onClick={() => setViews(current => ({ ...current, [eye]: { zoom: 1, cx: 500, cy: 250 } }))}><Maximize2 size={14} /></button></div>
          </div>
          {tool === "marker" && <div className="marker-picker"><label>Marker<select aria-label={`${eye} marker type`} disabled={disabled} value={markerTypes[eye]} onChange={event => setMarkerTypes(current => ({ ...current, [eye]: event.target.value as ClinicalMarkerType }))}>{availableMarkers.map(marker => <option key={marker.type} value={marker.type}>{marker.label}</option>)}</select></label><span>Tap the diagram to place it.</span></div>}
          <svg ref={node => { svgRefs.current[eye] = node; }} viewBox={viewBox(eye)} role="img" aria-label={`${eye} clinical drawing`} className={`drawing-${tool}`} onPointerDown={event => start(eye, event)} onPointerMove={event => move(eye, event)} onPointerUp={finish} onPointerCancel={() => { activeRef.current = null; panRef.current = null; setActive(null); }}>
            <rect width="1000" height="500" fill="#fbfcfa" />
            <Template kind={drawing.template} />
            {strokes.map(stroke => <path key={stroke.id} d={path(stroke.points)} fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" />)}
            {markers.map(marker => <MarkerSymbol key={marker.id} marker={marker} />)}
          </svg>
          {markers.length > 0 && <ul className="drawing-marker-list" aria-label={`${eye} structured markers`}>{markers.map(marker => { const definition = clinicalMarkerDefinition(marker.type); return <li key={marker.id}><span style={{ color: definition.color }}>●</span><span><strong>{definition.label}</strong>{marker.label && <small>{marker.label}</small>}</span>{!disabled && <button type="button" className="icon-button" aria-label={`Remove ${eye} ${definition.label}`} onClick={() => commit(eye, { ...drawing, markers: markers.filter(item => item.id !== marker.id) })}><Trash2 size={13} /></button>}</li>; })}</ul>}
        </section>;
      })}
    </div>
    {showCatalogueNote && <p className="drawing-catalogue-note">Initial marker catalogue: {CLINICAL_MARKER_CATALOGUE.length} markers. Clinical review and approval are required before production use.</p>}
  </div>;
}
