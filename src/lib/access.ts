export const ROLES = ["receptionist", "nurse", "senior_technician", "doctor", "lab_assistant", "machine_operator", "ot_coordinator", "pharmacist", "optician", "cashier", "inventory_officer", "hospital_admin", "security_admin", "auditor"] as const;
export type Role = typeof ROLES[number];
export const ASSIGNABLE_ROLES = ["receptionist", "nurse", "senior_technician", "doctor", "lab_assistant", "machine_operator", "ot_coordinator", "pharmacist", "optician", "hospital_admin", "security_admin", "auditor"] as const satisfies readonly Role[];
export const PERMISSIONS = ["document:read", "document:upload", "document:export", "lab:write", "lab:order", "machine:order", "machine:write", "optics:order", "optics:read", "optics:dispense", "patient:read", "patient:create", "audit:read", "intake:read", "appointment:create", "appointment:checkin", "queue:workup", "workup:read", "workup:write", "workup:review", "investigation:write", "queue:handoff", "clinical:read", "clinical:write", "clinical:sign", "prescription:read", "surgery:read", "surgery:write", "management:read", "admin:read", "staff:write", "account:create", "account:manage", "settings:write", "patient:edit", "appointment:manage", "queue:manage", "history:write", "reports:read"] as const;
export type Permission = typeof PERMISSIONS[number];
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  receptionist: ["reports:read", "appointment:manage", "queue:manage", "patient:read", "patient:create", "patient:edit", "intake:read", "appointment:create", "appointment:checkin", "queue:workup"],
  nurse: ["document:read", "document:upload", "reports:read", "surgery:read", "surgery:write", "history:write", "patient:read", "intake:read", "queue:workup", "workup:read", "workup:write", "investigation:write", "clinical:read", "lab:order"],
  senior_technician: ["document:read", "document:upload", "document:export", "reports:read", "surgery:read", "surgery:write", "history:write", "queue:manage", "patient:read", "intake:read", "queue:workup", "workup:read", "workup:write", "workup:review", "investigation:write", "queue:handoff", "clinical:read", "lab:order", "machine:order"],
  doctor: ["document:read", "document:upload", "document:export", "surgery:read", "surgery:write", "management:read", "reports:read", "history:write", "queue:manage", "patient:read", "intake:read", "workup:read", "clinical:read", "clinical:write", "clinical:sign", "prescription:read", "lab:order", "machine:order", "optics:order"],
  lab_assistant: ["document:read", "document:upload", "patient:read", "intake:read", "workup:read", "investigation:write", "queue:handoff", "lab:write"],
  machine_operator: ["document:read", "document:upload", "patient:read", "intake:read", "workup:read", "investigation:write", "queue:handoff", "machine:write"],
  ot_coordinator: ["document:read", "patient:read", "surgery:read", "surgery:write"],
  pharmacist: ["document:read", "patient:read", "prescription:read"],
  optician: ["document:read", "patient:read", "optics:read", "optics:dispense"],
  cashier: [],
  inventory_officer: [],
  hospital_admin: ["document:read", "document:export", "surgery:read", "surgery:write", "management:read", "reports:read", "appointment:manage", "queue:manage", "admin:read", "staff:write", "account:create", "account:manage", "settings:write", "patient:read", "patient:create", "patient:edit", "audit:read", "intake:read", "appointment:create", "appointment:checkin", "queue:workup"],
  security_admin: ["reports:read", "admin:read", "staff:write", "account:create", "account:manage", "audit:read"],
  auditor: ["document:read", "document:export", "surgery:read", "management:read", "reports:read", "admin:read", "audit:read"],
};
export type AuthUser = { id: string; tenantId: string; tenantName: string; isDemo: boolean; name: string; email: string; roles: Role[]; permissions: Permission[]; facilityIds: string[]; mustChangePassword?: boolean };
export type Session = { user: AuthUser; tokenHash: string };

export function hasPermission(user: AuthUser, permission: Permission) { return user.permissions.includes(permission); }
