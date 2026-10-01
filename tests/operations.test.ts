import assert from "node:assert/strict";
import test from "node:test";
import { ROLE_PERMISSIONS, PERMISSIONS } from "../src/lib/access";
import { STAGES } from "../src/lib/intake";

test("active queue stages end at consultation", () => {
  assert.deepEqual(STAGES, ["waiting", "workup", "dilation", "consultation"]);
});

test("retired finance, pharmacy, inventory, preview and practice permissions are absent", () => {
  for (const permission of ["anatomy:use", "preview:inventory", "preview:billing", "preview:surgery", "preview:management", "preview:admin", "inventory:write", "pharmacy:dispense", "billing:write", "billing:discount", "billing:approve_refund"]) assert.equal(PERMISSIONS.includes(permission as never), false);
  assert.deepEqual(ROLE_PERMISSIONS.pharmacist, []);
  assert.deepEqual(ROLE_PERMISSIONS.cashier, []);
  assert.deepEqual(ROLE_PERMISSIONS.inventory_officer, []);
});

test("surgery and management use explicit production read permissions", () => {
  assert.equal(ROLE_PERMISSIONS.doctor.includes("surgery:read"), true);
  assert.equal(ROLE_PERMISSIONS.doctor.includes("management:read"), true);
  assert.equal(ROLE_PERMISSIONS.auditor.includes("surgery:read"), true);
  assert.equal(ROLE_PERMISSIONS.auditor.includes("management:read"), true);
});
