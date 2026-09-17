import { createHash } from 'node:crypto';
export function canonicalJson(value: unknown): string {
 if(value===null || typeof value!=='object') return JSON.stringify(value);
 if(value instanceof Date) return JSON.stringify(value.toISOString());
 if(Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
 return `{${Object.keys(value as object).sort().map(key=>`${JSON.stringify(key)}:${canonicalJson((value as Record<string,unknown>)[key])}`).join(',')}}`;
}
export function contentHash(snapshot: unknown) { return createHash('sha256').update(canonicalJson(snapshot)).digest('hex'); }
