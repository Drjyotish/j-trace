/**
 * Runtime configuration.
 *
 * TRACE_MODE=demo (default)  -> seeded sample data, simulated adapters, OTPs shown on screen.
 * TRACE_MODE=production      -> no seed data, no on-screen OTPs, secrets are mandatory.
 */
export type Mode = "demo" | "production";

export function mode(): Mode {
  return process.env.TRACE_MODE === "production" ? "production" : "demo";
}

export function isDemo(): boolean {
  return mode() === "demo";
}

const DEMO_FALLBACK = "j-trace-demo-secret-not-for-production-use-0000000000";

/** Master secret used to derive encryption, HMAC and session keys (HKDF). */
export function masterSecret(): string {
  const s = process.env.TRACE_SECRET;
  if (s && s.length >= 32) return s;
  if (mode() === "production") {
    throw new Error("TRACE_SECRET (>= 32 chars) is required when TRACE_MODE=production");
  }
  return DEMO_FALLBACK;
}

export const LIMITS = {
  /** Days a closed case is retained before it is purged. */
  retentionDaysAfterClose: 180,
  /** Days an untouched open case is retained before it is purged. */
  retentionDaysInactive: 365,
  otpTtlMinutes: 10,
  otpMaxAttempts: 5,
  ownerSessionHours: 12,
  staffSessionHours: 8,
  /** Vault records younger than this do not count as strong ownership proof. */
  vaultMaturityDays: 7,
  /** Ownership score needed before any authorised event is shown to an owner. */
  ownershipThreshold: 60,
} as const;

export type Country = "IN" | "NP" | "AE";
export const COUNTRIES: Country[] = ["IN", "NP", "AE"];
