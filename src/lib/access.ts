export const ROLES = ["receptionist", "nurse", "optometrist", "doctor", "pharmacist", "cashier", "inventory_officer", "hospital_admin", "security_admin", "auditor"] as const;
export type Role = typeof ROLES[number];
export const ASSIGNABLE_ROLES = ["receptionist", "nurse", "optometrist", "doctor", "hospital_admin", "security_admin", "auditor"] as const satisfies readonly Role[];
export const PERMISSIONS = ["patient:read", "patient:create", "audit:read", "anatomy:use", "intake:read", "appointment:create", "appointment:checkin", "queue:workup", "workup:read", "workup:write", "queue:handoff", "clinical:read", "clinical:write", "clinical:sign", "prescription:read", "preview:inventory", "preview:billing", "preview:surgery", "preview:management", "preview:admin", "admin:read", "staff:write", "account:create", "account:manage", "settings:write", "patient:edit", "appointment:manage", "queue:manage", "history:write", "inventory:write", "pharmacy:dispense", "billing:write", "billing:discount", "billing:approve_refund", "surgery:write", "reports:read"] as const;
export type Permission = typeof PERMISSIONS[number];
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  receptionist: ["reports:read", "appointment:manage", "queue:manage", "patient:read", "intake:read", "appointment:create", "appointment:checkin", "queue:workup"],
  nurse: ["reports:read", "surgery:write", "history:write", "queue:manage", "patient:read", "anatomy:use", "intake:read", "queue:workup", "workup:read", "workup:write", "queue:handoff", "clinical:read", "preview:surgery"],
  optometrist: ["reports:read", "history:write", "patient:read", "anatomy:use", "intake:read", "queue:workup", "workup:read", "workup:write", "queue:handoff", "clinical:read", "preview:surgery"],
  doctor: ["surgery:write", "reports:read", "history:write", "queue:manage", "patient:read", "anatomy:use", "intake:read", "workup:read", "clinical:read", "clinical:write", "clinical:sign", "prescription:read", "preview:surgery", "preview:management"],
  pharmacist: [],
  cashier: [],
  inventory_officer: [],
  hospital_admin: ["surgery:write", "reports:read", "appointment:manage", "queue:manage", "admin:read", "staff:write", "account:create", "settings:write", "patient:read", "audit:read", "anatomy:use", "intake:read", "appointment:create", "appointment:checkin", "queue:workup", "preview:surgery", "preview:management", "preview:admin"],
  security_admin: ["reports:read", "admin:read", "staff:write", "account:create", "account:manage", "audit:read", "preview:admin"],
  auditor: ["reports:read", "admin:read", "audit:read", "preview:surgery", "preview:management", "preview:admin"],
};
export type AuthUser = { id: string; tenantId: string; tenantName: string; isDemo: boolean; name: string; email: string; roles: Role[]; permissions: Permission[]; facilityIds: string[]; mustChangePassword?: boolean };
export type Session = { user: AuthUser; tokenHash: string };

export function hasPermission(user: AuthUser, permission: Permission) { return user.permissions.includes(permission); }
