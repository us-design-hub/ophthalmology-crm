import type { AuthUser, Permission, Role } from "./access";

export const PAGES = ["overview", "clinical", "queue", "laboratory", "diagnostics", "optics", "patients", "appointments", "prescriptions", "surgery", "management", "administration", "audit"] as const;
export type Page = typeof PAGES[number];

// Each role's sidebar lists only that role's own work. Server permissions
// still decide what every request may do; this decides what a role is shown.
const ROLE_PAGES: Record<Role, readonly Page[]> = {
  receptionist: ["overview", "patients", "appointments", "queue"],
  nurse: ["overview", "queue", "patients"],
  senior_technician: ["overview", "queue", "patients"],
  doctor: ["overview", "clinical", "prescriptions", "surgery", "patients"],
  lab_assistant: ["overview", "laboratory", "patients"],
  machine_operator: ["overview", "diagnostics", "patients"],
  ot_coordinator: ["overview", "surgery", "patients"],
  pharmacist: ["overview", "prescriptions", "patients"],
  optician: ["overview", "optics", "patients"],
  cashier: ["overview"],
  inventory_officer: ["overview"],
  hospital_admin: ["overview", "management", "administration", "audit", "patients", "appointments"],
  security_admin: ["overview", "administration", "audit"],
  auditor: ["overview", "audit", "management"],
};

// A page is also hidden when the account lacks the permission its data needs,
// so a role mapping can never show a page that would only return errors.
const PAGE_PERMISSION: Record<Page, Permission | null> = {
  overview: null,
  clinical: "clinical:read",
  queue: "intake:read",
  laboratory: "lab:write",
  diagnostics: "intake:read",
  optics: "optics:read",
  patients: "patient:read",
  appointments: "intake:read",
  prescriptions: "prescription:read",
  surgery: "surgery:read",
  management: "management:read",
  administration: "admin:read",
  audit: "audit:read",
};

// Pages for every role the user holds, in one stable order.
export function visiblePages(user: Pick<AuthUser, "roles" | "permissions">): Page[] {
  const assigned = new Set(user.roles.flatMap(role => ROLE_PAGES[role] ?? []));
  return PAGES.filter(page => assigned.has(page) && (PAGE_PERMISSION[page] === null || user.permissions.includes(PAGE_PERMISSION[page])));
}

// The workspace a user lands on: their main work rather than the overview.
export function landingPage(user: Pick<AuthUser, "roles" | "permissions">): Page {
  const pages = visiblePages(user);
  const preferred: Page[] = user.permissions.includes("clinical:write") ? ["clinical"] : user.permissions.includes("workup:write") ? ["queue"] : ["patients", "audit"];
  return preferred.find(page => pages.includes(page)) ?? pages.find(page => page !== "overview") ?? "overview";
}
