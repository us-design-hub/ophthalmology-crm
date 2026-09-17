export const EYES = ["OD", "OS"] as const;
export type Eye = (typeof EYES)[number];

// Stable clinical identifiers shared by 3D, 2D, and treatment-plan selection.
export const ANATOMY_SITES = [
  "cornea", "iris", "lens", "anterior_chamber", "vitreous", "retina",
  "macula", "optic_nerve", "sclera", "extraocular_muscles", "adnexa",
] as const;
export type AnatomySite = (typeof ANATOMY_SITES)[number];
export type ViewMode = "3d" | "2d";
export type Intent = "observation" | "medical" | "laser" | "surgical";
export type Selection = Record<Eye, AnatomySite | null>;
export type PlanRow = { id: string; eye: Eye; anatomySite: AnatomySite; intent: Intent; notes: string };

export const SITE_COLORS: Record<AnatomySite, string> = {
  cornea: "#7cbaca", iris: "#9b8050", lens: "#f2d399", anterior_chamber: "#aed9df",
  vitreous: "#ceddde", retina: "#cf8e73", macula: "#ac523f", optic_nerve: "#e7b974",
  sclera: "#e8e8dc", extraocular_muscles: "#b77364", adnexa: "#dcae9c",
};

export function isAnatomySite(value: unknown): value is AnatomySite {
  return typeof value === "string" && (ANATOMY_SITES as readonly string[]).includes(value);
}

export function selectSite(selection: Selection, eye: Eye, site: AnatomySite): Selection {
  if (!EYES.includes(eye) || !isAnatomySite(site)) throw new Error("Invalid anatomical selection");
  return { ...selection, [eye]: site };
}

export function appendSelection(rows: PlanRow[], selection: Selection, createId: () => string): PlanRow[] {
  const additions: PlanRow[] = [];
  for (const eye of EYES) {
    const site = selection[eye];
    if (!site) continue;
    if (!isAnatomySite(site)) throw new Error("Invalid anatomy site");
    if (rows.some(row => row.eye === eye && row.anatomySite === site)) continue;
    additions.push({ id: createId(), eye, anatomySite: site, intent: "observation", notes: "" });
  }
  return [...rows, ...additions];
}
