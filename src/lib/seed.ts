import { randomUUID } from "node:crypto";
import { query, queryOne } from "./db";
import { encrypt, hashPassword, hmac } from "./crypto";
import { buildImei } from "./imei";
import { resetRateLimits } from "./ratelimit";
import type { Staff } from "./rbac";
import { addEvidence, confirmContactOtp, createCase, requestContactOtp, setStep } from "./services/owner";
import { createReferral, submitNetworkEvent } from "./services/staff";

/**
 * DEMO DATA ONLY. Everything below is fictional: the people, the handsets,
 * the agencies' accounts and every "network" event. It is loaded only when
 * TRACE_MODE is not "production".
 */
export const DEMO_PASSWORD = "trace-demo-2026";

export const DEMO_STAFF: (Omit<Staff, "id" | "disabled"> & { note: string })[] = [
  { email: "officer.in@demo.jtrace.example", name: "Insp. A. Sharma (demo)", role: "police", agency: "Demo State Police — Cyber Cell, India", jurisdiction: "IN", verified: true, note: "Police officer, India" },
  { email: "officer.np@demo.jtrace.example", name: "Insp. S. Thapa (demo)", role: "police", agency: "Demo Police — Cyber Bureau, Nepal", jurisdiction: "NP", verified: true, note: "Police officer, Nepal" },
  { email: "officer.ae@demo.jtrace.example", name: "Lt. R. Al Mansoori (demo)", role: "police", agency: "Demo Police — UAE", jurisdiction: "AE", verified: true, note: "Police officer, UAE" },
  { email: "telecom.in@demo.jtrace.example", name: "Nodal Officer (demo)", role: "telecom", agency: "Demo Telecom Operator, India", jurisdiction: "IN", verified: true, note: "Telecom partner, India (no access to owner identity)" },
  { email: "admin@demo.jtrace.example", name: "Platform Admin (demo)", role: "admin", agency: "J TRACE", jurisdiction: "ALL", verified: true, note: "Platform admin (metadata only, runs simulations)" },
  { email: "auditor@demo.jtrace.example", name: "Independent Auditor (demo)", role: "auditor", agency: "J TRACE Oversight", jurisdiction: "ALL", verified: true, note: "Auditor (read-only audit trail)" },
  { email: "pending.officer@demo.jtrace.example", name: "Unverified Account (demo)", role: "police", agency: "Unverified", jurisdiction: "IN", verified: false, note: "Not yet verified — sign-in is refused" },
];

export const DEMO_IMEI = {
  stolenDelhi: buildImei("35693803564380"),
  lostKathmandu: buildImei("35320911223344"),
  lostDubai: buildImei("86754203998877"),
  disputed: buildImei("35847610112233"),
};

async function staffByEmail(email: string): Promise<Staff> {
  return (await queryOne<Staff>("SELECT * FROM staff_users WHERE email = $1", [email]))!;
}

export async function seedDemoData(): Promise<void> {
  const existing = await queryOne<{ n: number }>("SELECT COUNT(*)::int AS n FROM staff_users");
  if ((existing?.n ?? 0) > 0) return;

  const pw = hashPassword(DEMO_PASSWORD);
  for (const s of DEMO_STAFF) {
    await query(
      "INSERT INTO staff_users (id, email, name, password_hash, role, agency, jurisdiction, verified) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8)",
      [randomUUID(), s.email, s.name, pw, s.role, s.agency, s.jurisdiction, s.verified],
    );
  }
  const officerIn = await staffByEmail("officer.in@demo.jtrace.example");
  const telecomIn = await staffByEmail("telecom.in@demo.jtrace.example");
  const admin = await staffByEmail("admin@demo.jtrace.example");

  // A handset placed in the vault a month before it was stolen.
  const vaultContact = "asha.demo@example.org";
  await query(
    `INSERT INTO devices (id, imei_hmac, imei_enc, phone_hmac, country, brand, model, recovery_contact_enc, recovery_contact_hmac, contact_verified, consent_at, created_at)
     VALUES ($1::uuid, $2, $3, $4, 'IN', 'Samsung', 'Galaxy A55', $5, $6, true, now() - interval '30 days', now() - interval '30 days')`,
    [randomUUID(), hmac(DEMO_IMEI.stolenDelhi, "imei"), encrypt(DEMO_IMEI.stolenDelhi), hmac("+919812345670", "phone"), encrypt(vaultContact), hmac(vaultContact, "contact")],
  );

  // Case A — stolen in Delhi, ownership established through the vault, later seen in Nepal.
  const a = await createCase(
    { country: "IN", incidentType: "stolen", incidentAt: new Date(Date.now() - 20 * 3600_000).toISOString(), incidentPlace: "Metro station, New Delhi (demo)", platform: "android", brand: "Samsung", model: "Galaxy A55", phone: "9812345670", imei: DEMO_IMEI.stolenDelhi, ownerName: "Asha Verma (demo)", contact: vaultContact, locale: "hi", consent: true },
    { ip: "seed-a" },
  );
  const otpA = await requestContactOtp(a.id, { ip: "seed-a" });
  await confirmContactOtp(a.id, otpA.demoCode!, { ip: "seed-a" });
  await addEvidence(a.id, { kind: "police_report", reference: "DEMO-FIR-0421/2026" });
  await setStep(a.id, "sim_block", true);
  await setStep(a.id, "police", true);
  await setStep(a.id, "block_imei", true, { requestId: "DEMO-CEIR-778201" });
  await submitNetworkEvent(telecomIn, a.id, { kind: "registry_blocked", country: "IN" });
  await submitNetworkEvent(telecomIn, a.id, { kind: "sim_change", country: "IN", operator: "Airtel" });
  await submitNetworkEvent(admin, a.id, { kind: "network_attach", country: "NP", operator: "Ncell" });
  await createReferral(officerIn, a.id, {
    to: "NP",
    reason: "Handset reported active on a network in Nepal (simulated event). Requesting assistance to locate and seize.",
    legalBasis: "DEMO — police-to-police cooperation request ref. DEMO/IN-NP/2026/017",
  });

  // Case B — lost in Kathmandu, contact verified, complaint declared but not yet reviewed.
  const b = await createCase(
    { country: "NP", incidentType: "lost", incidentAt: new Date(Date.now() - 3 * 86_400_000).toISOString(), incidentPlace: "New Road, Kathmandu (demo)", platform: "ios", brand: "Apple", model: "iPhone 14", phone: "9801234567", imei: DEMO_IMEI.lostKathmandu, ownerName: "Bikash Gurung (demo)", contact: "bikash.demo@example.org", locale: "ne", consent: true },
    { ip: "seed-b" },
  );
  const otpB = await requestContactOtp(b.id, { ip: "seed-b" });
  await confirmContactOtp(b.id, otpB.demoCode!, { ip: "seed-b" });
  await addEvidence(b.id, { kind: "police_report", reference: "DEMO-NP-2083-118" });

  // Case C — lost in Dubai, just created.
  await createCase(
    { country: "AE", incidentType: "lost", incidentAt: new Date(Date.now() - 5 * 3600_000).toISOString(), incidentPlace: "Deira, Dubai (demo)", platform: "android", brand: "Xiaomi", model: "Redmi Note 13", phone: "501234567", imei: DEMO_IMEI.lostDubai, ownerName: "Rahul Nair (demo)", contact: "rahul.demo@example.org", locale: "en", consent: true },
    { ip: "seed-c" },
  );

  // Cases D & E — two different people claim the same handset: both are frozen.
  await createCase(
    { country: "IN", incidentType: "stolen", platform: "android", brand: "OnePlus", model: "Nord 4", imei: DEMO_IMEI.disputed, ownerName: "Claimant One (demo)", contact: "claimant.one@example.org", locale: "en", consent: true },
    { ip: "seed-d" },
  );
  await createCase(
    { country: "IN", incidentType: "lost", platform: "android", brand: "OnePlus", model: "Nord 4", imei: DEMO_IMEI.disputed, ownerName: "Claimant Two (demo)", contact: "claimant.two@example.org", locale: "en", consent: true },
    { ip: "seed-e" },
  );

  // Seeding must not eat into real visitors' rate-limit budgets.
  resetRateLimits();
}
