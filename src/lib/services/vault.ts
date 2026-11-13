import { randomUUID } from "node:crypto";
import { query, queryOne } from "../db";
import { COUNTRIES, LIMITS, isDemo, type Country } from "../config";
import { decrypt, encrypt, hmac, otpCode, safeEqual } from "../crypto";
import { checkImei } from "../imei";
import { maskContact, normalizeContact, normalizePhone } from "../phone";
import { limitBy } from "../ratelimit";
import { AppError, invalid, tooMany } from "../errors";
import { audit } from "../audit";
import type { Ctx } from "./common";

/**
 * The device vault answers "phone number -> IMEI" the only way an independent
 * service lawfully can: the owner tells us BEFORE the phone is lost, and we
 * give it back only to the recovery contact they chose at that time.
 */

export interface RegisterDeviceInput {
  country: string;
  imei: string;
  phone: string;
  recoveryContact: string;
  brand?: string | null;
  model?: string | null;
  consent: boolean;
}

function otpHash(id: string, code: string): string {
  return hmac(`${id}:${code}`, "key");
}

async function issueOtp(purpose: "vault_register" | "vault_recover", subjectHmac: string, deviceId: string | null): Promise<{ requestId: string; code: string }> {
  const id = randomUUID();
  const code = otpCode();
  if (deviceId) {
    await query("UPDATE otps SET consumed_at = now() WHERE device_id = $1::uuid AND purpose = $2 AND consumed_at IS NULL", [deviceId, purpose]);
    await query(
      `INSERT INTO otps (id, purpose, subject_hmac, code_hash, device_id, expires_at)
       VALUES ($1::uuid, $2, $3, $4, $5::uuid, $6::timestamptz)`,
      [id, purpose, subjectHmac, otpHash(id, code), deviceId, new Date(Date.now() + LIMITS.otpTtlMinutes * 60_000).toISOString()],
    );
  }
  return { requestId: id, code };
}

interface OtpRow {
  id: string;
  code_hash: string;
  attempts: number;
  expires_at: Date;
  device_id: string;
}

async function consumeOtp(requestId: string, code: string, purpose: string): Promise<OtpRow> {
  const valid = /^[0-9a-f-]{36}$/i.test(requestId ?? "");
  const otp = valid
    ? await queryOne<OtpRow>("SELECT id, code_hash, attempts, expires_at, device_id FROM otps WHERE id = $1::uuid AND purpose = $2 AND consumed_at IS NULL", [requestId, purpose])
    : null;
  // Unknown request, expired code and wrong code are indistinguishable to the caller.
  if (!otp || new Date(otp.expires_at).getTime() < Date.now()) throw new AppError("otp_invalid", 400);
  if (otp.attempts >= LIMITS.otpMaxAttempts) throw new AppError("otp_locked", 429);
  await query("UPDATE otps SET attempts = attempts + 1 WHERE id = $1::uuid", [otp.id]);
  if (!/^\d{6}$/.test(code ?? "") || !safeEqual(otpHash(otp.id, code), otp.code_hash)) throw new AppError("otp_invalid", 400);
  await query("UPDATE otps SET consumed_at = now() WHERE id = $1::uuid", [otp.id]);
  return otp;
}

export async function registerDevice(input: RegisterDeviceInput, ctx: Ctx = {}): Promise<{ requestId: string; to: string; demoCode?: string; simulatedDelivery: boolean }> {
  const rl = limitBy("vaultRegisterPerIp", ctx.ip ?? "unknown");
  if (!rl.ok) throw tooMany(rl.retryAfterSec);
  if (!COUNTRIES.includes(input.country as Country)) throw invalid("country");
  const country = input.country as Country;
  if (input.consent !== true) throw new AppError("consent_required", 400);
  const chk = checkImei(input.imei);
  if (!chk.ok) throw invalid("imei", chk.problem);
  const phone = normalizePhone(input.phone, country);
  if (!phone) throw invalid("phone");
  const contact = normalizeContact(input.recoveryContact, country);
  if (!contact) throw invalid("recoveryContact");
  // The recovery contact must survive the loss of this phone.
  if (contact.value === phone) throw invalid("recoveryContact", "same_as_device_phone");

  const imeiH = hmac(chk.imei!, "imei");
  const contactH = hmac(contact.value, "contact");
  const to = maskContact(contact.value);
  const existing = await queryOne<{ id: string; recovery_contact_hmac: string; contact_verified: boolean }>(
    "SELECT id, recovery_contact_hmac, contact_verified FROM devices WHERE imei_hmac = $1",
    [imeiH],
  );

  let deviceId: string | null;
  if (!existing) {
    deviceId = randomUUID();
    await query(
      `INSERT INTO devices (id, imei_hmac, imei_enc, phone_hmac, country, brand, model, recovery_contact_enc, recovery_contact_hmac, consent_at)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, now())`,
      [deviceId, imeiH, encrypt(chk.imei!), hmac(phone, "phone"), country, input.brand?.slice(0, 60) ?? null, input.model?.slice(0, 80) ?? null, encrypt(contact.value), contactH],
    );
  } else if (existing.recovery_contact_hmac === contactH || !existing.contact_verified) {
    // Same person retrying, or an abandoned unverified record: (re)issue a code for it.
    deviceId = existing.id;
    if (!existing.contact_verified) {
      await query(
        "UPDATE devices SET phone_hmac = $2, recovery_contact_enc = $3, recovery_contact_hmac = $4, country = $5, created_at = now() WHERE id = $1::uuid",
        [existing.id, hmac(phone, "phone"), encrypt(contact.value), contactH, country],
      );
    }
  } else {
    // Already registered by someone else. Answer exactly as for a fresh registration
    // (no enumeration), but never overwrite the existing owner's record.
    deviceId = null;
  }

  const { requestId, code } = await issueOtp("vault_register", contactH, deviceId);
  await audit({ actorType: "system", actorId: "vault", action: "vault.register_requested", detail: { accepted: deviceId !== null }, ip: ctx.ip });
  return { requestId, to, demoCode: isDemo() ? code : undefined, simulatedDelivery: true };
}

export async function confirmDevice(requestId: string, code: string, ctx: Ctx = {}): Promise<{ registered: true }> {
  const otp = await consumeOtp(requestId, code, "vault_register");
  await query("UPDATE devices SET contact_verified = true WHERE id = $1::uuid", [otp.device_id]);
  await audit({ actorType: "system", actorId: "vault", action: "vault.registered", detail: { device: otp.device_id }, ip: ctx.ip });
  return { registered: true };
}

/**
 * Step 1 of IMEI recovery. The response is identical whether or not the number
 * is in the vault, so the endpoint cannot be used to test who uses TRACE.
 * The code goes to the recovery contact — never to the missing phone.
 */
export async function requestImeiRecovery(phoneInput: string, countryInput: string, ctx: Ctx = {}): Promise<{ requestId: string; demoCode?: string; simulatedDelivery: boolean }> {
  if (!COUNTRIES.includes(countryInput as Country)) throw invalid("country");
  const phone = normalizePhone(phoneInput, countryInput as Country);
  if (!phone) throw invalid("phone");
  const byIp = limitBy("vaultLookupPerIp", ctx.ip ?? "unknown");
  if (!byIp.ok) throw tooMany(byIp.retryAfterSec);
  const phoneH = hmac(phone, "phone");
  const byPhone = limitBy("vaultLookupPerPhone", phoneH);
  if (!byPhone.ok) throw tooMany(byPhone.retryAfterSec);

  const dev = await queryOne<{ id: string; recovery_contact_hmac: string }>(
    "SELECT id, recovery_contact_hmac FROM devices WHERE phone_hmac = $1 AND contact_verified = true ORDER BY created_at DESC LIMIT 1",
    [phoneH],
  );
  const { requestId, code } = await issueOtp("vault_recover", dev?.recovery_contact_hmac ?? phoneH, dev?.id ?? null);
  await audit({ actorType: "system", actorId: "vault", action: "vault.recover_requested", detail: { found: !!dev }, ip: ctx.ip });
  return { requestId, demoCode: isDemo() ? code : undefined, simulatedDelivery: true };
}

export async function confirmImeiRecovery(requestId: string, code: string, ctx: Ctx = {}): Promise<{ imei: string; brand: string | null; model: string | null; registeredAt: Date }> {
  const otp = await consumeOtp(requestId, code, "vault_recover");
  const dev = await queryOne<{ imei_enc: string; brand: string | null; model: string | null; created_at: Date }>(
    "SELECT imei_enc, brand, model, created_at FROM devices WHERE id = $1::uuid AND contact_verified = true",
    [otp.device_id],
  );
  if (!dev) throw new AppError("otp_invalid", 400);
  await audit({ actorType: "system", actorId: "vault", action: "vault.imei_recovered", detail: { device: otp.device_id }, ip: ctx.ip });
  return { imei: decrypt(dev.imei_enc)!, brand: dev.brand, model: dev.model, registeredAt: dev.created_at };
}
