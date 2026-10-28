import assert from "node:assert/strict";
import test from "node:test";
import { ROLE_PERMISSIONS } from "../src/lib/access";
import { spectacleInputSchema } from "../src/lib/optics";
import { visiblePages } from "../src/lib/navigation";

const valid = {
  encounterId: "11111111-1111-4111-8111-111111111111", encounterVersion: 1,
  odSphere: -1.25, odCylinder: -0.5, odAxis: 90, odAdd: null, odPrism: "",
  osSphere: -1, osCylinder: null, osAxis: null, osAdd: null, osPrism: "",
  pd: 62.5, lensType: "distance" as const, instructions: "Anti-reflective coating",
};

test("spectacle prescription validates bilateral refraction and PD", () => {
  assert.equal(spectacleInputSchema.safeParse(valid).success, true);
  assert.equal(spectacleInputSchema.safeParse({ ...valid, pd: 20 }).success, false);
  assert.equal(spectacleInputSchema.safeParse({ ...valid, odAxis: null }).success, false);
});

test("optician sees optics and patient records without clinical editing", () => {
  assert.deepEqual(ROLE_PERMISSIONS.optician, ["patient:read", "optics:write"]);
  assert.deepEqual(visiblePages({ roles: ["optician"], permissions: [...ROLE_PERMISSIONS.optician] }), ["overview", "optics", "patients"]);
  assert.equal(ROLE_PERMISSIONS.doctor.includes("optics:order"), true);
});
