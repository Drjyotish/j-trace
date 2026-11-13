import { randomUUID } from "node:crypto";
import { query, queryOne, withTx } from "../db";
import { COUNTRIES, LIMITS, isDemo, type Country } from "../config";
import { decrypt, encrypt, hmac, otpCode, randomRef, randomToken, safeEqual } from "../crypto";
import { checkImei, maskImei } from "../imei";
import { maskContact, maskPhone, normalizeContact, normalizePhone } from "../phone";
import { limitBy } from "../ratelimit";
import { AppError, invalid, notFound, tooMany } from "../errors";
import { audit } from "../audit";
import { STEP_KEYS, buildPlaybook, LOCALES, type Locale, type Platform } from "../playbook";
import { SYSTEM_KINDS, scoreOwnership, type EvidenceKind } from "../ownership";
import { blockHandoff, integrationsFor } from "../adapters";
import {
  addEvent, checkDispute, daysFromNow, disclosureLevel, getCaseById, loadEvidence, notifyOwner, parseJson,
  recompute, toEvidenceItems, upsertEvidence, type CaseRow, type Ctx, type EventRow,
} from "./common";

export interface CreateCaseInput {
  country: string;
  incidentType: string;
  incidentAt?: string | null;
  incidentPlace?: string | null;
  platform?: string;
  brand?: string | null;
  model?: string | null;
  phone?: string | null;
  imei?: string | null;
  ownerName?: string | null;
  contact: string;
  locale?: string;
  consent: boolean;
}

const clean = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

export async function createCase(input: CreateCaseInput, ctx: Ctx = {}): Promise<{ id: string; ref: string; accessKey: string }> {
  const rl = limitBy("caseCreatePerIp", ctx.ip ?? "unknown");
  if (!rl.ok) throw tooMany(rl.retryAfterSec);

  if (!COUNTRIES.includes(input.country as Country)) throw invalid("country");
  const country = input.country as Country;
  if (input.incidentType !== "lost" && input.incidentType !== "stolen") throw invalid("incidentType");
  // Consent is the lawful basis for processing (DPDP Act 2023 s.6, Nepal Privacy Act 2075, UAE PDPL art.6).
  if (input.consent !== true) throw new AppError("consent_required", 400);

  const platform: Platform = input.platform === "ios" || input.platform === "other" ? input.platform : "android";
  const locale: Locale = LOCALES.includes(input.locale as Locale) ? (input.locale as Locale) : "en";

  const contact = normalizeContact(input.contact, country);
  if (!contact) throw invalid("contact");

  let phone: string | null = null;
  if (clean(input.phone, 32)) {
    phone = normalizePhone(input.phone!, country);
    if (!phone) throw invalid("phone");
  }
  // A code sent to the missing phone would reach whoever holds it.
  if (phone && contact.value === phone) throw invalid("contact", "same_as_lost_phone");

  let imei: string | null = null;
  if (clean(input.imei, 32)) {
    const chk = checkImei(input.imei!);
    if (!chk.ok) throw invalid("imei", chk.problem);
    imei = chk.imei!;
  }

  let incidentAt: string | null = null;
  if (input.incidentAt) {
    const d = new Date(input.incidentAt);
    if (Number.isNaN(d.getTime()) || d.getTime() > Date.now() + 86_400_000) throw invalid("incidentAt");
    incidentAt = d.toISOString();
  }

  const id = randomUUID();
  const ref = `JT-${country}-${randomRef(8)}`;
  const accessKey = randomToken(18);
  const place = clean(input.incidentPlace, 200);
  const name = clean(input.ownerName, 120);

  await withTx(async () => {
    await query(
      `INSERT INTO cases (id, ref, access_key_hash, country, incident_type, incident_at, incident_place_enc, owner_name_enc,
                          contact_enc, contact_hmac, phone_enc, phone_hmac, imei_enc, imei_hmac, brand, model, platform,
                          locale, consent_at, purge_after)
       VALUES ($1::uuid, $2, $3, $4, $5, $6::timestamptz, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, now(), $19::timestamptz)`,
      [
        id, ref, hmac(accessKey, "key"), country, input.incidentType, incidentAt,
        place ? encrypt(place) : null, name ? encrypt(name) : null,
        encrypt(contact.value), hmac(contact.value, "contact"),
        phone ? encrypt(phone) : null, phone ? hmac(phone, "phone") : null,
        imei ? encrypt(imei) : null, imei ? hmac(imei, "imei") : null,
        clean(input.brand, 60), clean(input.model, 80), platform, locale,
        daysFromNow(LIMITS.retentionDaysInactive),
      ],
    );
    for (const key of STEP_KEYS) {
      await query("INSERT INTO case_steps (case_id, step_key) VALUES ($1::uuid, $2)", [id, key]);
    }
    await addEvent(id, { kind: "case_created", source: "owner", visibility: "owner" });
    await audit({ actorType: "owner", actorId: id, action: "case.created", caseId: id, detail: { country, type: input.incidentType, hasImei: !!imei }, ip: ctx.ip });
    await recompute(id);
    await checkDispute(id, ctx);
  });

  return { id, ref, accessKey };
}

/** Re-open a case from another device with its reference and secret key. */
export async function openCase(ref: string, accessKey: string, ctx: Ctx = {}): Promise<{ id: string; ref: string }> {
  const r = clean(ref, 40)?.toUpperCase() ?? "";
  const byIp = limitBy("caseOpenPerIp", ctx.ip ?? "unknown");
  if (!byIp.ok) throw tooMany(byIp.retryAfterSec);
  const byRef = limitBy("caseOpenPerRef", r);
  if (!byRef.ok) throw tooMany(byRef.retryAfterSec);

  const row = await queryOne<{ id: string; ref: string; access_key_hash: string }>(
    "SELECT id, ref, access_key_hash FROM cases WHERE ref = $1",
    [r],
  );
  // Same work and same answer whether the reference exists or not.
  const candidate = hmac(clean(accessKey, 200) ?? "", "key");
  const ok = safeEqual(candidate, row?.access_key_hash ?? "0".repeat(64)) && !!row;
  if (!ok) {
    await audit({ actorType: "system", actorId: "trace", action: "case.open_failed", detail: { ref: r.slice(0, 16) }, ip: ctx.ip });
    throw new AppError("case_not_found", 404);
  }
  await audit({ actorType: "owner", actorId: row!.id, action: "case.opened", caseId: row!.id, ip: ctx.ip });
  return { id: row!.id, ref: row!.ref };
}

async function requireCase(caseId: string): Promise<CaseRow> {
  const c = await getCaseById(caseId);
  if (!c) throw notFound();
  return c;
}

function otpHash(id: string, code: string): string {
  return hmac(`${id}:${code}`, "key");
}

export async function requestContactOtp(caseId: string, ctx: Ctx = {}): Promise<{ sent: boolean; to: string; alreadyVerified?: boolean; demoCode?: string; simulatedDelivery: boolean }> {
  const c = await requireCase(caseId);
  const to = maskContact(decrypt(c.contact_enc) ?? "");
  if (c.contact_verified) return { sent: false, to, alreadyVerified: true, simulatedDelivery: true };

  const a = limitBy("otpRequestPerSubject", c.contact_hmac);
  if (!a.ok) throw tooMany(a.retryAfterSec);
  const b = limitBy("otpRequestPerIp", ctx.ip ?? "unknown");
  if (!b.ok) throw tooMany(b.retryAfterSec);

  const id = randomUUID();
  const code = otpCode();
  await query("UPDATE otps SET consumed_at = now() WHERE case_id = $1::uuid AND purpose = 'case_contact' AND consumed_at IS NULL", [caseId]);
  await query(
    `INSERT INTO otps (id, purpose, subject_hmac, code_hash, case_id, expires_at)
     VALUES ($1::uuid, 'case_contact', $2, $3, $4::uuid, $5::timestamptz)`,
    [id, c.contact_hmac, otpHash(id, code), caseId, new Date(Date.now() + LIMITS.otpTtlMinutes * 60_000).toISOString()],
  );
  await notifyOwner(c, "contact_otp");
  await audit({ actorType: "owner", actorId: caseId, action: "otp.requested", caseId, ip: ctx.ip });
  // No SMS/e-mail gateway is wired into the prototype; in demo mode the code is returned so the flow can be tried.
  return { sent: true, to, demoCode: isDemo() ? code : undefined, simulatedDelivery: true };
}

export async function confirmContactOtp(caseId: string, code: string, ctx: Ctx = {}): Promise<{ verified: true; level: number; score: number }> {
  const c = await requireCase(caseId);
  const otp = await queryOne<{ id: string; code_hash: string; attempts: number; expires_at: Date }>(
    `SELECT id, code_hash, attempts, expires_at FROM otps
      WHERE case_id = $1::uuid AND purpose = 'case_contact' AND consumed_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    [caseId],
  );
  if (!otp || new Date(otp.expires_at).getTime() < Date.now()) throw new AppError("otp_invalid", 400);
  if (otp.attempts >= LIMITS.otpMaxAttempts) throw new AppError("otp_locked", 429);
  await query("UPDATE otps SET attempts = attempts + 1 WHERE id = $1::uuid", [otp.id]);
  if (!/^\d{6}$/.test(code ?? "") || !safeEqual(otpHash(otp.id, code), otp.code_hash)) {
    await audit({ actorType: "owner", actorId: caseId, action: "otp.failed", caseId, ip: ctx.ip });
    throw new AppError("otp_invalid", 400, { attemptsLeft: Math.max(0, LIMITS.otpMaxAttempts - otp.attempts - 1) });
  }

  return withTx(async () => {
    await query("UPDATE otps SET consumed_at = now() WHERE id = $1::uuid", [otp.id]);
    await query(
      "UPDATE cases SET contact_verified = true, status = CASE WHEN status = 'open' THEN 'active' ELSE status END, updated_at = now() WHERE id = $1::uuid",
      [caseId],
    );
    await upsertEvidence(caseId, "contact_otp", "accepted", null, {});
    await addEvent(caseId, { kind: "contact_verified", source: "trace", visibility: "owner" });
    await matchVault({ ...c, contact_verified: true });
    const r = await recompute(caseId);
    await audit({ actorType: "owner", actorId: caseId, action: "contact.verified", caseId, detail: { level: r.level }, ip: ctx.ip });
    return { verified: true as const, level: r.level, score: r.score };
  });
}

/**
 * Strongest automatic proof: this IMEI was placed in the TRACE vault, with the
 * same verified recovery contact, well before the phone went missing.
 */
async function matchVault(c: CaseRow): Promise<void> {
  if (!c.imei_hmac || !c.contact_verified) return;
  const dev = await queryOne<{ id: string; recovery_contact_hmac: string; created_at: Date }>(
    "SELECT id, recovery_contact_hmac, created_at FROM devices WHERE imei_hmac = $1 AND contact_verified = true",
    [c.imei_hmac],
  );
  if (!dev) return;
  if (dev.recovery_contact_hmac !== c.contact_hmac) {
    // Someone else registered this handset before the claim: officers should see that.
    await addEvent(c.id, { kind: "vault_mismatch", source: "trace", visibility: "staff" });
    return;
  }
  const mature = new Date(dev.created_at).getTime() + LIMITS.vaultMaturityDays * 86_400_000 <= new Date(c.created_at).getTime();
  await upsertEvidence(c.id, "vault_match", "accepted", null, { mature });
  await addEvent(c.id, { kind: "vault_matched", source: "trace", visibility: "owner", payload: { mature } });
}

export interface EvidenceInput {
  kind: string;
  sha256?: string | null;
  reference?: string | null;
  fileName?: string | null;
}

const DECLARABLE: EvidenceKind[] = ["invoice", "box_label", "police_report", "id_document", "account_access"];
const NEEDS_FILE: EvidenceKind[] = ["invoice", "box_label", "id_document"];

export async function addEvidence(caseId: string, input: EvidenceInput, ctx: Ctx = {}): Promise<{ level: number; score: number }> {
  const c = await requireCase(caseId);
  const kind = input.kind as EvidenceKind;
  // contact_otp and vault_match are produced by the system; a client cannot assert them.
  if (!DECLARABLE.includes(kind) || SYSTEM_KINDS.includes(kind)) throw invalid("kind");
  if (c.status === "closed" || c.status === "recovered") throw new AppError("case_closed", 409);

  let sha: string | null = null;
  const meta: Record<string, unknown> = {};
  if (NEEDS_FILE.includes(kind)) {
    // Only a SHA-256 fingerprint is stored. The document itself stays on the owner's device
    // and is shown to an officer when asked, who can confirm the fingerprint matches.
    if (!/^[a-f0-9]{64}$/.test(input.sha256 ?? "")) throw invalid("sha256");
    sha = input.sha256!;
    const fn = clean(input.fileName, 120);
    if (fn) meta.fileName = fn;
  }
  if (kind === "police_report") {
    const ref = clean(input.reference, 64);
    if (!ref || ref.length < 3) throw invalid("reference");
    meta.reference = ref;
    await query("UPDATE cases SET police_ref = $2, updated_at = now() WHERE id = $1::uuid", [caseId, ref]);
  }

  await upsertEvidence(caseId, kind, "declared", sha, meta);
  await addEvent(caseId, { kind: "evidence_added", source: "owner", visibility: "owner", payload: { evidence: kind } });
  const r = await recompute(caseId);
  await audit({ actorType: "owner", actorId: caseId, action: "evidence.declared", caseId, detail: { kind }, ip: ctx.ip });
  return { level: r.level, score: r.score };
}

export async function setStep(caseId: string, stepKey: string, done: boolean, extra: { requestId?: string | null } = {}): Promise<void> {
  await requireCase(caseId);
  if (!STEP_KEYS.includes(stepKey)) throw invalid("step");
  await query(
    `INSERT INTO case_steps (case_id, step_key, done, done_at) VALUES ($1::uuid, $2, $3, CASE WHEN $3 THEN now() ELSE NULL END)
     ON CONFLICT (case_id, step_key) DO UPDATE SET done = EXCLUDED.done, done_at = EXCLUDED.done_at`,
    [caseId, stepKey, done],
  );
  const requestId = clean(extra.requestId, 64);
  if (stepKey === "block_imei" && done) {
    await addEvent(caseId, { kind: "block_request_recorded", source: "owner", visibility: "owner", payload: requestId ? { requestId } : {} });
  }
  await query("UPDATE cases SET updated_at = now() WHERE id = $1::uuid", [caseId]);
}

/** Add the IMEI once it has been found. It can be set only once; changing it needs an officer. */
export async function attachImei(caseId: string, imeiInput: string, ctx: Ctx = {}): Promise<{ disputed: boolean }> {
  const c = await requireCase(caseId);
  if (c.imei_hmac) throw new AppError("imei_locked", 409);
  const chk = checkImei(imeiInput);
  if (!chk.ok) throw invalid("imei", chk.problem);
  return withTx(async () => {
    await query("UPDATE cases SET imei_enc = $2, imei_hmac = $3, updated_at = now() WHERE id = $1::uuid", [caseId, encrypt(chk.imei!), hmac(chk.imei!, "imei")]);
    await addEvent(caseId, { kind: "imei_added", source: "owner", visibility: "owner" });
    await audit({ actorType: "owner", actorId: caseId, action: "imei.attached", caseId, ip: ctx.ip });
    const fresh = (await getCaseById(caseId))!;
    await matchVault(fresh);
    await recompute(caseId);
    const disputed = await checkDispute(caseId, ctx);
    return { disputed };
  });
}

export async function markRecovered(caseId: string, ctx: Ctx = {}): Promise<void> {
  const c = await requireCase(caseId);
  if (c.status === "disputed") throw new AppError("case_disputed", 409);
  await query(
    "UPDATE cases SET status = 'recovered', closed_at = now(), updated_at = now(), purge_after = $2::timestamptz WHERE id = $1::uuid",
    [caseId, daysFromNow(LIMITS.retentionDaysAfterClose)],
  );
  await addEvent(caseId, { kind: "recovered", source: "owner", visibility: "owner" });
  await recompute(caseId);
  await audit({ actorType: "owner", actorId: caseId, action: "case.recovered", caseId, ip: ctx.ip });
}

/** Right to erasure. Restricted only while the case is evidence in a dispute or a cross-border referral. */
export async function eraseCase(caseId: string, ctx: Ctx = {}): Promise<void> {
  const c = await requireCase(caseId);
  if (c.status === "disputed" || c.status === "referred") throw new AppError("erasure_restricted", 409, { status: c.status });
  await query("DELETE FROM cases WHERE id = $1::uuid", [caseId]);
  await audit({ actorType: "owner", actorId: caseId, action: "case.erased", caseId, ip: ctx.ip });
}

const OWNER_EVENT_TEXT_KEYS = new Set([
  "case_created", "contact_verified", "vault_matched", "evidence_added", "imei_added", "block_request_recorded",
  "dispute_opened", "dispute_resolved", "evidence_reviewed", "status_changed", "referral_created", "referral_decided",
  "owner_notice", "officer_access", "recovered",
]);

export async function ownerView(caseId: string, localeIn?: string) {
  const c = await requireCase(caseId);
  const locale: Locale = LOCALES.includes(localeIn as Locale) ? (localeIn as Locale) : (c.locale as Locale);
  const level = disclosureLevel(c);
  const evidenceRows = await loadEvidence(caseId);
  const ownership = scoreOwnership(toEvidenceItems(evidenceRows));
  const stepRows = await query<{ step_key: string; done: boolean; done_at: Date | null }>("SELECT step_key, done, done_at FROM case_steps WHERE case_id = $1::uuid", [caseId]);
  const done = new Map(stepRows.map((s) => [s.step_key, s]));
  const events = await query<EventRow>("SELECT * FROM case_events WHERE case_id = $1::uuid AND visibility = 'owner' ORDER BY created_at DESC", [caseId]);
  const visible = events.filter((e) => e.min_level <= level && OWNER_EVENT_TEXT_KEYS.has(e.kind));
  const imei = decrypt(c.imei_enc);
  const phone = decrypt(c.phone_enc);

  return {
    ref: c.ref,
    status: c.status,
    country: c.country,
    incidentType: c.incident_type,
    incidentAt: c.incident_at,
    platform: c.platform,
    brand: c.brand,
    model: c.model,
    hasImei: !!imei,
    imeiMasked: imei ? maskImei(imei) : null,
    phoneMasked: phone ? maskPhone(phone) : null,
    contactMasked: maskContact(decrypt(c.contact_enc) ?? ""),
    contactVerified: c.contact_verified,
    policeRef: c.police_ref,
    verification: {
      level: c.verification_level,
      effectiveLevel: level,
      score: ownership.score,
      threshold: LIMITS.ownershipThreshold,
      breakdown: ownership.breakdown,
    },
    steps: buildPlaybook(c.country, c.platform, locale).map((s) => ({ ...s, done: done.get(s.key)?.done ?? false, doneAt: done.get(s.key)?.done_at ?? null })),
    evidence: evidenceRows.map((e) => ({ kind: e.kind, status: e.status, createdAt: e.created_at, fileName: parseJson<{ fileName?: string }>(e.meta).fileName ?? null })),
    events: visible.map((e) => ({ id: e.id, kind: e.kind, simulated: e.simulated, country: e.country, payload: parseJson(e.payload), at: e.created_at })),
    hiddenEvents: events.length - visible.length,
    blockHandoff: blockHandoff(c.country),
    integrations: integrationsFor(c.country),
    createdAt: c.created_at,
    purgeAfter: c.purge_after,
    demo: isDemo(),
  };
}

const COMPLAINT: Record<Locale, (d: Record<string, string>) => string> = {
  en: (d) => `To,
The Officer-in-Charge,
${d.station}

Subject: Report of ${d.typeWord} mobile phone — request to register a complaint

Sir/Madam,

I, ${d.name}, wish to report that my mobile phone was ${d.typeWord} on ${d.when}${d.place ? ` at/near ${d.place}` : ""}.

Device details
  Brand / model : ${d.device}
  IMEI          : ${d.imei}
  Mobile number : ${d.phone}

I request you to register my complaint and provide me a copy, which I need in order to have the handset blocked through ${d.channel}. I can be contacted at ${d.contact}.

I declare that the above information is true to the best of my knowledge.

Date: ${d.today}
Signature: ____________________
Name: ${d.name}

(Prepared with J TRACE, case ${d.ref}. J TRACE is an independent tool and is not a government service.)`,
  hi: (d) => `सेवा में,
थाना प्रभारी महोदय,
${d.station}

विषय: मोबाइल फ़ोन ${d.typeWord} होने की सूचना — शिकायत दर्ज करने हेतु निवेदन

महोदय/महोदया,

मैं, ${d.name}, सूचित करना चाहता/चाहती हूँ कि मेरा मोबाइल फ़ोन दिनांक ${d.when} को${d.place ? ` ${d.place} पर/के पास` : ""} ${d.typeWord} हो गया है।

डिवाइस का विवरण
  ब्रांड / मॉडल : ${d.device}
  IMEI         : ${d.imei}
  मोबाइल नंबर  : ${d.phone}

निवेदन है कि मेरी शिकायत दर्ज कर उसकी प्रति मुझे दी जाए, जो ${d.channel} के माध्यम से हैंडसेट ब्लॉक कराने के लिए आवश्यक है। मुझसे ${d.contact} पर संपर्क किया जा सकता है।

मैं घोषणा करता/करती हूँ कि ऊपर दी गई जानकारी मेरी जानकारी के अनुसार सत्य है।

दिनांक: ${d.today}
हस्ताक्षर: ____________________
नाम: ${d.name}

(J TRACE द्वारा तैयार, केस ${d.ref}। J TRACE एक स्वतंत्र साधन है, यह कोई सरकारी सेवा नहीं है।)`,
  ne: (d) => `श्रीमान् प्रमुख ज्यू,
${d.station}

विषय: मोबाइल फोन ${d.typeWord} जानकारी — उजुरी दर्ता गरिदिनुहुन अनुरोध

महोदय,

म, ${d.name}, मेरो मोबाइल फोन मिति ${d.when} मा${d.place ? ` ${d.place} मा/नजिक` : ""} ${d.typeWord} जानकारी गराउँदछु।

डिभाइसको विवरण
  ब्रान्ड / मोडेल : ${d.device}
  IMEI          : ${d.imei}
  मोबाइल नम्बर  : ${d.phone}

मेरो उजुरी दर्ता गरी त्यसको प्रति उपलब्ध गराइदिनुहुन अनुरोध गर्दछु, जुन ${d.channel} मार्फत ह्यान्डसेट ब्लक गराउन आवश्यक छ। मलाई ${d.contact} मा सम्पर्क गर्न सकिन्छ।

माथि उल्लिखित विवरण मेरो जानकारीअनुसार साँचो हो भनी घोषणा गर्दछु।

मिति: ${d.today}
दस्तखत: ____________________
नाम: ${d.name}

(J TRACE द्वारा तयार गरिएको, केस ${d.ref}। J TRACE एक स्वतन्त्र साधन हो, सरकारी सेवा होइन।)`,
};

const TYPE_WORD: Record<Locale, Record<"lost" | "stolen", string>> = {
  en: { lost: "lost", stolen: "stolen" },
  hi: { lost: "गुम", stolen: "चोरी" },
  ne: { lost: "हराएको", stolen: "चोरी भएको" },
};
const STATION: Record<Country, string> = { IN: "____________ Police Station", NP: "____________ Police Office", AE: "____________ Police Station" };
const CHANNEL: Record<Country, string> = { IN: "Sanchar Saathi (CEIR)", NP: "NTA MDMS", AE: "my mobile operator (e& / du)" };

/** A ready-to-print complaint, filled from the owner's own case data. */
export async function complaintDraft(caseId: string, localeIn?: string, ctx: Ctx = {}): Promise<{ locale: Locale; text: string }> {
  const c = await requireCase(caseId);
  const locale: Locale = LOCALES.includes(localeIn as Locale) ? (localeIn as Locale) : (c.locale as Locale);
  const blank = "____________";
  const when = c.incident_at ? new Date(c.incident_at).toISOString().slice(0, 16).replace("T", " ") + " UTC" : blank;
  const text = COMPLAINT[locale]({
    station: STATION[c.country],
    typeWord: TYPE_WORD[locale][c.incident_type],
    name: decrypt(c.owner_name_enc) ?? blank,
    when,
    place: decrypt(c.incident_place_enc) ?? "",
    device: [c.brand, c.model].filter(Boolean).join(" ") || blank,
    imei: decrypt(c.imei_enc) ?? blank,
    phone: decrypt(c.phone_enc) ?? blank,
    contact: decrypt(c.contact_enc) ?? blank,
    channel: CHANNEL[c.country],
    today: new Date().toISOString().slice(0, 10),
    ref: c.ref,
  });
  await audit({ actorType: "owner", actorId: caseId, action: "complaint.generated", caseId, detail: { locale }, ip: ctx.ip });
  return { locale, text };
}
