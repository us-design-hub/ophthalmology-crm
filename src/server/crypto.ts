import { createCipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { requiredEnv } from "./config";
import type { IdentifierType } from "../lib/patients";

function key(name: string): Buffer {
  const result = Buffer.from(requiredEnv(name), "base64");
  if (result.length !== 32) throw new Error(`${name} must contain 32 base64-encoded bytes`);
  return result;
}
export function identifierIndex(tenantId: string, type: IdentifierType, value: string): string {
  // A guardian identifier and a personal CNIC search share a namespace.
  return createHmac("sha256", key("IDENTIFIER_INDEX_KEY")).update(`${tenantId}:${type === "passport" ? "passport" : "cnic"}:${value}`).digest("hex");
}
export function encryptIdentifier(tenantId: string, type: IdentifierType, value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key("IDENTIFIER_ENCRYPTION_KEY"), iv);
  cipher.setAAD(Buffer.from(`${tenantId}:${type}`));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(".");
}
export function privateHash(value: string): string { return createHmac("sha256", key("SESSION_PEPPER")).update(value).digest("hex"); }
export function signReview(value: object): string { return privateHash(`duplicate-review:${JSON.stringify(value)}`); }
export function matchesReview(actual: string, expected: string): boolean {
  return actual.length === expected.length && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
