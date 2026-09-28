import assert from "node:assert/strict";
import test from "node:test";
import { parseOdooPatient } from "../src/lib/odoo";

const valid = {
  externalId: "odoo-res-partner-1842",
  externalUpdatedAt: "2026-09-28T14:30:00Z",
  givenName: "  Amina  ",
  familyName: "Khan",
  dob: "1988-04-19",
  gender: "female" as const,
  phone: "0300 1234567",
  identifierType: "cnic" as const,
  identifier: "42101-1234567-8",
};

test("Odoo patient payloads normalize stable identity fields and defaults", () => {
  const result = parseOdooPatient(valid);
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.givenName, "Amina");
  assert.equal(result.data.phone, "+923001234567");
  assert.equal(result.data.identifier, "4210112345678");
  assert.equal(result.data.preferredLanguage, "en");
  assert.equal(result.data.dobEstimated, false);
});

test("Odoo patient payloads reject unknown fields and unsafe demographics", () => {
  assert.equal(parseOdooPatient({ ...valid, unexpected: true }).success, false);
  assert.equal(parseOdooPatient({ ...valid, phone: "123" }).success, false);
  assert.equal(parseOdooPatient({ ...valid, dob: "2025-02-30" }).success, false);
  assert.equal(parseOdooPatient({ ...valid, identifierType: "guardian_cnic", dob: "1988-04-19" }).success, false);
});
