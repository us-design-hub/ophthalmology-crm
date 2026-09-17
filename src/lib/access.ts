export const ROLES = ["receptionist", "nurse", "optometrist", "doctor", "pharmacist", "cashier", "inventory_officer", "hospital_admin", "security_admin", "auditor"] as const;
export type Role = typeof ROLES[number];
export const PERMISSIONS = ["patient:read", "patient:create", "audit:read", "anatomy:use", "intake:read", "appointment:create", "appointment:checkin", "queue:workup", "workup:read", "workup:write", "queue:handoff", "clinical:read", "clinical:write", "clinical:sign", "prescription:read", "preview:inventory", "preview:billing", "preview:surgery", "preview:management", "preview:admin", "admin:read", "staff:write", "account:create", "account:manage", "settings:write", "patient:edit", "appointment:manage", "queue:manage", "history:write", "inventory:write", "pharmacy:dispense", "billing:write", "billing:discount", "billing:approve_refund", "surgery:write", "reports:read"] as const;
export type Permission = typeof PERMISSIONS[number];
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  receptionist: ["reports:read", "patient:edit", "appointment:manage", "queue:manage", "patient:read", "patient:create", "intake:read", "appointment:create", "appointment:checkin", "queue:workup"],
  nurse: ["reports:read", "surgery:write", "history:write", "queue:manage", "patient:read", "anatomy:use", "intake:read", "queue:workup", "workup:read", "workup:write", "queue:handoff", "clinical:read", "preview:surgery"],
  optometrist: ["reports:read", "history:write", "patient:read", "anatomy:use", "intake:read", "queue:workup", "workup:read", "workup:write", "queue:handoff", "clinical:read", "preview:surgery"],
  doctor: ["surgery:write", "reports:read", "history:write", "queue:manage", "patient:read", "anatomy:use", "intake:read", "workup:read", "clinical:read", "clinical:write", "clinical:sign", "prescription:read", "preview:inventory", "preview:billing", "preview:surgery", "preview:management"],
  pharmacist: ["pharmacy:dispense", "reports:read", "patient:read", "prescription:read", "preview:inventory"],
  cashier: ["billing:write", "reports:read", "patient:read", "preview:billing"],
  inventory_officer: ["inventory:write", "reports:read", "preview:inventory"],
  hospital_admin: ["billing:discount", "billing:approve_refund", "inventory:write", "surgery:write", "reports:read", "patient:edit", "appointment:manage", "queue:manage", "admin:read", "staff:write", "account:create", "settings:write", "patient:read", "patient:create", "audit:read", "anatomy:use", "intake:read", "appointment:create", "appointment:checkin", "queue:workup", "preview:inventory", "preview:billing", "preview:surgery", "preview:management", "preview:admin"],
  security_admin: ["reports:read", "admin:read", "staff:write", "account:create", "account:manage", "audit:read", "preview:admin"],
  auditor: ["reports:read", "admin:read", "audit:read", "preview:inventory", "preview:billing", "preview:surgery", "preview:management", "preview:admin"],
};
export type AuthUser = { id: string; tenantId: string; tenantName: string; name: string; email: string; roles: Role[]; permissions: Permission[]; facilityIds: string[]; mustChangePassword?: boolean };
export type Session = { user: AuthUser; tokenHash: string };

export function hasPermission(user: AuthUser, permission: Permission) { return user.permissions.includes(permission); }
