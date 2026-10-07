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
    eye: "OD", procedure: "Cataract extraction", stage: "preop", procedureCode: "cataract-phaco-iol", surgeonId: "surgeon",
    consents: [{ version: 1, eye: "OD", procedure: "Cataract extraction", status: "created" }], preop: { biometryVerified: true, medicalClearance: false, pupilDilation: false },
  });
  assert.equal(incomplete.status, "action_required");
  assert.deepEqual(incomplete.blockers, ["Consent awaiting doctor confirmation", "Medical clearance incomplete", "Pupil dilation not confirmed"]);
  const ready = surgeryReadiness({
    eye: "OS", procedure: "Cataract extraction", stage: "scheduled", procedureCode: "cataract-phaco-iol", surgeonId: "surgeon",
    consents: [{ version: 1, eye: "OS", procedure: "Cataract extraction", status: "confirmed" }], preop: { biometryVerified: true, medicalClearance: true, pupilDilation: true },
  });
  assert.equal(ready.status, "ready");
  assert.deepEqual(ready.blockers, []);
});

test("only the latest matching consent version can make a case ready", () => {
  const readiness = surgeryReadiness({
    eye: "OD", procedure: "Cataract extraction", stage: "scheduled", procedureCode: null, surgeonId: "surgeon",
    consents: [
      { version: 1, eye: "OD", procedure: "Cataract extraction", status: "confirmed" },
      { version: 2, eye: "OD", procedure: "Cataract extraction", status: "withdrawn" },
    ], preop: null,
  });
  assert.equal(readiness.status, "action_required");
  assert.deepEqual(readiness.blockers, ["Latest consent withdrawn"]);
});

test("theatre dates use the hospital timezone", () => {
  assert.equal(karachiDate("2026-10-06T20:30:00.000Z"), "2026-10-07");
});
