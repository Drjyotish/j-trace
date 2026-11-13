import { describe, expect, it } from "vitest";
import { buildImei, checkImei, isValidImei, luhnCheckDigit, maskImei, normalizeImei } from "@/lib/imei";
import { decrypt, encrypt, hashPassword, hmac, verifyPassword } from "@/lib/crypto";
import { maskContact, normalizeContact, normalizePhone } from "@/lib/phone";
import { rateLimit, resetRateLimits } from "@/lib/ratelimit";
import { effectiveLevel, priorityScore, scoreOwnership, WEIGHTS } from "@/lib/ownership";
import { can, caseScope, type Staff } from "@/lib/rbac";
import { buildPlaybook, LOCALES, type Platform } from "@/lib/playbook";
import { INTEGRATIONS, simulateNetworkEvent } from "@/lib/adapters";
import { COUNTRIES, LIMITS } from "@/lib/config";

describe("IMEI validation", () => {
  it("accepts well-known valid IMEIs", () => {
    expect(isValidImei("490154203237518")).toBe(true); // 3GPP documentation example
    expect(isValidImei("35 209900 176148 1")).toBe(true);
  });
  it("computes the Luhn check digit", () => {
    expect(luhnCheckDigit("49015420323751")).toBe(8);
    expect(buildImei("49015420323751")).toBe("490154203237518");
  });
  it("rejects a wrong check digit, wrong length, letters, empty", () => {
    expect(checkImei("490154203237519").problem).toBe("bad_checksum");
    expect(checkImei("49015420323751").problem).toBe("wrong_length");
    expect(checkImei("4901542032375180").problem).toBe("wrong_length"); // IMEISV
    expect(checkImei("49015420323751X").problem).toBe("not_digits");
    expect(checkImei("  ").problem).toBe("empty");
  });
  it("rejects placeholder IMEIs that pass Luhn", () => {
    expect(checkImei("000000000000000").problem).toBe("placeholder");
    expect(checkImei("000000001234560").problem).toBe("placeholder");
  });
  it("normalises separators and masks for display", () => {
    expect(normalizeImei("49-015420-323751-8")).toBe("490154203237518");
    expect(maskImei("490154203237518")).toBe("49•••••••••7518");
    expect(maskImei("490154203237518")).not.toContain("0154203");
  });
});

describe("crypto", () => {
  it("round-trips and never repeats ciphertext", () => {
    const a = encrypt("+919812345670");
    const b = encrypt("+919812345670");
    expect(a).not.toBe(b);
    expect(a).not.toContain("9812345670");
    expect(decrypt(a)).toBe("+919812345670");
  });
  it("detects tampering (GCM auth tag)", () => {
    const parts = encrypt("secret").split(".");
    parts[2] = Buffer.from("hacked").toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
  });
  it("separates pseudonyms by purpose", () => {
    expect(hmac("490154203237518", "imei")).toBe(hmac("490154203237518", "imei"));
    expect(hmac("490154203237518", "imei")).not.toBe(hmac("490154203237518", "phone"));
    expect(hmac("490154203237518", "imei")).toMatch(/^[a-f0-9]{64}$/);
  });
  it("hashes passwords with a salt and verifies them", () => {
    const h1 = hashPassword("correct horse");
    const h2 = hashPassword("correct horse");
    expect(h1).not.toBe(h2);
    expect(verifyPassword("correct horse", h1)).toBe(true);
    expect(verifyPassword("wrong horse", h1)).toBe(false);
    expect(verifyPassword("x", "garbage")).toBe(false);
  });
});

describe("phone and contact normalisation", () => {
  it("normalises Indian, Nepali and UAE mobiles to E.164", () => {
    expect(normalizePhone("98123 45670", "IN")).toBe("+919812345670");
    expect(normalizePhone("+91-9812345670", "IN")).toBe("+919812345670");
    expect(normalizePhone("09812345670", "IN")).toBe("+919812345670");
    expect(normalizePhone("9801234567", "NP")).toBe("+9779801234567");
    expect(normalizePhone("+977 9801234567", "NP")).toBe("+9779801234567");
    expect(normalizePhone("050 123 4567", "AE")).toBe("+971501234567");
    expect(normalizePhone("00971501234567", "AE")).toBe("+971501234567");
  });
  it("rejects implausible numbers", () => {
    expect(normalizePhone("12345", "IN")).toBeNull();
    expect(normalizePhone("5812345670", "IN")).toBeNull();
    expect(normalizePhone("9512345678", "NP")).toBeNull();
    expect(normalizePhone("401234567", "AE")).toBeNull();
  });
  it("accepts e-mail or phone as a contact and masks both", () => {
    expect(normalizeContact("Asha@Example.org ", "IN")).toEqual({ kind: "email", value: "asha@example.org" });
    expect(normalizeContact("not-an-email@", "IN")).toBeNull();
    expect(maskContact("asha@example.org")).toBe("a•••@example.org");
    expect(maskContact("+919812345670")).not.toContain("98123456");
  });
});

describe("rate limiter", () => {
  it("allows up to the limit, then blocks with a retry hint, then recovers", () => {
    resetRateLimits();
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit("t", "k", 3, 60_000, t0 + i).ok).toBe(true);
    const blocked = rateLimit("t", "k", 3, 60_000, t0 + 10);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(rateLimit("t", "other", 3, 60_000, t0 + 10).ok).toBe(true);
    expect(rateLimit("t", "k", 3, 60_000, t0 + 61_000).ok).toBe(true);
  });
});

describe("ownership scoring", () => {
  const declared = (kind: keyof typeof WEIGHTS) => ({ kind, status: "declared" as const });
  const accepted = (kind: keyof typeof WEIGHTS, meta = {}) => ({ kind, status: "accepted" as const, meta });

  it("nothing a claimant can merely type reaches the threshold", () => {
    const r = scoreOwnership([accepted("contact_otp"), declared("invoice"), declared("box_label"), declared("police_report"), declared("id_document"), declared("account_access")]);
    expect(r.score).toBeLessThan(LIMITS.ownershipThreshold);
    expect(r.level).toBe(1);
  });
  it("a mature vault record plus a verified contact establishes ownership", () => {
    const r = scoreOwnership([accepted("contact_otp"), accepted("vault_match", { mature: true })]);
    expect(r.score).toBe(65);
    expect(r.level).toBe(2);
  });
  it("a vault record made just before the claim proves little", () => {
    const r = scoreOwnership([accepted("contact_otp"), accepted("vault_match", { mature: false })]);
    expect(r.score).toBe(30);
    expect(r.level).toBe(1);
  });
  it("an officer accepting documents lifts the case to level 3", () => {
    const r = scoreOwnership([accepted("contact_otp"), accepted("police_report"), accepted("invoice")]);
    expect(r.score).toBe(60);
    expect(r.level).toBe(3);
  });
  it("no contact verification means level 0 whatever else is claimed", () => {
    expect(scoreOwnership([accepted("vault_match", { mature: true }), accepted("police_report")]).level).toBe(0);
  });
  it("system evidence cannot be self-declared, rejected evidence counts for nothing", () => {
    expect(scoreOwnership([declared("vault_match"), declared("contact_otp")]).score).toBe(0);
    expect(scoreOwnership([{ kind: "invoice", status: "rejected" }]).score).toBe(0);
  });
  it("a disputed case discloses no more than level 1", () => {
    expect(effectiveLevel(3, "disputed")).toBe(1);
    expect(effectiveLevel(3, "active")).toBe(3);
  });
  it("prioritises stolen, cross-border, recent cases and zeroes closed ones", () => {
    const base = { incidentType: "stolen" as const, level: 2, status: "active", createdAt: new Date(), hasSimChange: true, hasCrossBorder: true };
    expect(priorityScore(base)).toBe(95);
    expect(priorityScore({ ...base, incidentType: "lost", hasCrossBorder: false, hasSimChange: false })).toBeLessThan(priorityScore(base));
    expect(priorityScore({ ...base, status: "closed" })).toBe(0);
  });
});

describe("role-based access and jurisdiction", () => {
  const staff = (over: Partial<Staff>): Staff => ({ id: "1", email: "a@b", name: "n", role: "police", agency: "x", jurisdiction: "IN", verified: true, disabled: false, ...over });

  it("only police can reveal PII; telecom, admin and auditor cannot", () => {
    expect(can(staff({ role: "police" }), "pii:reveal")).toBe(true);
    for (const role of ["telecom", "admin", "auditor"] as const) expect(can(staff({ role }), "pii:reveal")).toBe(false);
  });
  it("auditor is read-only; admin cannot change case outcomes", () => {
    expect(can(staff({ role: "auditor" }), "audit:read")).toBe(true);
    expect(can(staff({ role: "auditor" }), "case:status")).toBe(false);
    expect(can(staff({ role: "admin" }), "case:status")).toBe(false);
    expect(can(staff({ role: "admin" }), "evidence:review")).toBe(false);
  });
  it("unverified or disabled accounts have no permissions at all", () => {
    expect(can(staff({ verified: false }), "case:list")).toBe(false);
    expect(can(staff({ disabled: true }), "case:list")).toBe(false);
    expect(caseScope(staff({ verified: false }), "IN")).toBe("none");
  });
  it("an officer sees only their country, plus cases referred to it", () => {
    const np = staff({ jurisdiction: "NP" });
    expect(caseScope(staff({}), "IN")).toBe("full");
    expect(caseScope(np, "IN")).toBe("none");
    expect(caseScope(np, "IN", [{ to_jurisdiction: "NP", status: "pending" }])).toBe("summary");
    expect(caseScope(np, "IN", [{ to_jurisdiction: "NP", status: "accepted" }])).toBe("full");
    expect(caseScope(np, "IN", [{ to_jurisdiction: "NP", status: "declined" }])).toBe("none");
    expect(caseScope(np, "IN", [{ to_jurisdiction: "AE", status: "accepted" }])).toBe("none");
  });
  it("global roles get metadata only", () => {
    expect(caseScope(staff({ role: "admin", jurisdiction: "ALL" }), "IN")).toBe("summary");
    expect(caseScope(staff({ role: "auditor", jurisdiction: "ALL" }), "AE")).toBe("summary");
  });
});

describe("recovery playbook", () => {
  const OFFICIAL_HOSTS = /(^|\.)(google\.com|icloud\.com|apple\.com|samsung\.com|gov\.in|gov\.np|gov\.ae)$/;

  it("has every step in English, Hindi and Nepali for every country and platform", () => {
    for (const country of COUNTRIES) {
      for (const platform of ["android", "ios", "other"] as Platform[]) {
        const en = buildPlaybook(country, platform, "en");
        expect(en.length).toBe(10);
        for (const locale of LOCALES) {
          const steps = buildPlaybook(country, platform, locale);
          for (const s of steps) {
            expect(s.title.length, `${country}/${platform}/${locale}/${s.key} title`).toBeGreaterThan(5);
            expect(s.body.length, `${country}/${platform}/${locale}/${s.key} body`).toBeGreaterThan(40);
          }
          if (locale !== "en") {
            // Translated text must actually be Devanagari, not an English fallback.
            for (const s of steps) expect(/[ऀ-ॿ]/.test(s.title), `${locale}/${s.key}`).toBe(true);
          }
        }
      }
    }
  });
  it("links only to first-party HTTPS pages (government, regulator, platform vendor)", () => {
    for (const country of COUNTRIES) {
      for (const platform of ["android", "ios", "other"] as Platform[]) {
        for (const s of buildPlaybook(country, platform)) {
          for (const l of s.links) {
            const u = new URL(l.url);
            expect(u.protocol).toBe("https:");
            expect(OFFICIAL_HOSTS.test(u.hostname), `${l.url}`).toBe(true);
          }
        }
      }
    }
  });
  it("never claims TRACE itself can locate a device", () => {
    for (const s of buildPlaybook("IN", "android")) expect(s.capability).not.toBe("NOT_TECHNICALLY_FEASIBLE");
    expect(buildPlaybook("IN", "android").find((s) => s.key === "locate")!.capability).toBe("REQUIRES_USER_PERMISSION");
  });
});

describe("integration adapters are honest about what they are", () => {
  it("no adapter claims a live privileged integration", () => {
    for (const i of INTEGRATIONS) expect(["user_directed", "simulated", "unavailable"]).toContain(i.mode);
    const privileged = INTEGRATIONS.filter((i) => i.capability === "REQUIRES_GOVERNMENT_AUTHORIZATION" || i.capability === "REQUIRES_TELECOM_PARTNERSHIP");
    expect(privileged.length).toBeGreaterThan(0);
    for (const i of privileged) expect(i.mode).not.toBe("user_directed");
  });
  it("simulated network events are always stamped simulated", () => {
    const e = simulateNetworkEvent("sim_change", "NP", "Ncell");
    expect(e.simulated).toBe(true);
    expect(e.source.startsWith("SIMULATED:")).toBe(true);
  });
  it("refuses to simulate outside demo mode", () => {
    const prev = process.env.TRACE_MODE;
    process.env.TRACE_MODE = "production";
    try {
      expect(() => simulateNetworkEvent("sim_change", "IN")).toThrow();
    } finally {
      process.env.TRACE_MODE = prev;
    }
  });
});
