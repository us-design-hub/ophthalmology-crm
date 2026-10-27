export class ClientApiError extends Error {
  constructor(public code: string, public status: number, public details: Record<string, unknown>) { super(code); }
}
// A prefetched GET lets a component that mounts only after other data arrives
// receive its data without waiting another network round trip. Each result is
// used once and only briefly, so later refreshes always fetch fresh data.
const prefetched = new Map<string, { promise: Promise<unknown>; expires: number }>();
export function prefetch(...paths: string[]) {
  for (const path of paths) {
    const promise = request(path);
    promise.catch(() => {});
    prefetched.set(path, { promise, expires: Date.now() + 10_000 });
  }
}
function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException("Aborted", "AbortError"));
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject);
  });
}
export async function api<T>(path: string, body?: unknown, options?: { signal?: AbortSignal; method?: "DELETE" }): Promise<T> {
  const entry = body === undefined && !options?.method ? prefetched.get(path) : undefined;
  if (entry) { prefetched.delete(path); if (entry.expires > Date.now()) return abortable(entry.promise as Promise<T>, options?.signal); }
  return request<T>(path, body, options);
}
async function request<T>(path: string, body?: unknown, options?: { signal?: AbortSignal; method?: "DELETE" }): Promise<T> {
  const response = await fetch(path, { method: options?.method ?? (body === undefined ? "GET" : "POST"), cache: "no-store", ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), signal: options?.signal });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !path.endsWith("/login")) window.location.assign("/login?expired=1");
    throw new ClientApiError(data.error ?? "serviceUnavailable", response.status, data);
  }
  return data as T;
}
