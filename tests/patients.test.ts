import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { ageFromDob, estimatedDob, normalizeIdentifier, normalizePhone, patientInputSchema } from "../src/lib/patients";
import { encryptIdentifier, identifierIndex, matchesReview, signReview } from "../src/server/crypto";
import { ROLE_PERMISSIONS } from "../src/lib/access";

process.env.IDENTIFIER_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.IDENTIFIER_INDEX_KEY = randomBytes(32).toString("base64");
process.env.SESSION_PEPPER = randomBytes(32).toString("base64");

test("Pakistan phone variants normalize to the same E.164 number", () => {
  for (const phone of ["0300 1234567", "+92 300 1234567", "0092 300 1234567"]) assert.equal(normalizePhone(phone), "+923001234567");
  assert.equal(normalizePhone("12345"), null);
});
test("identifiers normalize without dropping invalid characters", () => {
  assert.equal(normalizeIdentifier("00000-1234567-0", "cnic"), "0000012345670");
  assert.equal(normalizeIdentifier("ab 1234567", "passport"), "AB1234567");
  assert.equal(normalizeIdentifier("00000X1234567", "cnic"), "00000X1234567");
});
test("age calculations respect the birthday and leap-day estimated births", () => {
  assert.equal(ageFromDob("2000-09-15", "2026-09-14"), 25);
  assert.equal(ageFromDob("2000-09-14", "2026-09-14"), 26);
  assert.equal(estimatedDob(1, "2024-02-29"), "2023-02-28");
});
test("patient validation rejects impossible dates, invalid identifiers, and adult guardian identifiers", () => {
  const input = { givenName: "Test", familyName: "Patient", gender: "female", dob: "1970-05-10", phone: "0300 1234567", identifierType: "cnic", identifier: "00000-1234567-0" };
  assert.equal(patientInputSchema.safeParse(input).success, true);
  assert.equal(patientInputSchema.safeParse({ ...input, dob: "2025-02-30" }).success, false);
  assert.equal(patientInputSchema.safeParse({ ...input, identifier: "not-a-CNIC" }).success, false);
  assert.equal(patientInputSchema.safeParse({ ...input, identifierType: "guardian_cnic" }).success, false);
  assert.equal(patientInputSchema.safeParse({ ...input, tenantId: "untrusted" }).success, false);
});
test("encryption is randomized while identifier search is deterministic and tenant-bound", () => {
  const value = "0000012345670";
  const a = encryptIdentifier("hospital-a", "cnic", value); const b = encryptIdentifier("hospital-a", "cnic", value);
  assert.notEqual(a, b); assert.equal(a.includes(value), false);
  assert.equal(a.split(".").length, 4);
  assert.equal(identifierIndex("hospital-a", "cnic", value), identifierIndex("hospital-a", "guardian_cnic", value));
  assert.notEqual(identifierIndex("hospital-a", "cnic", value), identifierIndex("hospital-b", "cnic", value));
});
test("duplicate-review signatures bind the reviewed payload", () => {
  const token = signReview({ patient: "synthetic", tenant: "a" });
  assert.equal(matchesReview(token, signReview({ patient: "synthetic", tenant: "a" })), true);
  assert.equal(matchesReview(token, signReview({ patient: "synthetic", tenant: "b" })), false);
  assert.equal(matchesReview("short", token), false);
});
test("registration and audit roles are separated", () => {
  assert.equal(ROLE_PERMISSIONS.receptionist.includes("patient:create"), true);
  assert.equal(ROLE_PERMISSIONS.doctor.includes("patient:create"), false);
  assert.equal(ROLE_PERMISSIONS.auditor.includes("patient:read"), false);
  assert.equal(ROLE_PERMISSIONS.auditor.includes("audit:read"), true);
});
