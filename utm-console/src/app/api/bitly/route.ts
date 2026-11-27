import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const TOKEN = process.env.BITLY_TOKEN ?? "";
const GROUP = process.env.BITLY_GROUP_GUID ?? "";
const DOMAIN = process.env.BITLY_DOMAIN ?? "";
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Only allow-listed team members may spend Bitly quota. Demo mode (no Supabase) is local-only. */
async function authorised(req: Request): Promise<string | null> {
  if (!SB_URL || !SB_ANON) {
    return process.env.NODE_ENV === "production" ? "Set up Supabase before using Bitly in production." : null;
  }
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return "Sign in first.";
  const sb = createClient(SB_URL, SB_ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data, error } = await sb.rpc("is_allowed");
  if (error) return error.message;
  return data === true ? null : "Your email isn't on the team list.";
}

async function bitly(path: string, method: string, body: unknown) {
  const res = await fetch(`https://api-ssl.bitly.com/v4${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const desc = (json.description as string) || (json.message as string) || `Bitly error ${res.status}`;
    throw new Error(desc);
  }
  return json;
}

const isHttpUrl = (s: unknown): s is string => {
  if (typeof s !== "string" || s.length > 2000) return false;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
};

export async function GET() {
  return NextResponse.json({ configured: Boolean(TOKEN) });
}

export async function POST(req: Request) {
  if (!TOKEN) return NextResponse.json({ error: "Bitly isn't set up (BITLY_TOKEN missing)." }, { status: 501 });
  const denied = await authorised(req);
  if (denied) return NextResponse.json({ error: denied }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { action?: string; long_url?: unknown; short_url?: unknown };
  if (!isHttpUrl(body.long_url)) return NextResponse.json({ error: "long_url must be an http(s) URL." }, { status: 400 });

  try {
    if (body.action === "repoint") {
      if (typeof body.short_url !== "string") return NextResponse.json({ error: "short_url missing." }, { status: 400 });
      const id = body.short_url.replace(/^https?:\/\//, "").replace(/\/$/, "");
      const json = await bitly(`/bitlinks/${encodeURIComponent(id).replace("%2F", "/")}`, "PATCH", { long_url: body.long_url });
      return NextResponse.json({ short_url: (json.link as string) ?? body.short_url, long_url: json.long_url ?? body.long_url });
    }
    const payload: Record<string, string> = { long_url: body.long_url };
    if (GROUP) payload.group_guid = GROUP;
    if (DOMAIN) payload.domain = DOMAIN;
    const json = await bitly("/shorten", "POST", payload);
    return NextResponse.json({ short_url: json.link });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
