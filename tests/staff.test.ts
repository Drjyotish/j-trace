import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { query, queryOne } from "@/lib/db";
import { verifyAuditChain } from "@/lib/audit";
import { resetRateLimits } from "@/lib/ratelimit";
import type { Staff } from "@/lib/rbac";
import { addEvidence, ownerView } from "@/lib/services/owner";
import {
  auditTrail, createReferral, decideReferral, getCase, listCases, login, postMessage, resolveDispute, revealPii,
  reviewEvidence, runRetention, setStatus, submitNetworkEvent,
} from "@/lib/services/staff";
import { codeOf, freshDb, imeiN, makeStaff, newCase, nextIp, TEST_PASSWORD, verifyContact } from "./helpers";

let policeIn: Staff, policeNp: Staff, policeAe: Staff, telecomIn: Staff, telecomNp: Staff, admin: Staff, auditor: Staff;

beforeAll(async () => {
  await freshDb();
  policeIn = await makeStaff({ role: "police", jurisdiction: "IN", agency: "IN Police" });
  policeNp = await makeStaff({ role: "police", jurisdiction: "NP", agency: "NP Police" });
  policeAe = await makeStaff({ role: "police", jurisdiction: "AE", agency: "AE Police" });
  telecomIn = await makeStaff({ role: "telecom", jurisdiction: "IN", agency: "IN Telco" });
  telecomNp = await makeStaff({ role: "telecom", jurisdiction: "NP", agency: "NP Telco" });
  admin = await makeStaff({ role: "admin", jurisdiction: "ALL", agency: "Platform" });
  auditor = await makeStaff({ role: "auditor", jurisdiction: "ALL", agency: "Oversight" });
});
beforeEach(() => resetRateLimits());

const BASIS = "FIR 123/2026, s.303 BNS — investigation";

describe("staff sign-in", () => {
  it("signs in a verified officer", async () => {
    const s = await login(policeIn.email, TEST_PASSWORD, { ip: nextIp() });
    expect(s.id).toBe(policeIn.id);
    expect(JSON.stringify(s)).not.toContain("scrypt");
  });

  it("fails identically for wrong password, unknown, unverified and disabled accounts", async () => {
    const unverified = await makeStaff({ verified: false });
    const disabled = await makeStaff({ disabled: true });
    const results = await Promise.all([
      codeOf(login(policeIn.email, "wrong-password", { ip: nextIp() })),
      codeOf(login("nobody@nowhere.test", TEST_PASSWORD, { ip: nextIp() })),
      codeOf(login(unverified.email, TEST_PASSWORD, { ip: nextIp() })),
      codeOf(login(disabled.email, TEST_PASSWORD, { ip: nextIp() })),
    ]);
    expect(new Set(results)).toEqual(new Set(["login_failed"]));
    const reasons = await query("SELECT detail FROM audit_log WHERE action = 'staff.login_failed'");
    expect(reasons.map((r) => JSON.parse(r.detail).reason).sort()).toEqual(["disabled", "password", "unknown", "unverified"]);
  });

  it("locks an account after repeated failures", async () => {
    for (let i = 0; i < 5; i++) await codeOf(login(policeAe.email, "bad", { ip: nextIp() }));
    expect(await codeOf(login(policeAe.email, TEST_PASSWORD, { ip: nextIp() }))).toBe("rate_limited");
  });
});

describe("jurisdiction", () => {
  it("an officer's queue contains only their own country's cases", async () => {
    const inCase = await newCase({ country: "IN" });
    const npCase = await newCase({ country: "NP" });
    const inQueue = (await listCases(policeIn)).map((c) => c.id);
    const npQueue = (await listCases(policeNp)).map((c) => c.id);
    expect(inQueue).toContain(inCase.id);
    expect(inQueue).not.toContain(npCase.id);
    expect(npQueue).toContain(npCase.id);
    expect(npQueue).not.toContain(inCase.id);
  });

  it("a foreign case is indistinguishable from one that does not exist", async () => {
    const inCase = await newCase({ country: "IN" });
    expect(await codeOf(getCase(policeNp, inCase.id))).toBe("not_found");
    expect(await codeOf(getCase(policeNp, "00000000-0000-4000-8000-000000000000"))).toBe("not_found");
    expect(await codeOf(revealPii(policeNp, inCase.id, BASIS))).toBe("not_found");
    expect(await codeOf(setStatus(policeNp, inCase.id, "closed", "x"))).toBe("not_found");
  });

  it("admin and auditor see metadata only — never the detail or PII", async () => {
    const c = await newCase({ country: "IN", imei: imeiN(100), ownerName: "Hidden Person" });
    for (const s of [admin, auditor]) {
      const v = await getCase(s, c.id);
      expect(v.scope).toBe("summary");
      expect(v.detail).toBeNull();
      expect(JSON.stringify(v)).not.toContain("Hidden Person");
      expect(await codeOf(revealPii(s, c.id, BASIS))).toBe("forbidden");
    }
  });
});

describe("PII access (break-glass)", () => {
  it("the case view never contains PII by default", async () => {
    const imei = imeiN(101);
    const c = await newCase({ imei, ownerName: "Secret Name", phone: "9812300001", incidentPlace: "Secret Place" });
    const v = JSON.stringify(await getCase(policeIn, c.id));
    for (const secret of [imei, "Secret Name", "9812300001", "Secret Place", "@owner.test"]) expect(v).not.toContain(secret);
  });

  it("needs a legal basis; the access is audited and disclosed to the owner", async () => {
    const imei = imeiN(102);
    const c = await newCase({ imei, ownerName: "Asha Verma" });
    await verifyContact(c.id);
    expect(await codeOf(revealPii(policeIn, c.id, "curious"))).toBe("invalid_input");
    const pii = await revealPii(policeIn, c.id, BASIS, { ip: "198.51.100.7" });
    expect(pii.imei).toBe(imei);
    expect(pii.ownerName).toBe("Asha Verma");

    const log = await queryOne("SELECT detail, ip_hash FROM audit_log WHERE action = 'pii.revealed' AND case_id = $1::uuid", [c.id]);
    expect(JSON.parse(log!.detail).legalBasis).toBe(BASIS);
    expect(log!.ip_hash).not.toContain("198.51.100.7");
    const owner = await ownerView(c.id);
    const notice = owner.events.find((e) => e.kind === "officer_access");
    expect((notice!.payload as { agency: string }).agency).toBe("IN Police");
  });

  it("telecom partners can work a case but never learn who the owner is", async () => {
    const c = await newCase({ imei: imeiN(103), ownerName: "Not For Telco" });
    const v = await getCase(telecomIn, c.id);
    expect(v.scope).toBe("full");
    expect(v.permissions.revealPii).toBe(false);
    expect(v.detail!.policeRef).toBeNull();
    expect(JSON.stringify(v)).not.toContain("Not For Telco");
    expect(await codeOf(revealPii(telecomIn, c.id, BASIS))).toBe("forbidden");
  });

  it("rate-limits bulk PII access by one officer", async () => {
    const c = await newCase();
    for (let i = 0; i < 30; i++) await revealPii(policeIn, c.id, BASIS);
    expect(await codeOf(revealPii(policeIn, c.id, BASIS))).toBe("rate_limited");
  });
});

describe("evidence review", () => {
  it("an officer accepting documents raises the case to level 3", async () => {
    const c = await newCase({ imei: imeiN(110) });
    await verifyContact(c.id);
    await addEvidence(c.id, { kind: "police_report", reference: "FIR-77/2026" });
    await addEvidence(c.id, { kind: "invoice", sha256: "b".repeat(64) });
    const detail = (await getCase(policeIn, c.id)).detail!;
    const idOf = (k: string) => detail.evidence.find((e) => e.kind === k)!.id;
    await reviewEvidence(policeIn, c.id, idOf("police_report"), "accepted");
    const r = await reviewEvidence(policeIn, c.id, idOf("invoice"), "accepted");
    expect(r.level).toBe(3);
    expect(r.score).toBe(60);
    // System evidence cannot be flipped by hand, and telecom cannot review at all.
    expect(await codeOf(reviewEvidence(policeIn, c.id, idOf("contact_otp"), "rejected"))).toBe("invalid_input");
    expect(await codeOf(reviewEvidence(telecomIn, c.id, idOf("invoice"), "rejected"))).toBe("forbidden");
  });
});

describe("network events (SIMULATED) and what the owner learns", () => {
  it("officers get the detail; an unverified owner gets nothing", async () => {
    const c = await newCase({ imei: imeiN(120) });
    await verifyContact(c.id); // level 1 only
    await submitNetworkEvent(telecomIn, c.id, { kind: "sim_change", country: "IN", operator: "Airtel" });
    const staffView = (await getCase(policeIn, c.id)).detail!;
    const ev = staffView.events.find((e) => e.kind === "sim_change")!;
    expect(ev.simulated).toBe(true);
    expect(ev.source).toMatch(/^SIMULATED:/);
    expect((ev.payload as { operator: string }).operator).toBe("Airtel");

    const owner = await ownerView(c.id);
    expect(owner.events.some((e) => e.kind === "owner_notice")).toBe(false);
    expect(owner.hiddenEvents).toBe(1);
  });

  it("a verified owner gets a coarse notice — never the operator, a location, or the new SIM", async () => {
    const c = await newCase({ imei: imeiN(121) });
    await verifyContact(c.id);
    await addEvidence(c.id, { kind: "police_report", reference: "FIR-9/2026" });
    await addEvidence(c.id, { kind: "invoice", sha256: "c".repeat(64) });
    const d = (await getCase(policeIn, c.id)).detail!;
    for (const e of d.evidence.filter((x) => x.kind !== "contact_otp")) await reviewEvidence(policeIn, c.id, e.id, "accepted");

    await submitNetworkEvent(telecomIn, c.id, { kind: "sim_change", country: "IN", operator: "Vi" });
    await submitNetworkEvent(admin, c.id, { kind: "network_attach", country: "NP", operator: "Ncell" });
    const owner = await ownerView(c.id);
    const notices = owner.events.filter((e) => e.kind === "owner_notice");
    expect(notices.map((n) => (n.payload as { notice: string }).notice).sort()).toEqual(["seen_abroad", "sim_change"]);
    expect(notices.every((n) => n.simulated)).toBe(true);
    const text = JSON.stringify(owner.events);
    for (const leak of ["Ncell", "Vi", "operator", "lat", "lng", "imsi", "cell"]) expect(text).not.toContain(`"${leak}`);
    expect(owner.events.some((e) => e.kind === "cross_border" || e.kind === "sim_change" || e.kind === "network_attach")).toBe(false);

    const staffView = await listCases(policeIn);
    const row = staffView.find((x) => x.id === c.id)!;
    expect(row.crossBorder).toBe(true);
    expect(row.simChange).toBe(true);
    expect(row.priority).toBeGreaterThanOrEqual(85);
  });

  it("a telecom partner can only report its own country's networks, and police cannot inject events", async () => {
    const c = await newCase({ country: "IN" });
    expect(await codeOf(submitNetworkEvent(telecomIn, c.id, { kind: "network_attach", country: "NP" }))).toBe("foreign_network");
    expect(await codeOf(submitNetworkEvent(telecomNp, c.id, { kind: "network_attach", country: "NP" }))).toBe("not_found");
    expect(await codeOf(submitNetworkEvent(policeIn, c.id, { kind: "sim_change", country: "IN" }))).toBe("forbidden");
    expect(await codeOf(submitNetworkEvent(telecomIn, c.id, { kind: "gps_fix", country: "IN" }))).toBe("invalid_input");
  });

  it("is switched off entirely outside demo mode", async () => {
    const c = await newCase({ country: "IN" });
    process.env.TRACE_MODE = "production";
    process.env.TRACE_SECRET = "x".repeat(40);
    try {
      expect(await codeOf(submitNetworkEvent(telecomIn, c.id, { kind: "sim_change", country: "IN" }))).toBe("integration_unavailable");
    } finally {
      process.env.TRACE_MODE = "demo";
      delete process.env.TRACE_SECRET;
    }
  });
});

describe("cross-border referral", () => {
  it("walks the full India -> Nepal referral life-cycle", async () => {
    const c = await newCase({ country: "IN", imei: imeiN(130), ownerName: "Referred Owner" });
    await verifyContact(c.id);
    const ref = { to: "NP", reason: "Handset active on a Nepali network (simulated).", legalBasis: "Police cooperation request IN-NP/2026/017" };

    // Guards
    expect(await codeOf(createReferral(policeIn, c.id, { ...ref, to: "IN" }))).toBe("invalid_input");
    expect(await codeOf(createReferral(policeIn, c.id, { ...ref, legalBasis: "none" }))).toBe("invalid_input");
    expect(await codeOf(createReferral(telecomIn, c.id, ref))).toBe("forbidden");
    expect(await codeOf(createReferral(policeNp, c.id, ref))).toBe("not_found");

    const { id: referralId } = await createReferral(policeIn, c.id, ref);
    expect(await codeOf(createReferral(policeIn, c.id, ref))).toBe("referral_exists");
    expect((await ownerView(c.id)).status).toBe("referred");

    // Pending: Nepal sees that a referral exists and why — nothing more.
    const pending = await getCase(policeNp, c.id);
    expect(pending.scope).toBe("summary");
    expect(pending.detail).toBeNull();
    expect(pending.referrals[0].reason).toContain("Nepali network");
    expect(await codeOf(revealPii(policeNp, c.id, BASIS))).toBe("out_of_jurisdiction");
    expect(await codeOf(getCase(policeAe, c.id))).toBe("not_found");

    // Only the receiving jurisdiction can decide.
    expect(await codeOf(decideReferral(policeAe, referralId, "accepted"))).toBe("not_found");
    expect(await codeOf(decideReferral(policeIn, referralId, "accepted"))).toBe("not_found");
    await decideReferral(policeNp, referralId, "accepted");
    expect(await codeOf(decideReferral(policeNp, referralId, "declined"))).toBe("already_decided");

    // Accepted: Nepal can now work the case, with its own audited PII access.
    const accepted = await getCase(policeNp, c.id);
    expect(accepted.scope).toBe("full");
    expect((await revealPii(policeNp, c.id, BASIS)).ownerName).toBe("Referred Owner");
    // …but cannot forward it to a third country, and the UAE still sees nothing.
    expect(await codeOf(createReferral(policeNp, c.id, { ...ref, to: "AE" }))).toBe("not_home_jurisdiction");
    expect(await codeOf(getCase(policeAe, c.id))).toBe("not_found");

    // Inter-agency messages are encrypted at rest and visible to both sides.
    await postMessage(policeIn, c.id, "Seizure memo attached to FIR. Please confirm receipt.");
    await postMessage(policeNp, c.id, "Received. Team assigned.");
    const raw = await query("SELECT body_enc FROM messages WHERE case_id = $1::uuid", [c.id]);
    expect(raw.every((m) => m.body_enc.startsWith("v1.") && !m.body_enc.includes("Seizure"))).toBe(true);
    expect((await getCase(policeNp, c.id)).detail!.messages).toHaveLength(2);
    expect(await codeOf(postMessage(admin, c.id, "hello"))).toBe("forbidden");

    // The owner is told the case was referred, and to which country.
    const owner = await ownerView(c.id);
    expect(owner.events.some((e) => e.kind === "referral_created" && e.country === "NP")).toBe(true);
  });

  it("a declined referral gives the other country no access", async () => {
    const c = await newCase({ country: "IN" });
    const { id } = await createReferral(policeIn, c.id, { to: "AE", reason: "Suspected export to the UAE.", legalBasis: "Interpol channel request 2026/55" });
    await decideReferral(policeAe, id, "declined");
    expect(await codeOf(getCase(policeAe, c.id))).toBe("not_found");
  });
});

describe("case status and disputes", () => {
  it("allows only valid transitions", async () => {
    const c = await newCase();
    await verifyContact(c.id);
    expect(await codeOf(setStatus(policeIn, c.id, "open", ""))).toBe("invalid_transition");
    await setStatus(policeIn, c.id, "recovered", "Returned to owner");
    expect(await codeOf(setStatus(policeIn, c.id, "active", ""))).toBe("invalid_transition");
    expect(await codeOf(setStatus(admin, c.id, "closed", ""))).toBe("forbidden");
  });

  it("an officer resolves a dispute: one claim upheld, the other closed", async () => {
    const imei = imeiN(140);
    const real = await newCase({ imei, contact: "real@owner.test" });
    const fake = await newCase({ imei, contact: "fake@owner.test" });
    expect(await codeOf(setStatus(policeIn, real.id, "closed", ""))).toBe("invalid_transition");
    expect(await codeOf(resolveDispute(policeIn, real.id, "short"))).toBe("invalid_input");
    expect(await codeOf(resolveDispute(telecomIn, real.id, "Verified invoice and ID in person."))).toBe("forbidden");
    await resolveDispute(policeIn, real.id, "Verified invoice and ID in person.");
    expect((await ownerView(real.id)).status).toBe("active");
    const loser = await ownerView(fake.id);
    expect(loser.status).toBe("closed");
    expect(loser.events.some((e) => e.kind === "dispute_resolved" && (e.payload as { outcome: string }).outcome === "not_upheld")).toBe(true);
  });
});

describe("audit trail", () => {
  it("is restricted to admin and auditor", async () => {
    expect(await codeOf(auditTrail(policeIn))).toBe("forbidden");
    expect(await codeOf(auditTrail(telecomIn))).toBe("forbidden");
    const t = await auditTrail(auditor);
    expect(t.chain.ok).toBe(true);
    expect(t.entries.length).toBeGreaterThan(20);
  });

  it("records who viewed a case", async () => {
    const c = await newCase();
    await getCase(policeIn, c.id);
    const rows = await query("SELECT actor_id FROM audit_log WHERE action = 'case.viewed' AND case_id = $1::uuid", [c.id]);
    expect(rows.map((r) => r.actor_id)).toContain(policeIn.id);
  });

  it("contains no raw identifiers", async () => {
    const imei = imeiN(150);
    const c = await newCase({ imei, ownerName: "Audit Canary", phone: "9812377777" });
    await verifyContact(c.id);
    await revealPii(policeIn, c.id, BASIS);
    const all = JSON.stringify(await query("SELECT * FROM audit_log"));
    for (const secret of [imei, "Audit Canary", "9812377777"]) expect(all).not.toContain(secret);
  });

  it("detects an edited entry, a deleted entry, and survives concurrent writers", async () => {
    await Promise.all(Array.from({ length: 12 }, () => newCase()));
    const before = await verifyAuditChain();
    expect(before.ok).toBe(true);
    const seqs = await query<{ seq: number }>("SELECT seq FROM audit_log ORDER BY seq");
    expect(seqs.map((s) => s.seq)).toEqual(seqs.map((_, i) => i + 1)); // gap-free under concurrency

    const target = await queryOne<{ seq: number; detail: string }>("SELECT seq, detail FROM audit_log WHERE action = 'pii.revealed' ORDER BY seq LIMIT 1");
    await query("UPDATE audit_log SET detail = $2 WHERE seq = $1", [target!.seq, '{"legalBasis":"rewritten after the fact"}']);
    const edited = await verifyAuditChain();
    expect(edited.ok).toBe(false);
    expect(edited.brokenAtSeq).toBe(target!.seq);
    await query("UPDATE audit_log SET detail = $2 WHERE seq = $1", [target!.seq, target!.detail]);
    expect((await verifyAuditChain()).ok).toBe(true);

    await query("DELETE FROM audit_log WHERE seq = $1", [target!.seq]);
    const deleted = await verifyAuditChain();
    expect(deleted.ok).toBe(false);
    expect(deleted.brokenAtSeq).toBe(target!.seq + 1);
  });
});

describe("retention", () => {
  it("purges cases past their date but keeps disputed/referred ones and the audit record", async () => {
    const old = await newCase({ ownerName: "Old Case" });
    const fresh = await newCase();
    const imei = imeiN(160);
    const heldA = await newCase({ imei, contact: "held.a@owner.test" });
    await newCase({ imei, contact: "held.b@owner.test" });
    await query("UPDATE cases SET purge_after = now() - interval '1 day' WHERE id IN ($1::uuid, $2::uuid)", [old.id, heldA.id]);

    expect(await codeOf(runRetention(policeIn))).toBe("forbidden");
    const r = await runRetention(admin);
    expect(r.purgedCases).toBe(1);
    expect(await queryOne("SELECT id FROM cases WHERE id = $1::uuid", [old.id])).toBeNull();
    expect(await queryOne("SELECT id FROM cases WHERE id = $1::uuid", [fresh.id])).not.toBeNull();
    expect(await queryOne("SELECT id FROM cases WHERE id = $1::uuid", [heldA.id])).not.toBeNull();
    const purged = await queryOne("SELECT COUNT(*)::int AS n FROM audit_log WHERE action = 'case.purged' AND case_id = $1::uuid", [old.id]);
    expect(purged!.n).toBe(1);
  });
});
