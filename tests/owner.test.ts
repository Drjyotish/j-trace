import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { query, queryOne } from "@/lib/db";
import { hmac } from "@/lib/crypto";
import { resetRateLimits } from "@/lib/ratelimit";
import { LIMITS } from "@/lib/config";
import {
  addEvidence, attachImei, complaintDraft, confirmContactOtp, createCase, eraseCase, markRecovered, openCase,
  ownerView, requestContactOtp, setStep,
} from "@/lib/services/owner";
import { confirmDevice, confirmImeiRecovery, registerDevice, requestImeiRecovery } from "@/lib/services/vault";
import { codeOf, freshDb, imeiN, newCase, nextIp, verifyContact } from "./helpers";

beforeAll(() => freshDb());
beforeEach(() => resetRateLimits());

describe("starting a case", () => {
  it("creates a case with a reference, a secret key and the full recovery plan", async () => {
    const c = await newCase({ country: "NP", platform: "ios", imei: imeiN(1), phone: "9801234567", locale: "ne" });
    expect(c.ref).toMatch(/^JT-NP-[2-9A-Z]{8}$/);
    expect(c.accessKey.length).toBeGreaterThanOrEqual(20);
    const v = await ownerView(c.id);
    expect(v.status).toBe("open");
    expect(v.steps).toHaveLength(10);
    expect(v.steps[0].title).toMatch(/[ऀ-ॿ]/); // Nepali, as requested
    expect(v.verification.level).toBe(0);
    expect(v.blockHandoff.url).toContain("mdms.nta.gov.np");
  });

  it("stores identifiers encrypted and pseudonymised, never in the clear", async () => {
    const imei = imeiN(2);
    const c = await newCase({ imei, phone: "9812345671", ownerName: "Plaintext Canary", incidentPlace: "Canary Street" });
    const row = await queryOne("SELECT * FROM cases WHERE id = $1::uuid", [c.id]);
    const dump = JSON.stringify(row);
    expect(dump).not.toContain(imei);
    expect(dump).not.toContain("9812345671");
    expect(dump).not.toContain("Plaintext Canary");
    expect(dump).not.toContain("Canary Street");
    expect(dump).not.toContain(c.accessKey);
    expect(row!.imei_hmac).toBe(hmac(imei, "imei"));
    expect(row!.imei_enc.startsWith("v1.")).toBe(true);
  });

  it("the owner only ever sees a masked IMEI back", async () => {
    const imei = imeiN(3);
    const c = await newCase({ imei });
    const v = await ownerView(c.id);
    expect(v.imeiMasked).toBe(`${imei.slice(0, 2)}•••••••••${imei.slice(-4)}`);
    expect(JSON.stringify(v)).not.toContain(imei);
  });

  it("refuses without consent", async () => {
    expect(await codeOf(newCase({ consent: false }))).toBe("consent_required");
  });

  it("validates country, IMEI, phone and contact", async () => {
    expect(await codeOf(newCase({ country: "US" }))).toBe("invalid_input");
    expect(await codeOf(newCase({ imei: "490154203237519" }))).toBe("invalid_input");
    expect(await codeOf(newCase({ imei: "000000000000000" }))).toBe("invalid_input");
    expect(await codeOf(newCase({ phone: "12345" }))).toBe("invalid_input");
    expect(await codeOf(newCase({ contact: "nope" }))).toBe("invalid_input");
    expect(await codeOf(newCase({ incidentAt: "2999-01-01T00:00:00Z" }))).toBe("invalid_input");
  });

  it("refuses to send codes to the missing phone itself", async () => {
    expect(await codeOf(newCase({ phone: "9812345672", contact: "+91 98123 45672" }))).toBe("invalid_input");
  });

  it("rate-limits case creation per IP", async () => {
    const ip = "203.0.113.9";
    const mk = () => createCase({ country: "IN", incidentType: "lost", contact: "rl@owner.test", consent: true }, { ip });
    for (let i = 0; i < 5; i++) await mk();
    expect(await codeOf(mk())).toBe("rate_limited");
  });
});

describe("re-opening a case from another device", () => {
  it("opens with the right key", async () => {
    const c = await newCase();
    expect((await openCase(c.ref, c.accessKey, { ip: nextIp() })).id).toBe(c.id);
    expect((await openCase(c.ref.toLowerCase(), c.accessKey, { ip: nextIp() })).id).toBe(c.id);
  });

  it("gives the same answer for a wrong key and for a reference that does not exist", async () => {
    const c = await newCase();
    const wrongKey = await codeOf(openCase(c.ref, "wrong-key", { ip: nextIp() }));
    const noSuchRef = await codeOf(openCase("JT-IN-ZZZZZZZZ", c.accessKey, { ip: nextIp() }));
    expect(wrongKey).toBe("case_not_found");
    expect(noSuchRef).toBe("case_not_found");
  });

  it("locks out key guessing against one reference", async () => {
    const c = await newCase();
    for (let i = 0; i < 5; i++) await codeOf(openCase(c.ref, `guess-${i}`, { ip: nextIp() }));
    // Even the correct key is refused once the reference is locked.
    expect(await codeOf(openCase(c.ref, c.accessKey, { ip: nextIp() }))).toBe("rate_limited");
  });
});

describe("contact verification (one-time code)", () => {
  it("verifies with the right code and moves the case to active, level 1", async () => {
    const c = await newCase();
    const r = await requestContactOtp(c.id, { ip: nextIp() });
    expect(r.sent).toBe(true);
    expect(r.simulatedDelivery).toBe(true);
    expect(r.to).toContain("•");
    const done = await confirmContactOtp(c.id, r.demoCode!, { ip: nextIp() });
    expect(done.level).toBe(1);
    const v = await ownerView(c.id);
    expect(v.status).toBe("active");
    expect(v.contactVerified).toBe(true);
  });

  it("stores only a hash of the code", async () => {
    const c = await newCase();
    const r = await requestContactOtp(c.id, { ip: nextIp() });
    const row = await queryOne("SELECT code_hash FROM otps WHERE case_id = $1::uuid", [c.id]);
    expect(row!.code_hash).not.toContain(r.demoCode!);
    expect(row!.code_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects a wrong code and locks after too many attempts — even for the right code", async () => {
    const c = await newCase();
    const r = await requestContactOtp(c.id, { ip: nextIp() });
    const wrong = r.demoCode === "000000" ? "111111" : "000000";
    for (let i = 0; i < LIMITS.otpMaxAttempts; i++) expect(await codeOf(confirmContactOtp(c.id, wrong))).toBe("otp_invalid");
    expect(await codeOf(confirmContactOtp(c.id, r.demoCode!))).toBe("otp_locked");
    expect((await ownerView(c.id)).contactVerified).toBe(false);
  });

  it("rejects an expired code", async () => {
    const c = await newCase();
    const r = await requestContactOtp(c.id, { ip: nextIp() });
    await query("UPDATE otps SET expires_at = now() - interval '1 minute' WHERE case_id = $1::uuid", [c.id]);
    expect(await codeOf(confirmContactOtp(c.id, r.demoCode!))).toBe("otp_invalid");
  });

  it("a new code invalidates the previous one", async () => {
    const c = await newCase();
    const first = await requestContactOtp(c.id, { ip: nextIp() });
    const second = await requestContactOtp(c.id, { ip: nextIp() });
    if (first.demoCode !== second.demoCode) expect(await codeOf(confirmContactOtp(c.id, first.demoCode!))).toBe("otp_invalid");
    expect((await confirmContactOtp(c.id, second.demoCode!)).verified).toBe(true);
  });

  it("rate-limits code requests for one contact", async () => {
    const c = await newCase();
    for (let i = 0; i < 3; i++) await requestContactOtp(c.id, { ip: nextIp() });
    expect(await codeOf(requestContactOtp(c.id, { ip: nextIp() }))).toBe("rate_limited");
  });
});

describe("ownership evidence", () => {
  it("self-declared evidence alone never reaches level 2", async () => {
    const c = await newCase({ imei: imeiN(10) });
    await verifyContact(c.id);
    const sha = "a".repeat(64);
    await addEvidence(c.id, { kind: "invoice", sha256: sha, fileName: "bill.pdf" });
    await addEvidence(c.id, { kind: "box_label", sha256: sha });
    await addEvidence(c.id, { kind: "id_document", sha256: sha });
    await addEvidence(c.id, { kind: "police_report", reference: "FIR-1/2026" });
    const r = await addEvidence(c.id, { kind: "account_access" });
    expect(r.level).toBe(1);
    expect(r.score).toBeLessThan(LIMITS.ownershipThreshold);
    expect((await ownerView(c.id)).policeRef).toBe("FIR-1/2026");
  });

  it("a client cannot assert system evidence", async () => {
    const c = await newCase();
    expect(await codeOf(addEvidence(c.id, { kind: "vault_match" }))).toBe("invalid_input");
    expect(await codeOf(addEvidence(c.id, { kind: "contact_otp" }))).toBe("invalid_input");
    expect(await codeOf(addEvidence(c.id, { kind: "anything" }))).toBe("invalid_input");
  });

  it("documents are stored as fingerprints only and need a valid SHA-256", async () => {
    const c = await newCase();
    expect(await codeOf(addEvidence(c.id, { kind: "invoice", sha256: "xyz" }))).toBe("invalid_input");
    expect(await codeOf(addEvidence(c.id, { kind: "police_report", reference: "" }))).toBe("invalid_input");
  });
});

describe("device vault: phone number -> IMEI, lawfully", () => {
  const phone = "9811100001";
  const imei = imeiN(20);
  const recovery = "vault.owner@owner.test";

  it("registers a handset after confirming the recovery contact", async () => {
    const r = await registerDevice({ country: "IN", imei, phone, recoveryContact: recovery, brand: "Samsung", model: "A55", consent: true }, { ip: nextIp() });
    expect(r.to).toContain("•");
    expect(await codeOf(confirmDevice(r.requestId, r.demoCode === "000000" ? "111111" : "000000"))).toBe("otp_invalid");
    expect((await confirmDevice(r.requestId, r.demoCode!)).registered).toBe(true);
    const row = await queryOne("SELECT * FROM devices WHERE imei_hmac = $1", [hmac(imei, "imei")]);
    expect(row!.contact_verified).toBe(true);
    expect(JSON.stringify(row)).not.toContain(imei);
  });

  it("refuses a recovery contact that is the phone being protected", async () => {
    expect(await codeOf(registerDevice({ country: "IN", imei: imeiN(21), phone: "9811100002", recoveryContact: "9811100002", consent: true }, { ip: nextIp() }))).toBe("invalid_input");
  });

  it("returns the IMEI only to whoever controls the recovery contact", async () => {
    const r = await requestImeiRecovery(phone, "IN", { ip: nextIp() });
    const out = await confirmImeiRecovery(r.requestId, r.demoCode!);
    expect(out.imei).toBe(imei);
    expect(out.model).toBe("A55");
    // The code is single-use.
    expect(await codeOf(confirmImeiRecovery(r.requestId, r.demoCode!))).toBe("otp_invalid");
  });

  it("answers identically for a number that is not in the vault (no enumeration)", async () => {
    const known = await requestImeiRecovery(phone, "IN", { ip: nextIp() });
    const unknown = await requestImeiRecovery("9899999999", "IN", { ip: nextIp() });
    expect(Object.keys(unknown).sort()).toEqual(Object.keys(known).sort());
    expect(unknown.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(unknown.demoCode).toMatch(/^\d{6}$/);
    // …and the dummy code leads nowhere.
    expect(await codeOf(confirmImeiRecovery(unknown.requestId, unknown.demoCode!))).toBe("otp_invalid");
  });

  it("rate-limits lookups per phone number", async () => {
    for (let i = 0; i < 3; i++) await requestImeiRecovery("9811100009", "IN", { ip: nextIp() });
    expect(await codeOf(requestImeiRecovery("9811100009", "IN", { ip: nextIp() }))).toBe("rate_limited");
  });

  it("a second person cannot take over or overwrite a registered handset", async () => {
    const r = await registerDevice({ country: "IN", imei, phone: "9811100003", recoveryContact: "attacker@evil.test", consent: true }, { ip: nextIp() });
    // Same response shape as a genuine registration…
    expect(r.requestId).toMatch(/^[0-9a-f-]{36}$/);
    // …but the code confirms nothing and the original record is untouched.
    expect(await codeOf(confirmDevice(r.requestId, r.demoCode!))).toBe("otp_invalid");
    const row = await queryOne("SELECT recovery_contact_hmac FROM devices WHERE imei_hmac = $1", [hmac(imei, "imei")]);
    expect(row!.recovery_contact_hmac).toBe(hmac(recovery, "contact"));
  });

  it("a mature vault record + verified contact establishes ownership (level 2)", async () => {
    await query("UPDATE devices SET created_at = now() - interval '30 days' WHERE imei_hmac = $1", [hmac(imei, "imei")]);
    const c = await newCase({ imei, contact: recovery });
    const r = await verifyContact(c.id);
    expect(r.level).toBe(2);
    expect(r.score).toBe(65);
  });

  it("a vault record created just before the claim does not", async () => {
    const fresh = imeiN(22);
    const reg = await registerDevice({ country: "IN", imei: fresh, phone: "9811100004", recoveryContact: "fresh@owner.test", consent: true }, { ip: nextIp() });
    await confirmDevice(reg.requestId, reg.demoCode!);
    const c = await newCase({ imei: fresh, contact: "fresh@owner.test" });
    const r = await verifyContact(c.id);
    expect(r.level).toBe(1);
    expect(r.score).toBe(30);
  });

  it("claiming someone else's vaulted handset earns nothing and is flagged to officers", async () => {
    const c = await newCase({ imei, contact: "thief@evil.test" });
    // (the genuine owner's case above already exists -> this is also a dispute)
    const r = await verifyContact(c.id);
    expect(r.score).toBe(15);
    const flagged = await queryOne("SELECT COUNT(*)::int AS n FROM case_events WHERE case_id = $1::uuid AND kind = 'vault_mismatch' AND visibility = 'staff'", [c.id]);
    expect(flagged!.n).toBe(1);
    expect((await ownerView(c.id)).status).toBe("disputed");
  });
});

describe("competing claims on one handset", () => {
  it("freezes both cases and tells neither claimant anything about the other", async () => {
    const imei = imeiN(30);
    const a = await newCase({ imei, contact: "first@owner.test" });
    expect((await ownerView(a.id)).status).toBe("open");
    const b = await newCase({ imei, contact: "second@owner.test" });
    const va = await ownerView(a.id);
    const vb = await ownerView(b.id);
    expect(va.status).toBe("disputed");
    expect(vb.status).toBe("disputed");
    expect(JSON.stringify(va)).not.toContain("second@");
    expect(JSON.stringify(vb)).not.toContain("first@");
    expect(await codeOf(markRecovered(a.id))).toBe("case_disputed");
    expect(await codeOf(eraseCase(a.id))).toBe("erasure_restricted");
  });

  it("the same person filing twice is not a dispute", async () => {
    const imei = imeiN(31);
    const a = await newCase({ imei, contact: "same@owner.test" });
    await newCase({ imei, contact: "same@owner.test" });
    expect((await ownerView(a.id)).status).toBe("open");
  });

  it("adding the IMEI later triggers the same check, and the IMEI cannot be swapped afterwards", async () => {
    const imei = imeiN(32);
    await newCase({ imei, contact: "holder@owner.test" });
    const late = await newCase({ contact: "late@owner.test" });
    expect((await attachImei(late.id, imei)).disputed).toBe(true);
    expect(await codeOf(attachImei(late.id, imeiN(33)))).toBe("imei_locked");
  });
});

describe("what an owner is shown", () => {
  it("records steps and the official request number", async () => {
    const c = await newCase();
    await setStep(c.id, "block_imei", true, { requestId: "CEIR-REQ-12345" });
    const v = await ownerView(c.id);
    expect(v.steps.find((s) => s.key === "block_imei")!.done).toBe(true);
    expect(v.events.some((e) => e.kind === "block_request_recorded" && (e.payload as { requestId?: string }).requestId === "CEIR-REQ-12345")).toBe(true);
    expect(await codeOf(setStep(c.id, "hack_the_planet", true))).toBe("invalid_input");
  });

  it("prepares a complaint in English, Hindi and Nepali from the owner's own data", async () => {
    const imei = imeiN(40);
    const c = await newCase({ imei, ownerName: "Asha Verma", incidentPlace: "Lajpat Nagar" });
    const en = await complaintDraft(c.id, "en");
    expect(en.text).toContain("Asha Verma");
    expect(en.text).toContain(imei);
    expect(en.text).toContain("Sanchar Saathi");
    expect(en.text).toContain("not a government service");
    expect((await complaintDraft(c.id, "hi")).text).toMatch(/थाना प्रभारी/);
    expect((await complaintDraft(c.id, "ne")).text).toMatch(/उजुरी/);
  });

  it("marks a case recovered and schedules deletion", async () => {
    const c = await newCase();
    await markRecovered(c.id);
    const v = await ownerView(c.id);
    expect(v.status).toBe("recovered");
    const days = (new Date(v.purgeAfter).getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(LIMITS.retentionDaysAfterClose);
  });

  it("erases everything on request, leaving only a PII-free audit entry", async () => {
    const c = await newCase({ imei: imeiN(41), ownerName: "Erase Me" });
    await verifyContact(c.id);
    await eraseCase(c.id);
    expect(await queryOne("SELECT id FROM cases WHERE id = $1::uuid", [c.id])).toBeNull();
    for (const t of ["case_events", "case_evidence", "case_steps", "otps", "outbox"]) {
      expect((await queryOne(`SELECT COUNT(*)::int AS n FROM ${t} WHERE case_id = $1::uuid`, [c.id]))!.n, t).toBe(0);
    }
    const trail = await query("SELECT action, detail FROM audit_log WHERE case_id = $1::uuid", [c.id]);
    expect(trail.some((r) => r.action === "case.erased")).toBe(true);
    expect(JSON.stringify(trail)).not.toContain("Erase Me");
  });
});
