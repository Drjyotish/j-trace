import type { Country } from "./config";

export type Role = "police" | "telecom" | "admin" | "auditor";
export type Jurisdiction = Country | "ALL";

export interface Staff {
  id: string;
  email: string;
  name: string;
  role: Role;
  agency: string;
  jurisdiction: Jurisdiction;
  verified: boolean;
  disabled: boolean;
}

export type Permission =
  | "case:list"
  | "case:read"
  | "pii:reveal"
  | "case:status"
  | "evidence:review"
  | "dispute:resolve"
  | "referral:create"
  | "referral:decide"
  | "event:submit"
  | "message:write"
  | "audit:read"
  | "retention:run";

/**
 * Separation of duties:
 *  - police   : the only role that can see owner PII, and only with a recorded legal basis.
 *  - telecom  : can report network events and talk to police; never sees who the owner is.
 *  - admin    : runs the platform; sees case metadata only — cannot read PII or change outcomes.
 *  - auditor  : read-only access to metadata and the audit trail.
 */
const GRANTS: Record<Role, Permission[]> = {
  police: ["case:list", "case:read", "pii:reveal", "case:status", "evidence:review", "dispute:resolve", "referral:create", "referral:decide", "message:write"],
  telecom: ["case:list", "case:read", "event:submit", "message:write"],
  admin: ["case:list", "case:read", "audit:read", "retention:run", "event:submit"],
  auditor: ["case:list", "case:read", "audit:read"],
};

export function can(staff: Pick<Staff, "role" | "verified" | "disabled">, perm: Permission): boolean {
  if (!staff.verified || staff.disabled) return false;
  return GRANTS[staff.role].includes(perm);
}

export type Scope = "none" | "summary" | "full";

export interface ReferralLite {
  to_jurisdiction: string;
  status: "pending" | "accepted" | "declined";
}

/**
 * Jurisdiction rule. An officer only works cases from their own country, plus
 * cases another country formally referred to them (summary while the referral
 * is pending, full once accepted). Global roles get metadata only.
 */
export function caseScope(staff: Pick<Staff, "role" | "jurisdiction" | "verified" | "disabled">, caseCountry: string, referrals: ReferralLite[] = []): Scope {
  if (!staff.verified || staff.disabled) return "none";
  if (staff.role === "admin" || staff.role === "auditor") return "summary";
  if (staff.jurisdiction === caseCountry) return "full";
  const mine = referrals.filter((r) => r.to_jurisdiction === staff.jurisdiction);
  if (mine.some((r) => r.status === "accepted")) return "full";
  if (mine.some((r) => r.status === "pending")) return "summary";
  return "none";
}
