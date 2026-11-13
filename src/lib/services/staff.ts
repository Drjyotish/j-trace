import { randomUUID } from "node:crypto";
import { query, queryOne, withTx } from "../db";
import { COUNTRIES, LIMITS, isDemo, type Country } from "../config";
import { decrypt, encrypt, hashPassword, verifyPassword } from "../crypto";
import { maskImei } from "../imei";
import { limitBy } from "../ratelimit";
import { AppError, forbidden, invalid, notFound, tooMany } from "../errors";
import { audit, verifyAuditChain } from "../audit";
import { can, caseScope, type ReferralLite, type Scope, type Staff } from "../rbac";
import { SIM_OPERATORS, simulateNetworkEvent, type NetworkEventKind } from "../adapters";
import {
  addEvent, daysFromNow, getCaseById, loadEvidence, notifyOwner, parseJson, recompute,
  type CaseRow, type Ctx, type EventRow,
} from "./common";

interface StaffRow extends Staff {
  password_hash: string;
}

const DUMMY_HASH = hashPassword("j-trace-dummy-password");

/** Uniform failure for unknown, unverified, disabled and wrong-password accounts. */
export async function login(email: string, password: string, ctx: Ctx = {}): Promise<Staff> {
  const e = (email ?? "").trim().toLowerCase();
  const a = limitBy("staffLoginPerIp", ctx.ip ?? "unknown");
  if (!a.ok) throw tooMany(a.retryAfterSec);
  const b = limitBy("staffLoginPerAccount", e);
  if (!b.ok) throw tooMany(b.retryAfterSec);

  const row = await queryOne<StaffRow>("SELECT * FROM staff_users WHERE email = $1", [e]);
  const passwordOk = verifyPassword(password ?? "", row?.password_hash ?? DUMMY_HASH);
  if (!row || !passwordOk || !row.verified || row.disabled) {
    const reason = !row ? "unknown" : !passwordOk ? "password" : !row.verified ? "unverified" : "disabled";
    await audit({ actorType: "system", actorId: "auth", action: "staff.login_failed", detail: { reason, staff: row?.id ?? null }, ip: ctx.ip });
    throw new AppError("login_failed", 401);
  }
  await audit({ actorType: "staff", actorId: row.id, action: "staff.login", ip: ctx.ip });
  return toStaff(row);
}

function toStaff(r: StaffRow | Staff): Staff {
  return { id: r.id, email: r.email, name: r.name, role: r.role, agency: r.agency, jurisdiction: r.jurisdiction, verified: r.verified, disabled: r.disabled };
}

export async function getStaff(id: string): Promise<Staff | null> {
  const row = await queryOne<StaffRow>("SELECT * FROM staff_users WHERE id = $1::uuid", [id]);
  return row && row.verified && !row.disabled ? toStaff(row) : null;
}

async function referralsFor(caseIds: string[]): Promise<Map<string, (ReferralLite & { id: string; from_jurisdiction: string; reason: string; legal_basis: string; created_at: Date; decided_at: Date | null })[]>> {
  const map = new Map<string, (ReferralLite & { id: string; from_jurisdiction: string; reason: string; legal_basis: string; created_at: Date; decided_at: Date | null })[]>();
  if (!caseIds.length) return map;
  const rows = await query<{ id: string; case_id: string; from_jurisdiction: string; to_jurisdiction: string; status: ReferralLite["status"]; reason: string; legal_basis: string; created_at: Date; decided_at: Date | null }>(
    "SELECT * FROM referrals ORDER BY created_at ASC",
  );
  for (const r of rows) {
    if (!caseIds.includes(r.case_id)) continue;
    const list = map.get(r.case_id) ?? [];
    list.push(r);
    map.set(r.case_id, list);
  }
  return map;
}

async function scopeOf(staff: Staff, c: CaseRow): Promise<Scope> {
  const refs = (await referralsFor([c.id])).get(c.id) ?? [];
  return caseScope(staff, c.country, refs);
}

/** Load a case the caller may see. Out-of-scope cases look exactly like missing ones. */
async function loadScoped(staff: Staff, caseId: string, need: Scope = "summary"): Promise<{ c: CaseRow; scope: Scope }> {
  if (!can(staff, "case:read")) throw forbidden();
  if (!/^[0-9a-f-]{36}$/i.test(caseId ?? "")) throw notFound();
  const c = await getCaseById(caseId);
  if (!c) throw notFound();
  const scope = await scopeOf(staff, c);
  if (scope === "none") throw notFound();
  if (need === "full" && scope !== "full") throw forbidden("out_of_jurisdiction");
  return { c, scope };
}

export async function listCases(staff: Staff) {
  if (!can(staff, "case:list")) throw forbidden();
  const rows = await query<CaseRow>("SELECT * FROM cases ORDER BY priority DESC, created_at DESC LIMIT 500");
  const refs = await referralsFor(rows.map((r) => r.id));
  const flags = await query<{ case_id: string; sim: number; xb: number }>(
    `SELECT case_id, COUNT(*) FILTER (WHERE kind = 'sim_change')::int AS sim,
            COUNT(*) FILTER (WHERE kind = 'cross_border')::int AS xb
       FROM case_events GROUP BY case_id`,
  );
  const flagMap = new Map(flags.map((f) => [f.case_id, f]));
  const out = [];
  for (const c of rows) {
    const scope = caseScope(staff, c.country, refs.get(c.id) ?? []);
    if (scope === "none") continue;
    out.push({
      id: c.id,
      ref: c.ref,
      country: c.country,
      status: c.status,
      incidentType: c.incident_type,
      device: [c.brand, c.model].filter(Boolean).join(" ") || null,
      level: c.verification_level,
      priority: c.priority,
      scope,
      simChange: (flagMap.get(c.id)?.sim ?? 0) > 0,
      crossBorder: (flagMap.get(c.id)?.xb ?? 0) > 0,
      referral: (refs.get(c.id) ?? []).map((r) => ({ to: r.to_jurisdiction, status: r.status })),
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    });
  }
  return out;
}

export async function getCase(staff: Staff, caseId: string, ctx: Ctx = {}) {
  const { c, scope } = await loadScoped(staff, caseId);
  const refs = (await referralsFor([c.id])).get(c.id) ?? [];
  const base = {
    id: c.id,
    ref: c.ref,
    scope,
    country: c.country,
    status: c.status,
    incidentType: c.incident_type,
    incidentAt: c.incident_at,
    platform: c.platform,
    device: [c.brand, c.model].filter(Boolean).join(" ") || null,
    level: c.verification_level,
    score: c.ownership_score,
    priority: c.priority,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    purgeAfter: c.purge_after,
    referrals: refs.map((r) => ({ id: r.id, from: r.from_jurisdiction, to: r.to_jurisdiction, status: r.status, reason: r.reason, legalBasis: r.legal_basis, createdAt: r.created_at, decidedAt: r.decided_at })),
    permissions: {
      revealPii: scope === "full" && can(staff, "pii:reveal"),
      reviewEvidence: scope === "full" && can(staff, "evidence:review"),
      setStatus: scope === "full" && can(staff, "case:status"),
      refer: scope === "full" && can(staff, "referral:create") && staff.jurisdiction === c.country,
      decideReferral: can(staff, "referral:decide") && refs.some((r) => r.to_jurisdiction === staff.jurisdiction && r.status === "pending"),
      message: scope === "full" && can(staff, "message:write"),
      submitEvent: can(staff, "event:submit") && isDemo() && (scope === "full" || staff.role === "admin"),
      resolveDispute: scope === "full" && can(staff, "dispute:resolve") && c.status === "disputed",
    },
    demo: isDemo(),
  };
  await audit({ actorType: "staff", actorId: staff.id, action: "case.viewed", caseId: c.id, detail: { scope }, ip: ctx.ip });
  if (scope !== "full") return { ...base, detail: null };

  const imei = decrypt(c.imei_enc);
  const events = await query<EventRow>("SELECT * FROM case_events WHERE case_id = $1::uuid ORDER BY created_at DESC", [c.id]);
  const evidence = await loadEvidence(c.id);
  const steps = await query<{ step_key: string; done: boolean; done_at: Date | null }>("SELECT step_key, done, done_at FROM case_steps WHERE case_id = $1::uuid", [c.id]);
  const messages = can(staff, "message:write")
    ? await query<{ id: string; body_enc: string; created_at: Date; name: string; agency: string; role: string }>(
        `SELECT m.id, m.body_enc, m.created_at, s.name, s.agency, s.role
           FROM messages m JOIN staff_users s ON s.id = m.author_id
          WHERE m.case_id = $1::uuid ORDER BY m.created_at ASC`,
        [c.id],
      )
    : [];
  return {
    ...base,
    detail: {
      // The handset identifier stays masked until an officer records a legal basis (see revealPii).
      imeiMasked: imei ? maskImei(imei) : null,
      policeRef: staff.role === "police" ? c.police_ref : null,
      contactVerified: c.contact_verified,
      events: events.map((e) => ({ id: e.id, kind: e.kind, source: e.source, simulated: e.simulated, visibility: e.visibility, country: e.country, payload: parseJson(e.payload), at: e.created_at })),
      evidence: evidence.map((e) => ({ id: e.id, kind: e.kind, status: e.status, sha256: e.sha256, meta: parseJson(e.meta), createdAt: e.created_at })),
      steps: steps.map((s) => ({ key: s.step_key, done: s.done, doneAt: s.done_at })),
      messages: messages.map((m) => ({ id: m.id, body: decrypt(m.body_enc), at: m.created_at, author: m.name, agency: m.agency, role: m.role })),
      operators: SIM_OPERATORS,
    },
  };
}

/**
 * Break-glass access to the owner's identity and the full IMEI.
 * Police only, in jurisdiction, with a recorded legal basis, rate-limited,
 * audited, and disclosed to the owner on their case timeline.
 */
export async function revealPii(staff: Staff, caseId: string, legalBasis: string, ctx: Ctx = {}) {
  if (!can(staff, "pii:reveal")) throw forbidden();
  const { c } = await loadScoped(staff, caseId, "full");
  const basis = (legalBasis ?? "").trim();
  if (basis.length < 10) throw invalid("legalBasis", "too_short");
  const rl = limitBy("piiRevealPerStaff", staff.id);
  if (!rl.ok) throw tooMany(rl.retryAfterSec);

  await audit({ actorType: "staff", actorId: staff.id, action: "pii.revealed", caseId: c.id, detail: { legalBasis: basis.slice(0, 300), agency: staff.agency }, ip: ctx.ip });
  await addEvent(c.id, { kind: "officer_access", source: "trace", visibility: "owner", minLevel: 1, payload: { agency: staff.agency } });
  return {
    ownerName: decrypt(c.owner_name_enc),
    contact: decrypt(c.contact_enc),
    phone: decrypt(c.phone_enc),
    imei: decrypt(c.imei_enc),
    incidentPlace: decrypt(c.incident_place_enc),
  };
}

export async function reviewEvidence(staff: Staff, caseId: string, evidenceId: string, decision: string, ctx: Ctx = {}) {
  if (!can(staff, "evidence:review")) throw forbidden();
  const { c } = await loadScoped(staff, caseId, "full");
  if (decision !== "accepted" && decision !== "rejected") throw invalid("decision");
  const ev = await queryOne<{ id: string; kind: string }>("SELECT id, kind FROM case_evidence WHERE id = $1::uuid AND case_id = $2::uuid", [evidenceId, c.id]);
  if (!ev) throw notFound();
  // System-generated evidence is not for an officer to "accept" into existence.
  if (ev.kind === "contact_otp" || ev.kind === "vault_match") throw invalid("evidence", "system_evidence");
  await query("UPDATE case_evidence SET status = $2, reviewed_by = $3::uuid WHERE id = $1::uuid", [ev.id, decision, staff.id]);
  await addEvent(c.id, { kind: "evidence_reviewed", source: "staff", visibility: "owner", payload: { evidence: ev.kind, decision } });
  const r = await recompute(c.id);
  await audit({ actorType: "staff", actorId: staff.id, action: "evidence.reviewed", caseId: c.id, detail: { kind: ev.kind, decision, level: r.level }, ip: ctx.ip });
  return r;
}

const STATUS_FLOW: Record<string, string[]> = {
  open: ["active", "closed"],
  active: ["recovered", "closed"],
  referred: ["active", "recovered", "closed"],
  disputed: [],
  recovered: [],
  closed: [],
};

export async function setStatus(staff: Staff, caseId: string, status: string, note: string, ctx: Ctx = {}) {
  if (!can(staff, "case:status")) throw forbidden();
  const { c } = await loadScoped(staff, caseId, "full");
  if (!STATUS_FLOW[c.status]?.includes(status)) throw new AppError("invalid_transition", 409, { from: c.status, to: status });
  const closing = status === "recovered" || status === "closed";
  await query(
    `UPDATE cases SET status = $2, updated_at = now(),
            closed_at = CASE WHEN $3 THEN now() ELSE closed_at END,
            purge_after = CASE WHEN $3 THEN $4::timestamptz ELSE purge_after END
      WHERE id = $1::uuid`,
    [c.id, status, closing, daysFromNow(LIMITS.retentionDaysAfterClose)],
  );
  await addEvent(c.id, { kind: "status_changed", source: "staff", visibility: "owner", payload: { status } });
  await notifyOwner(c, "status_changed");
  await recompute(c.id);
  await audit({ actorType: "staff", actorId: staff.id, action: "case.status", caseId: c.id, detail: { from: c.status, to: status, note: (note ?? "").slice(0, 300) }, ip: ctx.ip });
}

/** An officer decides which of the competing claims is genuine; the others are closed. */
export async function resolveDispute(staff: Staff, winnerCaseId: string, note: string, ctx: Ctx = {}) {
  if (!can(staff, "dispute:resolve")) throw forbidden();
  const { c } = await loadScoped(staff, winnerCaseId, "full");
  if (c.status !== "disputed" || !c.imei_hmac) throw new AppError("not_disputed", 409);
  if ((note ?? "").trim().length < 10) throw invalid("note", "too_short");
  const rivals = await query<CaseRow>("SELECT * FROM cases WHERE imei_hmac = $1 AND id <> $2::uuid AND status = 'disputed'", [c.imei_hmac, c.id]);
  // Every competing claim must be within the officer's own authority.
  for (const r of rivals) {
    if ((await scopeOf(staff, r)) !== "full") throw forbidden("cross_jurisdiction_dispute");
  }
  await withTx(async () => {
    await query("UPDATE cases SET status = 'active', updated_at = now() WHERE id = $1::uuid", [c.id]);
    await addEvent(c.id, { kind: "dispute_resolved", source: "staff", visibility: "owner", payload: { outcome: "upheld" } });
    await recompute(c.id);
    await audit({ actorType: "staff", actorId: staff.id, action: "dispute.resolved", caseId: c.id, detail: { outcome: "upheld", note: note.slice(0, 300) }, ip: ctx.ip });
    for (const r of rivals) {
      await query("UPDATE cases SET status = 'closed', closed_at = now(), updated_at = now(), purge_after = $2::timestamptz WHERE id = $1::uuid", [r.id, daysFromNow(LIMITS.retentionDaysAfterClose)]);
      await addEvent(r.id, { kind: "dispute_resolved", source: "staff", visibility: "owner", payload: { outcome: "not_upheld" } });
      await recompute(r.id);
      await audit({ actorType: "staff", actorId: staff.id, action: "dispute.resolved", caseId: r.id, detail: { outcome: "not_upheld" }, ip: ctx.ip });
    }
  });
}

export async function createReferral(staff: Staff, caseId: string, input: { to: string; reason: string; legalBasis: string }, ctx: Ctx = {}) {
  if (!can(staff, "referral:create")) throw forbidden();
  const { c } = await loadScoped(staff, caseId, "full");
  // Only the home jurisdiction may send a case abroad; a receiving country cannot forward it on.
  if (staff.jurisdiction !== c.country) throw forbidden("not_home_jurisdiction");
  if (!COUNTRIES.includes(input.to as Country) || input.to === c.country) throw invalid("to");
  if ((input.reason ?? "").trim().length < 10) throw invalid("reason", "too_short");
  if ((input.legalBasis ?? "").trim().length < 10) throw invalid("legalBasis", "too_short");
  if (c.status === "closed" || c.status === "recovered" || c.status === "disputed") throw new AppError("invalid_transition", 409, { from: c.status });
  const dup = await queryOne("SELECT id FROM referrals WHERE case_id = $1::uuid AND to_jurisdiction = $2 AND status IN ('pending','accepted')", [c.id, input.to]);
  if (dup) throw new AppError("referral_exists", 409);

  const id = randomUUID();
  await withTx(async () => {
    await query(
      `INSERT INTO referrals (id, case_id, from_jurisdiction, to_jurisdiction, reason, legal_basis, created_by)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::uuid)`,
      [id, c.id, c.country, input.to, input.reason.trim().slice(0, 500), input.legalBasis.trim().slice(0, 300), staff.id],
    );
    await query("UPDATE cases SET status = 'referred', updated_at = now() WHERE id = $1::uuid", [c.id]);
    await addEvent(c.id, { kind: "referral_created", source: "staff", visibility: "owner", minLevel: 1, country: input.to, payload: { to: input.to } });
    await notifyOwner(c, "referral_created");
    await recompute(c.id);
    await audit({ actorType: "staff", actorId: staff.id, action: "referral.created", caseId: c.id, detail: { to: input.to, legalBasis: input.legalBasis.trim().slice(0, 300) }, ip: ctx.ip });
  });
  return { id };
}

export async function decideReferral(staff: Staff, referralId: string, decision: string, ctx: Ctx = {}) {
  if (!can(staff, "referral:decide")) throw forbidden();
  if (decision !== "accepted" && decision !== "declined") throw invalid("decision");
  const r = /^[0-9a-f-]{36}$/i.test(referralId ?? "")
    ? await queryOne<{ id: string; case_id: string; to_jurisdiction: string; status: string }>("SELECT * FROM referrals WHERE id = $1::uuid", [referralId])
    : null;
  // Only the receiving jurisdiction can answer; everyone else cannot tell the referral exists.
  if (!r || r.to_jurisdiction !== staff.jurisdiction) throw notFound();
  if (r.status !== "pending") throw new AppError("already_decided", 409);
  await query("UPDATE referrals SET status = $2, decided_by = $3::uuid, decided_at = now() WHERE id = $1::uuid", [r.id, decision, staff.id]);
  await addEvent(r.case_id, { kind: "referral_decided", source: "staff", visibility: "owner", minLevel: 1, country: r.to_jurisdiction, payload: { to: r.to_jurisdiction, decision } });
  await audit({ actorType: "staff", actorId: staff.id, action: "referral.decided", caseId: r.case_id, detail: { decision }, ip: ctx.ip });
}

export async function postMessage(staff: Staff, caseId: string, body: string, ctx: Ctx = {}) {
  if (!can(staff, "message:write")) throw forbidden();
  const { c } = await loadScoped(staff, caseId, "full");
  const text = (body ?? "").trim();
  if (text.length < 1 || text.length > 2000) throw invalid("body");
  await query("INSERT INTO messages (id, case_id, author_id, body_enc) VALUES ($1::uuid, $2::uuid, $3::uuid, $4)", [randomUUID(), c.id, staff.id, encrypt(text)]);
  await audit({ actorType: "staff", actorId: staff.id, action: "message.posted", caseId: c.id, ip: ctx.ip });
}

/**
 * Record a network/registry event on a case.
 *
 * No real operator or regulator feed is connected. In demo mode an authorised
 * user can inject a SIMULATED event to demonstrate what would happen if one
 * were. Outside demo mode this endpoint refuses to run.
 *
 * Disclosure rule: the precise event goes to officers. The owner receives a
 * coarse notice only (never a location, never the new subscriber's identity),
 * and only once ownership is established (level 2).
 */
export async function submitNetworkEvent(staff: Staff, caseId: string, input: { kind: string; country: string; operator?: string }, ctx: Ctx = {}) {
  if (!can(staff, "event:submit")) throw forbidden();
  if (!isDemo()) throw new AppError("integration_unavailable", 501);
  const { c, scope } = await loadScoped(staff, caseId);
  if (staff.role !== "admin" && scope !== "full") throw forbidden("out_of_jurisdiction");
  if (!["sim_change", "network_attach", "registry_blocked"].includes(input.kind)) throw invalid("kind");
  if (!COUNTRIES.includes(input.country as Country)) throw invalid("country");
  // A telecom partner can only speak for networks in its own country.
  if (staff.role === "telecom" && staff.jurisdiction !== input.country) throw forbidden("foreign_network");

  const ev = simulateNetworkEvent(input.kind as NetworkEventKind, input.country as Country, input.operator);
  await withTx(async () => {
    await addEvent(c.id, { kind: ev.kind, source: ev.source, simulated: true, visibility: "staff", country: ev.country, payload: { operator: ev.operator } });
    if (ev.kind === "registry_blocked") {
      await addEvent(c.id, { kind: "owner_notice", source: ev.source, simulated: true, visibility: "owner", minLevel: 1, country: ev.country, payload: { notice: "registry_blocked" } });
    } else {
      const abroad = ev.country !== c.country;
      if (abroad) {
        await addEvent(c.id, { kind: "cross_border", source: ev.source, simulated: true, visibility: "staff", country: ev.country, payload: { from: c.country, to: ev.country } });
      }
      await addEvent(c.id, {
        kind: "owner_notice", source: ev.source, simulated: true, visibility: "owner", minLevel: 2,
        country: abroad ? ev.country : null,
        payload: { notice: ev.kind === "sim_change" ? "sim_change" : abroad ? "seen_abroad" : "seen_on_network", country: abroad ? ev.country : undefined },
      });
    }
    await notifyOwner(c, "network_update");
    await recompute(c.id);
    await audit({ actorType: "staff", actorId: staff.id, action: "event.simulated", caseId: c.id, detail: { kind: ev.kind, country: ev.country }, ip: ctx.ip });
  });
}

export async function auditTrail(staff: Staff, opts: { caseId?: string | null; limit?: number } = {}) {
  if (!can(staff, "audit:read")) throw forbidden();
  const limit = Math.min(500, Math.max(1, opts.limit ?? 200));
  const rows = opts.caseId && /^[0-9a-f-]{36}$/i.test(opts.caseId)
    ? await query("SELECT * FROM audit_log WHERE case_id = $1::uuid ORDER BY seq DESC LIMIT $2", [opts.caseId, limit])
    : await query("SELECT * FROM audit_log ORDER BY seq DESC LIMIT $1", [limit]);
  const chain = await verifyAuditChain();
  return {
    chain,
    entries: rows.map((r) => ({ seq: r.seq, at: r.at, actorType: r.actor_type, actorId: r.actor_id, action: r.action, caseId: r.case_id, detail: parseJson(r.detail), hash: String(r.hash).slice(0, 16) })),
  };
}

/** Delete everything past its retention date. Safe to run from a daily cron. */
export async function runRetention(actor: Staff | "system", ctx: Ctx = {}): Promise<{ purgedCases: number; purgedOtps: number; purgedDevices: number }> {
  if (actor !== "system" && !can(actor, "retention:run")) throw forbidden();
  const due = await query<{ id: string }>("SELECT id FROM cases WHERE purge_after < now() AND status NOT IN ('disputed','referred')");
  for (const d of due) {
    await query("DELETE FROM cases WHERE id = $1::uuid", [d.id]);
    await audit({ actorType: "system", actorId: "retention", action: "case.purged", caseId: d.id, ip: ctx.ip });
  }
  const otps = await query("DELETE FROM otps WHERE expires_at < now() - interval '1 day' RETURNING id");
  const devs = await query("DELETE FROM devices WHERE contact_verified = false AND created_at < now() - interval '1 day' RETURNING id");
  if (actor !== "system") await audit({ actorType: "staff", actorId: actor.id, action: "retention.run", detail: { cases: due.length }, ip: ctx.ip });
  return { purgedCases: due.length, purgedOtps: otps.length, purgedDevices: devs.length };
}

export async function dashboardStats(staff: Staff) {
  const cases = await listCases(staff);
  const by = (f: (c: (typeof cases)[number]) => boolean) => cases.filter(f).length;
  return {
    total: cases.length,
    open: by((c) => ["open", "active", "referred", "disputed"].includes(c.status)),
    disputed: by((c) => c.status === "disputed"),
    crossBorder: by((c) => c.crossBorder),
    recovered: by((c) => c.status === "recovered"),
  };
}
