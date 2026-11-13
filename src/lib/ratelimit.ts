/**
 * Sliding-window rate limiter.
 *
 * In-process only: good enough for a single-instance prototype and for tests.
 * For a horizontally scaled deployment swap `store` for Redis/Upstash — the
 * call sites do not change.
 */
type Bucket = number[];

const g = globalThis as unknown as { __jtRate?: Map<string, Bucket> };
const store: Map<string, Bucket> = (g.__jtRate ??= new Map());

export interface RateResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function rateLimit(bucket: string, key: string, limit: number, windowMs: number, now = Date.now()): RateResult {
  const id = `${bucket}:${key}`;
  const hits = (store.get(id) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    store.set(id, hits);
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((windowMs - (now - hits[0])) / 1000) };
  }
  hits.push(now);
  store.set(id, hits);
  if (store.size > 50_000) prune(now);
  return { ok: true, remaining: limit - hits.length, retryAfterSec: 0 };
}

function prune(now: number) {
  for (const [k, v] of store) {
    if (!v.length || now - v[v.length - 1] > 24 * 3600_000) store.delete(k);
  }
}

export function resetRateLimits() {
  store.clear();
}

/** Named policies — one place to tune abuse controls. */
export const POLICY = {
  caseCreatePerIp: { limit: 5, windowMs: 3600_000 },
  caseOpenPerIp: { limit: 10, windowMs: 15 * 60_000 },
  caseOpenPerRef: { limit: 5, windowMs: 15 * 60_000 },
  otpRequestPerSubject: { limit: 3, windowMs: 15 * 60_000 },
  otpRequestPerIp: { limit: 10, windowMs: 3600_000 },
  vaultLookupPerIp: { limit: 5, windowMs: 3600_000 },
  vaultLookupPerPhone: { limit: 3, windowMs: 24 * 3600_000 },
  vaultRegisterPerIp: { limit: 10, windowMs: 3600_000 },
  imeiValidatePerIp: { limit: 60, windowMs: 60_000 },
  staffLoginPerIp: { limit: 10, windowMs: 15 * 60_000 },
  staffLoginPerAccount: { limit: 5, windowMs: 15 * 60_000 },
  piiRevealPerStaff: { limit: 30, windowMs: 3600_000 },
} as const;

export function limitBy(policy: keyof typeof POLICY, key: string): RateResult {
  const p = POLICY[policy];
  return rateLimit(policy, key, p.limit, p.windowMs);
}
