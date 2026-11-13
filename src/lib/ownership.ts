import { LIMITS } from "./config";

export type EvidenceKind =
  | "contact_otp"     // system: a code sent to the case contact was confirmed
  | "vault_match"     // system: IMEI + recovery contact match a TRACE vault record made before the loss
  | "invoice"         // owner: purchase invoice (fingerprint only; the file never leaves the device)
  | "box_label"       // owner: photo of the box/IMEI label (fingerprint only)
  | "police_report"   // owner: police complaint / FIR reference
  | "id_document"     // owner: government ID shown to an officer
  | "account_access"; // owner: self-declared access to the device's Google/Apple account

export type EvidenceStatus = "declared" | "accepted" | "rejected";

export interface EvidenceItem {
  kind: EvidenceKind;
  status: EvidenceStatus;
  meta?: { mature?: boolean; [k: string]: unknown };
}

export const WEIGHTS: Record<EvidenceKind, number> = {
  vault_match: 50,
  police_report: 25,
  invoice: 20,
  contact_otp: 15,
  box_label: 10,
  id_document: 10,
  account_access: 5,
};

/** Evidence the system produces itself; an owner cannot simply declare it. */
export const SYSTEM_KINDS: EvidenceKind[] = ["contact_otp", "vault_match"];
/** Evidence an officer must have accepted before a case can reach level 3. */
const OFFICER_KINDS: EvidenceKind[] = ["police_report", "id_document", "invoice"];

export interface OwnershipResult {
  score: number;
  /** 0 unverified · 1 contact verified · 2 ownership established · 3 officer verified */
  level: 0 | 1 | 2 | 3;
  breakdown: { kind: EvidenceKind; points: number; status: EvidenceStatus }[];
}

/**
 * Ownership scoring.
 *
 * Design goal: nothing an attacker can merely *type* is enough. Self-declared
 * evidence counts for half until an officer accepts it, and the sum of every
 * self-declared item stays below the threshold. Crossing it needs either a
 * vault record created well before the loss, or an officer's review.
 */
export function scoreOwnership(items: EvidenceItem[]): OwnershipResult {
  const breakdown: OwnershipResult["breakdown"] = [];
  let score = 0;
  for (const it of items) {
    let points = 0;
    if (it.status !== "rejected") {
      const w = WEIGHTS[it.kind] ?? 0;
      if (SYSTEM_KINDS.includes(it.kind)) {
        if (it.status === "accepted") {
          // A vault record created just before the claim proves little.
          points = it.kind === "vault_match" && it.meta?.mature === false ? 15 : w;
        }
      } else {
        points = it.status === "accepted" ? w : Math.floor(w / 2);
      }
    }
    score += points;
    breakdown.push({ kind: it.kind, points, status: it.status });
  }
  score = Math.min(100, score);

  const contactOk = items.some((i) => i.kind === "contact_otp" && i.status === "accepted");
  const officerOk = items.some((i) => OFFICER_KINDS.includes(i.kind) && i.status === "accepted");
  let level: OwnershipResult["level"] = 0;
  if (contactOk) level = 1;
  if (contactOk && score >= LIMITS.ownershipThreshold) level = officerOk ? 3 : 2;
  return { score, level, breakdown };
}

/** A disputed case discloses nothing beyond what an unverified claimant would see. */
export function effectiveLevel(level: number, status: string): number {
  return status === "disputed" ? Math.min(level, 1) : level;
}

export interface PriorityInput {
  incidentType: "lost" | "stolen";
  level: number;
  status: string;
  createdAt: Date;
  hasSimChange: boolean;
  hasCrossBorder: boolean;
  now?: Date;
}

/** 0-100 triage score for the officer queue. Transparent and explainable by design. */
export function priorityScore(p: PriorityInput): number {
  if (p.status === "closed" || p.status === "recovered") return 0;
  const ageH = ((p.now ?? new Date()).getTime() - p.createdAt.getTime()) / 3600_000;
  let s = 0;
  if (p.incidentType === "stolen") s += 30;
  if (p.hasCrossBorder) s += 25;
  if (p.hasSimChange) s += 15;
  s += Math.min(3, Math.max(0, p.level)) * 5;
  if (ageH <= 48) s += 15;
  else if (ageH <= 168) s += 8;
  if (p.status === "disputed") s += 10;
  return Math.min(100, s);
}
