import assert from "node:assert/strict";
import test from "node:test";
import { ROLE_PERMISSIONS } from "../src/lib/access";
import { opticsDispenseInputSchema, opticsReferralInputSchema } from "../src/lib/optics";
import { visiblePages } from "../src/lib/navigation";

const validSuggestion = {
  encounterId: "11111111-1111-4111-8111-111111111111", encounterVersion: 1, doctorSuggestion: true,
  odSphere: -1.25, odCylinder: -0.5, odAxis: 90, odAdd: null, odPrism: "",
  osSphere: -1, osCylinder: null, osAxis: null, osAdd: null, osPrism: "",
  pd: 62.5, lensType: "distance" as const, instructions: "Anti-reflective coating", referralNote: "Review for distance glasses",
};

test("optics referral accepts an optional doctor suggestion", () => {
  assert.equal(opticsReferralInputSchema.safeParse(validSuggestion).success, true);
  assert.equal(opticsReferralInputSchema.safeParse({ ...validSuggestion, pd: 20 }).success, false);
  assert.equal(opticsReferralInputSchema.safeParse({ ...validSuggestion, odAxis: null }).success, false);
  assert.equal(opticsReferralInputSchema.safeParse({ ...validSuggestion, doctorSuggestion: false, odSphere: null, odCylinder: null, odAxis: null, osSphere: null, pd: null, lensType: null, instructions: "" }).success, true);
});

test("optician sees optics referrals and patients without write access", () => {
  assert.deepEqual(ROLE_PERMISSIONS.optician, ["document:read", "patient:read", "optics:read", "optics:dispense"]);
  assert.deepEqual(visiblePages({ roles: ["optician"], permissions: [...ROLE_PERMISSIONS.optician] }), ["overview", "optics", "patients"]);
  assert.equal(ROLE_PERMISSIONS.doctor.includes("optics:order"), true);
});

test("hospital dispense captures immutable dated glasses readings", () => {
  const dispense = { referralId: validSuggestion.encounterId, dispensedAt: "2026-10-20", odSphere: -1.25, odCylinder: -0.5, odAxis: 90, odAdd: null, odPrism: "", osSphere: -1, osCylinder: null, osAxis: null, osAdd: null, osPrism: "", pd: 62.5, lensType: "distance" as const, note: "First pair supplied" };
  assert.equal(opticsDispenseInputSchema.safeParse(dispense).success, true);
  assert.equal(opticsDispenseInputSchema.safeParse({ ...dispense, pd: 20 }).success, false);
  assert.equal(opticsDispenseInputSchema.safeParse({ ...dispense, odAxis: null }).success, false);
});
