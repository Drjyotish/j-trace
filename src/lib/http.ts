import { SignJWT, jwtVerify } from "jose";
import { deriveKey } from "./crypto";
import { LIMITS } from "./config";
import { AppError, unauthorized } from "./errors";
import type { Staff } from "./rbac";
import { getStaff } from "./services/staff";
import type { Ctx } from "./services/common";

const OWNER_COOKIE = "jt_owner";
const STAFF_COOKIE = "jt_staff";

function key(kind: "owner" | "staff") {
  return new Uint8Array(deriveKey(`session:${kind}`));
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : req.headers.get("x-real-ip")) || "local";
}

export function ctxOf(req: Request): Ctx {
  return { ip: clientIp(req) };
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function cookie(name: string, value: string, maxAgeSec: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secure}`;
}

export async function ownerCookie(caseId: string): Promise<string> {
  const token = await new SignJWT({ cid: caseId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${LIMITS.ownerSessionHours}h`)
    .sign(key("owner"));
  return cookie(OWNER_COOKIE, token, LIMITS.ownerSessionHours * 3600);
}

export async function staffCookie(staffId: string): Promise<string> {
  const token = await new SignJWT({ sid: staffId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${LIMITS.staffSessionHours}h`)
    .sign(key("staff"));
  return cookie(STAFF_COOKIE, token, LIMITS.staffSessionHours * 3600);
}

export const clearOwnerCookie = () => cookie(OWNER_COOKIE, "", 0);
export const clearStaffCookie = () => cookie(STAFF_COOKIE, "", 0);

/** The case this browser is allowed to act on, or 401. */
export async function requireOwner(req: Request): Promise<string> {
  const token = readCookie(req, OWNER_COOKIE);
  if (!token) throw unauthorized();
  try {
    const { payload } = await jwtVerify(token, key("owner"), { algorithms: ["HS256"] });
    if (typeof payload.cid !== "string") throw unauthorized();
    return payload.cid;
  } catch {
    throw unauthorized();
  }
}

/** The signed-in staff member, re-read from the database on every request so a disabled account loses access at once. */
export async function requireStaff(req: Request): Promise<Staff> {
  const token = readCookie(req, STAFF_COOKIE);
  if (!token) throw unauthorized();
  let sid: unknown;
  try {
    ({ payload: { sid } } = await jwtVerify(token, key("staff"), { algorithms: ["HS256"] }));
  } catch {
    throw unauthorized();
  }
  const staff = typeof sid === "string" ? await getStaff(sid) : null;
  if (!staff) throw unauthorized();
  return staff;
}

/**
 * CSRF defence in depth (cookies are already SameSite=Strict): a state-changing
 * request that carries an Origin header must come from this site.
 */
function assertSameOrigin(req: Request): void {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AppError("bad_origin", 403);
  }
  if (originHost !== host) throw new AppError("bad_origin", 403);
}

export function json(data: unknown, init: { status?: number; cookies?: string[] } = {}): Response {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  for (const c of init.cookies ?? []) headers.append("set-cookie", c);
  return new Response(JSON.stringify(data), { status: init.status ?? 200, headers });
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  const text = await req.text();
  if (text.length > 20_000) throw new AppError("payload_too_large", 413);
  try {
    const parsed = text ? JSON.parse(text) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    return parsed as T;
  } catch {
    throw new AppError("invalid_json", 400);
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wrap a route handler: origin check, typed errors -> JSON, nothing internal leaks. */
export function route<C = any>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      assertSameOrigin(req);
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof AppError) {
        const headers: Record<string, string> = {};
        if (e.status === 429 && typeof e.extra.retryAfterSec === "number") headers["retry-after"] = String(e.extra.retryAfterSec);
        const res = json({ error: e.code, ...e.extra }, { status: e.status });
        for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
        return res;
      }
      console.error("[j-trace] unhandled error", e);
      return json({ error: "internal_error" }, { status: 500 });
    }
  };
}
