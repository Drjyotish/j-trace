import { randomUUID } from "node:crypto";
import { query, queryOne } from "../db";
import { LIMITS, isDemo } from "../config";
import { audit } from "../audit";
import { effectiveLevel, priorityScore, scoreOwnership, type EvidenceItem, type EvidenceKind, type EvidenceStatus } from "../ownership";

export interface Ctx {
  ip?: string | null;
}

export interface CaseRow {
  id: string;
  ref: string;
  access_key_hash: string;
  country: "IN" | "NP" | "AE";
  incident_type: "lost" | "stolen";
  incident_at: Date | null;
  incident_place_enc: string | null;
  owner_name_enc: string | null;
  contact_enc: string;
  contact_hmac: string;
  contact_verified: boolean;
  phone_enc: string | null;
  phone_hmac: string | null;
  imei_enc: string | null;
  imei_hmac: string | null;
  brand: string | null;
  model: string | null;
  platform: "android" | "ios" | "other";
  police_ref: string | null;
  status: "open" | "active" | "referred" | "disputed" | "recovered" | "closed";
  verification_level: number;
  ownership_score: number;
  priority: number;
  locale: string;
  consent_at: Date;
  created_at: Date;
  updated_at: Date;
  closed_at: Date | null;
  purge_after: Date;
}

export interface EvidenceRow {
  id: string;
  case_id: string;
  kind: EvidenceKind;
  sha256: string | null;
  meta: string;
  status: EvidenceStatus;
  reviewed_by: string | null;
  created_at: Date;
}

export interface EventRow {
  id: string;
  case_id: string;
  kind: string;
  source: string;
  simulated: boolean;
  visibility: "owner" | "staff";
  min_level: number;
  country: string | null;
  payload: string;
  created_at: Date;
}

export const OPEN_STATUSES = ["open", "active", "referred", "disputed"] as const;

export function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export function getCaseById(id: string): Promise<CaseRow | null> {
  return queryOne<CaseRow>("SELECT * FROM cases WHERE id = $1::uuid", [id]);
}

export function parseJson<T = Record<string, unknown>>(s: string | null | undefined): T {
  try {
    return JSON.parse(s || "{}") as T;
  } catch {
    return {} as T;
  }
}

export interface NewEvent {
  kind: string;
  source: string;
  simulated?: boolean;
  visibility?: "owner" | "staff";
  minLevel?: number;
  country?: string | null;
  payload?: Record<string, unknown>;
}

export async function addEvent(caseId: string, e: NewEvent): Promise<string> {
  const id = randomUUID();
  await query(
    `INSERT INTO case_events (id, case_id, kind, source, simulated, visibility, min_level, country, payload)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9)`,
    [id, caseId, e.kind, e.source, e.simulated ?? false, e.visibility ?? "staff", e.minLevel ?? 0, e.country ?? null, JSON.stringify(e.payload ?? {})],
  );
  return id;
}

export async function loadEvidence(caseId: string): Promise<EvidenceRow[]> {
  return query<EvidenceRow>("SELECT * FROM case_evidence WHERE case_id = $1::uuid ORDER BY created_at ASC", [caseId]);
}

export function toEvidenceItems(rows: EvidenceRow[]): EvidenceItem[] {
  return rows.map((r) => ({ kind: r.kind, status: r.status, meta: parseJson(r.meta) }));
}

export async function upsertEvidence(caseId: string, kind: EvidenceKind, status: EvidenceStatus, sha: string | null, meta: Record<string, unknown>): Promise<void> {
  await query(
    `INSERT INTO case_evidence (id, case_id, kind, sha256, meta, status)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
     ON CONFLICT (case_id, kind)
     DO UPDATE SET sha256 = EXCLUDED.sha256, meta = EXCLUDED.meta, status = EXCLUDED.status, reviewed_by = NULL, created_at = now()`,
    [randomUUID(), caseId, kind, sha, JSON.stringify(meta), status],
  );
}

/** Recalculate ownership score, verification level and triage priority after any change. */
export async function recompute(caseId: string): Promise<{ score: number; level: number; priority: number }> {
  const c = await getCaseById(caseId);
  if (!c) return { score: 0, level: 0, priority: 0 };
  const ev = toEvidenceItems(await loadEvidence(caseId));
  const { score, level } = scoreOwnership(ev);
  const flags = await queryOne<{ sim: number; xb: number }>(
    `SELECT COUNT(*) FILTER (WHERE kind = 'sim_change')::int AS sim,
            COUNT(*) FILTER (WHERE kind = 'cross_border')::int AS xb
       FROM case_events WHERE case_id = $1::uuid`,
    [caseId],
  );
  const priority = priorityScore({
    incidentType: c.incident_type,
    level,
    status: c.status,
    createdAt: new Date(c.created_at),
    hasSimChange: (flags?.sim ?? 0) > 0,
    hasCrossBorder: (flags?.xb ?? 0) > 0,
  });
  await query(
    "UPDATE cases SET ownership_score = $2, verification_level = $3, priority = $4, updated_at = now() WHERE id = $1::uuid",
    [caseId, score, level, priority],
  );
  return { score, level, priority };
}

/** Queue a notification. No SMS/e-mail provider is connected in the prototype, so delivery is simulated. */
export async function notifyOwner(c: Pick<CaseRow, "id" | "contact_enc">, template: string): Promise<void> {
  await query(
    "INSERT INTO outbox (id, case_id, channel, to_enc, template, simulated) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)",
    [randomUUID(), c.id, "contact", c.contact_enc, template, true],
  );
}

/**
 * Two people claiming the same handset is the classic abuse pattern (a thief or
 * a stalker filing first). When it happens every competing case is frozen: no
 * authorised update is disclosed to either party until an officer decides.
 */
export async function checkDispute(caseId: string, ctx: Ctx = {}): Promise<boolean> {
  const c = await getCaseById(caseId);
  if (!c?.imei_hmac) return false;
  const rivals = await query<CaseRow>(
    `SELECT * FROM cases
      WHERE imei_hmac = $1 AND id <> $2::uuid AND contact_hmac <> $3
        AND status IN ('open','active','referred','disputed')`,
    [c.imei_hmac, c.id, c.contact_hmac],
  );
  if (!rivals.length) return false;
  for (const row of [c, ...rivals]) {
    if (row.status === "disputed") continue;
    await query("UPDATE cases SET status = 'disputed', updated_at = now() WHERE id = $1::uuid", [row.id]);
    await addEvent(row.id, { kind: "dispute_opened", source: "trace", visibility: "owner", payload: {} });
    await audit({ actorType: "system", actorId: "trace", action: "dispute.opened", caseId: row.id, detail: { competing: rivals.length }, ip: ctx.ip });
    await recompute(row.id);
  }
  return true;
}

export function disclosureLevel(c: Pick<CaseRow, "verification_level" | "status">): number {
  return effectiveLevel(c.verification_level, c.status);
}

export function demoOnly<T>(value: T): T | undefined {
  return isDemo() ? value : undefined;
}

export const RETENTION = LIMITS;
