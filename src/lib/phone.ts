import type { Country } from "./config";

const RULES: Record<Country, { cc: string; national: RegExp }> = {
  // India: 10 digits, mobile numbers start 6-9.
  IN: { cc: "91", national: /^[6-9]\d{9}$/ },
  // Nepal: 10 digits, mobile numbers start 96/97/98.
  NP: { cc: "977", national: /^9[678]\d{8}$/ },
  // UAE: 9 digits, mobile numbers start 5.
  AE: { cc: "971", national: /^5\d{8}$/ },
};

/** Normalise a mobile number to E.164 for the given country. Returns null if it is not a plausible mobile number. */
export function normalizePhone(input: string, country: Country): string | null {
  const rule = RULES[country];
  if (!rule) return null;
  let digits = (input ?? "").replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith(rule.cc) && digits.length > 10) digits = digits.slice(rule.cc.length);
  digits = digits.replace(/^0+/, "");
  if (!rule.national.test(digits)) return null;
  return `+${rule.cc}${digits}`;
}

export function maskPhone(e164: string): string {
  if (e164.length < 7) return "•".repeat(e164.length);
  return `${e164.slice(0, e164.length - 7)}•••••${e164.slice(-2)}`;
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

/** A contact is either an email address or a mobile number in the case's country. */
export function normalizeContact(input: string, country: Country): { kind: "email" | "phone"; value: string } | null {
  const v = (input ?? "").trim();
  if (v.includes("@")) return EMAIL.test(v) ? { kind: "email", value: v.toLowerCase() } : null;
  const p = normalizePhone(v, country);
  return p ? { kind: "phone", value: p } : null;
}

export function maskContact(value: string): string {
  if (value.includes("@")) {
    const [user, domain] = value.split("@");
    return `${user.slice(0, 1)}•••@${domain}`;
  }
  return maskPhone(value);
}
