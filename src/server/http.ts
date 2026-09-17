import "server-only";
import { NextResponse } from "next/server";
import { appOrigin } from "./config";

export class ApiError extends Error {
  constructor(public status: number, public code: string, public details?: Record<string, unknown>) { super(code); }
}
export function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, private", "Vary": "Cookie" } }); }
export function errorResponse(error: unknown) {
  if (error instanceof ApiError) return json({ error: error.code, ...error.details }, error.status);
  // Database errors can include submitted identifiers in their details. Log codes only.
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "internal";
  console.error("Request failed", /^[A-Z0-9_]{1,30}$/.test(code) ? code : "internal");
  return json({ error: "serviceUnavailable" }, 503);
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== appOrigin()) throw new ApiError(403, "invalidOrigin");
}
export async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new ApiError(415, "invalidRequest");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "invalidRequest");
  let bytes = 0; const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 16_384) { await reader.cancel(); throw new ApiError(413, "invalidRequest"); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new ApiError(400, "invalidRequest"); }
}
