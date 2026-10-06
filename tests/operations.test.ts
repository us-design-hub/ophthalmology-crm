import assert from "node:assert/strict";
import test from "node:test";
import { ROLE_PERMISSIONS, PERMISSIONS } from "../src/lib/access";
import { STAGES } from "../src/lib/intake";
import { karachiDate, surgeryReadiness } from "../src/lib/surgery-worklist";

test("active queue stages include specialty checkpoints and end at consultation", () => {
  assert.deepEqual(STAGES, ["waiting", "workup", "testing", "imaging", "dilation", "consultation"]);
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

test("theatre readiness names each missing surgical prerequisite", () => {
  const incomplete = surgeryReadiness({
    eye: "OD", stage: "preop", procedureCode: "cataract-phaco-iol", surgeonId: "surgeon",
    documents: [], preop: { biometryVerified: true, medicalClearance: false, pupilDilation: false },
  });
  assert.equal(incomplete.status, "action_required");
  assert.deepEqual(incomplete.blockers, ["Signed consent missing", "Medical clearance incomplete", "Pupil dilation not confirmed"]);
  const ready = surgeryReadiness({
    eye: "OS", stage: "scheduled", procedureCode: "cataract-phaco-iol", surgeonId: "surgeon",
    documents: [{ eye: "OS" }], preop: { biometryVerified: true, medicalClearance: true, pupilDilation: true },
  });
  assert.equal(ready.status, "ready");
  assert.deepEqual(ready.blockers, []);
});

test("theatre dates use the hospital timezone", () => {
  assert.equal(karachiDate("2026-10-06T20:30:00.000Z"), "2026-10-07");
});
