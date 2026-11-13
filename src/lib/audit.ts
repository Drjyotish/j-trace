import { query, withTx } from "./db";
import { hmac, sha256 } from "./crypto";

export const AUDIT_GENESIS = "0".repeat(64);

export interface AuditEntry {
  actorType: "owner" | "staff" | "system";
  actorId: string;
  action: string;
  caseId?: string | null;
  /** Never put raw PII here: audit rows outlive the case they describe. */
  detail?: Record<string, unknown>;
  ip?: string | null;
}

function digest(seq: number, at: string, e: { actorType: string; actorId: string; action: string; caseId: string; detail: string; ipHash: string }, prev: string) {
  return sha256([seq, at, e.actorType, e.actorId, e.action, e.caseId, e.detail, e.ipHash, prev].join("|"));
}

/**
 * Append to the tamper-evident audit trail. Each row commits to the previous
 * row's hash, so editing or deleting any historical row breaks the chain.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  await withTx(async () => {
    // Serialise writers so two appends cannot pick the same predecessor.
    await query("SELECT pg_advisory_xact_lock(727201)");
    const last = await query<{ seq: number; hash: string }>("SELECT seq, hash FROM audit_log ORDER BY seq DESC LIMIT 1");
    const seq = (last[0]?.seq ?? 0) + 1;
    const prev = last[0]?.hash ?? AUDIT_GENESIS;
    const at = new Date().toISOString();
    const detail = JSON.stringify(entry.detail ?? {});
    const ipHash = entry.ip ? hmac(entry.ip, "ip").slice(0, 16) : "";
    const caseId = entry.caseId ?? "";
    const hash = digest(seq, at, { actorType: entry.actorType, actorId: entry.actorId, action: entry.action, caseId, detail, ipHash }, prev);
    await query(
      `INSERT INTO audit_log (seq, at, actor_type, actor_id, action, case_id, detail, ip_hash, prev_hash, hash)
       VALUES ($1, $2::timestamptz, $3, $4, $5, $6::uuid, $7, $8, $9, $10)`,
      [seq, at, entry.actorType, entry.actorId, entry.action, entry.caseId ?? null, detail, ipHash || null, prev, hash],
    );
  });
}

export interface ChainCheck {
  ok: boolean;
  entries: number;
  brokenAtSeq?: number;
  head?: string;
}

/** Recompute the whole chain. Any edited, removed or re-ordered row is reported. */
export async function verifyAuditChain(): Promise<ChainCheck> {
  const rows = await query<{
    seq: number; at: Date; actor_type: string; actor_id: string; action: string; case_id: string | null;
    detail: string; ip_hash: string | null; prev_hash: string; hash: string;
  }>("SELECT * FROM audit_log ORDER BY seq ASC");
  let prev = AUDIT_GENESIS;
  let expectedSeq = 1;
  for (const r of rows) {
    const at = new Date(r.at).toISOString();
    const h = digest(r.seq, at, {
      actorType: r.actor_type, actorId: r.actor_id, action: r.action,
      caseId: r.case_id ?? "", detail: r.detail, ipHash: r.ip_hash ?? "",
    }, prev);
    if (r.seq !== expectedSeq || r.prev_hash !== prev || r.hash !== h) {
      return { ok: false, entries: rows.length, brokenAtSeq: r.seq };
    }
    prev = r.hash;
    expectedSeq++;
  }
  return { ok: true, entries: rows.length, head: prev };
}
