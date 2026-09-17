export class ClientApiError extends Error {
  constructor(public code: string, public status: number, public details: Record<string, unknown>) { super(code); }
}
export async function api<T>(path: string, body?: unknown, options?: { signal?: AbortSignal }): Promise<T> {
  const response = await fetch(path, { method: body === undefined ? "GET" : "POST", cache: "no-store", ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), signal: options?.signal });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !path.endsWith("/login")) window.location.assign("/login?expired=1");
    throw new ClientApiError(data.error ?? "serviceUnavailable", response.status, data);
  }
  return data as T;
}
