/**
 * IMEI utilities (3GPP TS 23.003 §6.2).
 * IMEI = TAC (8 digits) + serial number (6 digits) + Luhn check digit (1 digit).
 * Everything here is local arithmetic — no registry is queried.
 */

export function normalizeImei(input: string): string {
  return (input ?? "").replace(/[\s\-./]/g, "");
}

/** Luhn check digit for a 14-digit IMEI body. */
export function luhnCheckDigit(body14: string): number {
  if (!/^\d{14}$/.test(body14)) throw new Error("IMEI body must be 14 digits");
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let d = body14.charCodeAt(i) - 48;
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10;
}

export type ImeiProblem = "empty" | "not_digits" | "wrong_length" | "bad_checksum" | "placeholder";

export interface ImeiCheck {
  ok: boolean;
  imei?: string;
  tac?: string;
  problem?: ImeiProblem;
}

export function checkImei(input: string): ImeiCheck {
  const v = normalizeImei(input);
  if (!v) return { ok: false, problem: "empty" };
  if (!/^\d+$/.test(v)) return { ok: false, problem: "not_digits" };
  // 16 digits = IMEISV (software version suffix, no check digit) — cannot be verified, ask for the 15-digit IMEI.
  if (v.length !== 15) return { ok: false, problem: "wrong_length" };
  // 000000000000000, 111111111111111 … are common fake/placeholder values on cloned handsets.
  if (/^(\d)\1{14}$/.test(v) || v.startsWith("00000000")) return { ok: false, problem: "placeholder" };
  if (luhnCheckDigit(v.slice(0, 14)) !== Number(v[14])) return { ok: false, problem: "bad_checksum" };
  return { ok: true, imei: v, tac: v.slice(0, 8) };
}

export function isValidImei(input: string): boolean {
  return checkImei(input).ok;
}

/** 35•••••••••1234 — enough for an owner to recognise, useless for lookup. */
export function maskImei(imei: string): string {
  const v = normalizeImei(imei);
  if (v.length < 6) return "•".repeat(v.length);
  return `${v.slice(0, 2)}${"•".repeat(v.length - 6)}${v.slice(-4)}`;
}

/** Build a syntactically valid IMEI from a 14-digit body (used by seeds/tests). */
export function buildImei(body14: string): string {
  return body14 + String(luhnCheckDigit(body14));
}
