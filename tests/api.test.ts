import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetRateLimits } from "@/lib/ratelimit";
import { verifyAuditChain } from "@/lib/audit";
import { queryOne } from "@/lib/db";
import { DEMO_PASSWORD, DEMO_STAFF } from "@/lib/seed";
import { POST as createCaseRoute } from "@/app/api/cases/route";
import { POST as openCaseRoute } from "@/app/api/cases/open/route";
import { DELETE as eraseRoute, GET as caseRoute } from "@/app/api/case/route";
import { POST as caseAction } from "@/app/api/case/actions/route";
import { POST as vaultRoute } from "@/app/api/vault/route";
import { POST as imeiRoute } from "@/app/api/imei/check/route";
import { GET as metaRoute } from "@/app/api/meta/route";
import { GET as healthRoute } from "@/app/api/health/route";
import { DELETE as logoutRoute, GET as meRoute, POST as loginRoute } from "@/app/api/staff/session/route";
import { GET as queueRoute } from "@/app/api/staff/cases/route";
import { GET as staffCaseRoute, POST as staffCaseAction } from "@/app/api/staff/cases/[id]/route";
import { GET as auditRoute } from "@/app/api/staff/audit/route";
import { freshDb, imeiN } from "./helpers";

/* eslint-disable @typescript-eslint/no-explicit-any */
const BASE = "http://localhost:3000";
let ipN = 0;

function req(path: string, opts: { method?: string; body?: unknown; cookie?: string; origin?: string | null; ip?: string; raw?: string } = {}): Request {
  const headers: Record<string, string> = { host: "localhost:3000", "x-forwarded-for": opts.ip ?? `10.9.0.${++ipN}` };
  if (opts.cookie) headers.cookie = opts.cookie;
  const method = opts.method ?? (opts.body !== undefined || opts.raw !== undefined ? "POST" : "GET");
  if (method !== "GET" && opts.origin !== null) headers.origin = opts.origin ?? BASE;
  const body = opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined);
  if (body !== undefined) headers["content-type"] = "application/json";
  return new Request(BASE + path, { method, headers, body });
}

const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0];
const noCtx = {} as any;
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });

async function signIn(email: string): Promise<string> {
  const res = await loginRoute(req("/api/staff/session", { body: { email, password: DEMO_PASSWORD } }), noCtx);
  expect(res.status).toBe(200);
  return cookieOf(res);
}

beforeAll(() => freshDb(true)); // with demo seed
beforeEach(() => resetRateLimits());

describe("demo seed", () => {
  it("loads fictional staff and cases, with a valid audit chain", async () => {
    const staff = await queryOne("SELECT COUNT(*)::int AS n FROM staff_users");
    expect(staff!.n).toBe(DEMO_STAFF.length);
    const cases = await queryOne("SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE status = 'disputed')::int AS d, COUNT(*) FILTER (WHERE status = 'referred')::int AS r FROM cases");
    expect(cases).toEqual({ n: 5, d: 2, r: 1 });
    const real = await queryOne("SELECT COUNT(*)::int AS n FROM case_events WHERE kind IN ('sim_change','network_attach','cross_border','registry_blocked') AND simulated = false");
    expect(real!.n).toBe(0); // every network/registry event in the system is flagged simulated
    expect((await verifyAuditChain()).ok).toBe(true);
  });
});

describe("public endpoints", () => {
  it("GET /api/health", async () => {
    const res = await healthRoute(req("/api/health"), noCtx);
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j).toMatchObject({ ok: true, mode: "demo", db: "pglite-memory" });
  });

  it("GET /api/meta lists integrations and labels the demo", async () => {
    const j = await (await metaRoute(req("/api/meta"), noCtx)).json();
    expect(j.demo).toBe(true);
    expect(j.integrations.length).toBeGreaterThan(8);
    expect(j.demoAccounts).toHaveLength(DEMO_STAFF.length);
  });

  it("GET /api/meta exposes no demo sign-ins in production mode", async () => {
    process.env.TRACE_MODE = "production";
    process.env.TRACE_SECRET = "y".repeat(40);
    try {
      const j = await (await metaRoute(req("/api/meta"), noCtx)).json();
      expect(j.demo).toBe(false);
      expect(j.demoAccounts).toEqual([]);
      expect(j.demoPassword).toBeNull();
    } finally {
      process.env.TRACE_MODE = "demo";
      delete process.env.TRACE_SECRET;
    }
  });

  it("POST /api/imei/check validates format only and is rate-limited", async () => {
    const good = await (await imeiRoute(req("/api/imei/check", { body: { imei: "490154203237518" } }), noCtx)).json();
    expect(good).toEqual({ ok: true, problem: null, tac: "49015420" });
    const bad = await (await imeiRoute(req("/api/imei/check", { body: { imei: "490154203237519" } }), noCtx)).json();
    expect(bad).toMatchObject({ ok: false, problem: "bad_checksum" });
    let last = 200;
    for (let i = 0; i < 61; i++) last = (await imeiRoute(req("/api/imei/check", { body: { imei: "1" }, ip: "198.51.100.50" }), noCtx)).status;
    expect(last).toBe(429);
  });
});

describe("owner HTTP flow", () => {
  it("create -> view -> verify -> act -> erase, all bound to an HttpOnly session cookie", async () => {
    const res = await createCaseRoute(req("/api/cases", { body: { country: "IN", incidentType: "stolen", platform: "android", imei: imeiN(500), contact: "http.owner@owner.test", consent: true } }), noCtx);
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.ref).toMatch(/^JT-IN-/);
    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Strict/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const cookie = cookieOf(res);

    const view = await (await caseRoute(req("/api/case?locale=hi", { cookie }), noCtx)).json();
    expect(view.ref).toBe(created.ref);
    expect(view.steps[0].title).toMatch(/[ऀ-ॿ]/);

    const otp = await (await caseAction(req("/api/case/actions", { cookie, body: { action: "otp_request" } }), noCtx)).json();
    const ok = await (await caseAction(req("/api/case/actions", { cookie, body: { action: "otp_confirm", code: otp.demoCode } }), noCtx)).json();
    expect(ok).toMatchObject({ verified: true, level: 1 });

    const step = await caseAction(req("/api/case/actions", { cookie, body: { action: "step", key: "sim_block", done: true } }), noCtx);
    expect(step.status).toBe(200);
    const doc = await (await caseAction(req("/api/case/actions", { cookie, body: { action: "complaint", locale: "en" } }), noCtx)).json();
    expect(doc.text).toContain(created.ref);
    expect((await caseAction(req("/api/case/actions", { cookie, body: { action: "nope" } }), noCtx)).status).toBe(400);

    // Re-open elsewhere with reference + key.
    const reopened = await openCaseRoute(req("/api/cases/open", { body: { ref: created.ref, accessKey: created.accessKey } }), noCtx);
    expect(reopened.status).toBe(200);
    expect(cookieOf(reopened)).toMatch(/^jt_owner=/);

    const erased = await eraseRoute(req("/api/case", { method: "DELETE", cookie }), noCtx);
    expect(erased.status).toBe(200);
    expect((await caseRoute(req("/api/case", { cookie }), noCtx)).status).toBe(404);
  });

  it("refuses requests without a session, with a forged session, or from another origin", async () => {
    expect((await caseRoute(req("/api/case"), noCtx)).status).toBe(401);
    expect((await caseRoute(req("/api/case", { cookie: "jt_owner=eyJhbGciOiJIUzI1NiJ9.eyJjaWQiOiJ4In0.forged" }), noCtx)).status).toBe(401);
    expect((await caseRoute(req("/api/case", { cookie: "jt_owner=eyJhbGciOiJub25lIn0.eyJjaWQiOiJ4In0." }), noCtx)).status).toBe(401); // alg=none
    const evil = await createCaseRoute(req("/api/cases", { origin: "https://evil.example", body: { country: "IN", incidentType: "lost", contact: "x@owner.test", consent: true } }), noCtx);
    expect(evil.status).toBe(403);
    expect((await evil.json()).error).toBe("bad_origin");
  });

  it("a staff cookie is not an owner cookie, and vice versa", async () => {
    const staffCookie = await signIn("officer.in@demo.jtrace.example");
    const asOwner = staffCookie.replace("jt_staff=", "jt_owner=");
    expect((await caseRoute(req("/api/case", { cookie: asOwner }), noCtx)).status).toBe(401);
    const res = await createCaseRoute(req("/api/cases", { body: { country: "IN", incidentType: "lost", contact: "swap@owner.test", consent: true } }), noCtx);
    const asStaff = cookieOf(res).replace("jt_owner=", "jt_staff=");
    expect((await queueRoute(req("/api/staff/cases", { cookie: asStaff }), noCtx)).status).toBe(401);
  });

  it("returns clean 4xx errors for bad input and never a stack trace", async () => {
    const badJson = await createCaseRoute(req("/api/cases", { raw: "{not json" }), noCtx);
    expect(badJson.status).toBe(400);
    expect(await badJson.json()).toEqual({ error: "invalid_json" });
    const arr = await createCaseRoute(req("/api/cases", { raw: "[1,2]" }), noCtx);
    expect(arr.status).toBe(400);
    const huge = await createCaseRoute(req("/api/cases", { raw: JSON.stringify({ x: "a".repeat(30_000) }) }), noCtx);
    expect(huge.status).toBe(413);
    const invalid = await createCaseRoute(req("/api/cases", { body: { country: "IN", incidentType: "lost", contact: "a@owner.test", imei: "123", consent: true } }), noCtx);
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: "invalid_input", field: "imei", problem: "wrong_length" });
    const sqli = await openCaseRoute(req("/api/cases/open", { body: { ref: "JT-IN-' OR '1'='1", accessKey: "' OR 1=1 --" } }), noCtx);
    expect(sqli.status).toBe(404);
  });

  it("answers 429 with Retry-After when a limit is hit", async () => {
    let res!: Response;
    for (let i = 0; i < 6; i++) {
      res = await createCaseRoute(req("/api/cases", { ip: "198.51.100.77", body: { country: "IN", incidentType: "lost", contact: "rl2@owner.test", consent: true } }), noCtx);
    }
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("vault lookups look the same over HTTP whether or not the number is known", async () => {
    const reg = await (await vaultRoute(req("/api/vault", { body: { action: "register", country: "NP", imei: imeiN(501), phone: "9801112223", recoveryContact: "np.vault@owner.test", consent: true } }), noCtx)).json();
    await vaultRoute(req("/api/vault", { body: { action: "register_confirm", requestId: reg.requestId, code: reg.demoCode } }), noCtx);
    const known = await vaultRoute(req("/api/vault", { body: { action: "recover", country: "NP", phone: "9801112223" } }), noCtx);
    const unknown = await vaultRoute(req("/api/vault", { body: { action: "recover", country: "NP", phone: "9809998887" } }), noCtx);
    expect(known.status).toBe(unknown.status);
    const [k, u] = [await known.json(), await unknown.json()];
    expect(Object.keys(k).sort()).toEqual(Object.keys(u).sort());
    const got = await (await vaultRoute(req("/api/vault", { body: { action: "recover_confirm", requestId: k.requestId, code: k.demoCode } }), noCtx)).json();
    expect(got.imei).toBe(imeiN(501));
  });
});

describe("staff HTTP flow", () => {
  it("requires a session everywhere", async () => {
    expect((await queueRoute(req("/api/staff/cases"), noCtx)).status).toBe(401);
    expect((await meRoute(req("/api/staff/session"), noCtx)).status).toBe(401);
    expect((await auditRoute(req("/api/staff/audit"), noCtx)).status).toBe(401);
    expect((await staffCaseRoute(req("/api/staff/cases/x"), idCtx("x"))).status).toBe(401);
  });

  it("refuses the unverified demo account and wrong passwords with the same answer", async () => {
    const a = await loginRoute(req("/api/staff/session", { body: { email: "pending.officer@demo.jtrace.example", password: DEMO_PASSWORD } }), noCtx);
    const b = await loginRoute(req("/api/staff/session", { body: { email: "officer.in@demo.jtrace.example", password: "wrong" } }), noCtx);
    expect([a.status, b.status]).toEqual([401, 401]);
    expect(await a.json()).toEqual(await b.json());
  });

  it("India officer works the seeded stolen-phone case end to end", async () => {
    const cookie = await signIn("officer.in@demo.jtrace.example");
    const queue = await (await queueRoute(req("/api/staff/cases", { cookie }), noCtx)).json();
    expect(queue.staff.jurisdiction).toBe("IN");
    expect(queue.cases.every((c: any) => c.country === "IN")).toBe(true);
    const top = queue.cases[0];
    expect(top.crossBorder).toBe(true); // highest priority: stolen + SIM change + seen abroad
    expect(top.referral).toEqual([{ to: "NP", status: "pending" }]);

    const detail = await (await staffCaseRoute(req(`/api/staff/cases/${top.id}`, { cookie }), idCtx(top.id))).json();
    expect(detail.detail.events.filter((e: any) => e.simulated).length).toBeGreaterThanOrEqual(4);
    expect(detail.detail.imeiMasked).toContain("•");

    const noBasis = await staffCaseAction(req(`/api/staff/cases/${top.id}`, { cookie, body: { action: "reveal", legalBasis: "" } }), idCtx(top.id));
    expect(noBasis.status).toBe(400);
    const pii = await (await staffCaseAction(req(`/api/staff/cases/${top.id}`, { cookie, body: { action: "reveal", legalBasis: "DEMO FIR 0421/2026 investigation" } }), idCtx(top.id))).json();
    expect(pii.ownerName).toContain("(demo)");

    expect((await auditRoute(req("/api/staff/audit", { cookie }), noCtx)).status).toBe(403);
  });

  it("Nepal officer sees the referred Indian case as a summary only; UAE officer does not see it", async () => {
    const inCookie = await signIn("officer.in@demo.jtrace.example");
    const inQueue = await (await queueRoute(req("/api/staff/cases", { cookie: inCookie }), noCtx)).json();
    const referred = inQueue.cases.find((c: any) => c.status === "referred");

    const np = await signIn("officer.np@demo.jtrace.example");
    const npView = await (await staffCaseRoute(req(`/api/staff/cases/${referred.id}`, { cookie: np }), idCtx(referred.id))).json();
    expect(npView.scope).toBe("summary");
    expect(npView.detail).toBeNull();
    expect(npView.permissions.decideReferral).toBe(true);

    const ae = await signIn("officer.ae@demo.jtrace.example");
    expect((await staffCaseRoute(req(`/api/staff/cases/${referred.id}`, { cookie: ae }), idCtx(referred.id))).status).toBe(404);
  });

  it("auditor reads a verified audit chain; sign-out clears the session", async () => {
    const cookie = await signIn("auditor@demo.jtrace.example");
    const audit = await (await auditRoute(req("/api/staff/audit", { cookie }), noCtx)).json();
    expect(audit.chain.ok).toBe(true);
    expect(audit.entries.length).toBeGreaterThan(10);
    const out = await logoutRoute(req("/api/staff/session", { method: "DELETE", cookie }), noCtx);
    expect(out.headers.get("set-cookie")).toMatch(/Max-Age=0/);
  });

  it("a disabled officer loses access immediately, even with a still-valid session", async () => {
    const cookie = await signIn("officer.ae@demo.jtrace.example");
    expect((await queueRoute(req("/api/staff/cases", { cookie }), noCtx)).status).toBe(200);
    await queryOne("UPDATE staff_users SET disabled = true WHERE email = 'officer.ae@demo.jtrace.example' RETURNING id");
    expect((await queueRoute(req("/api/staff/cases", { cookie }), noCtx)).status).toBe(401);
  });
});
