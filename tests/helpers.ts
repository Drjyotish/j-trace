import { randomUUID } from "node:crypto";
import { query, resetDb } from "@/lib/db";
import { hashPassword } from "@/lib/crypto";
import { buildImei } from "@/lib/imei";
import { resetRateLimits } from "@/lib/ratelimit";
import type { Staff } from "@/lib/rbac";
import { confirmContactOtp, createCase, requestContactOtp, type CreateCaseInput } from "@/lib/services/owner";

export const TEST_PASSWORD = "pw-test-123456";

/** Start the test file from an empty in-memory Postgres. */
export async function freshDb(seed = false): Promise<void> {
  process.env.TRACE_SEED = seed ? "on" : "off";
  await resetDb();
  resetRateLimits();
}

let counter = 0;
export const nextIp = () => `10.1.${Math.floor(++counter / 250)}.${counter % 250}`;
export const imeiN = (n: number) => buildImei(String(35_000_000_000_000 + n));

export async function makeStaff(over: Partial<Staff> = {}): Promise<Staff> {
  const s: Staff = {
    id: randomUUID(),
    email: `${randomUUID().slice(0, 8)}@agency.test`,
    name: "Test Officer",
    role: "police",
    agency: "Test Police",
    jurisdiction: "IN",
    verified: true,
    disabled: false,
    ...over,
  };
  await query(
    "INSERT INTO staff_users (id, email, name, password_hash, role, agency, jurisdiction, verified, disabled) VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9)",
    [s.id, s.email, s.name, hashPassword(TEST_PASSWORD), s.role, s.agency, s.jurisdiction, s.verified, s.disabled],
  );
  return s;
}

export async function newCase(over: Partial<CreateCaseInput> = {}) {
  return createCase(
    {
      country: "IN",
      incidentType: "stolen",
      platform: "android",
      brand: "TestBrand",
      model: "T1",
      contact: `${randomUUID().slice(0, 8)}@owner.test`,
      ownerName: "Test Owner",
      consent: true,
      ...over,
    },
    { ip: nextIp() },
  );
}

export async function verifyContact(caseId: string) {
  const r = await requestContactOtp(caseId, { ip: nextIp() });
  return confirmContactOtp(caseId, r.demoCode!, { ip: nextIp() });
}

/** Run a promise and return the AppError code it rejects with (or "no_error"). */
export async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "no_error";
  } catch (e) {
    return (e as { code?: string }).code ?? `unexpected:${(e as Error).message}`;
  }
}
