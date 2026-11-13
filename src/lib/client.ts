"use client";

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    public extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

/** Same-origin JSON call. Sessions live in HttpOnly cookies, so there is nothing to attach by hand. */
export async function api<T = Record<string, unknown>>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: opts.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const { error, ...extra } = data as { error?: string };
    throw new ApiError(error ?? "internal_error", res.status, extra);
  }
  return data as T;
}

type T = (key: string, vars?: Record<string, string | number>) => string;

/** Turn an API error into a sentence a non-technical person can act on. */
export function errorText(t: T, e: unknown): string {
  if (!(e instanceof ApiError)) return t("common.error");
  switch (e.code) {
    case "rate_limited":
      return t("common.rate", { n: Math.max(1, Math.ceil(Number(e.extra.retryAfterSec ?? 60) / 60)) });
    case "consent_required":
      return t("err.consent_required");
    case "otp_invalid":
      return t("otp.invalid");
    case "otp_locked":
      return t("otp.locked");
    case "case_not_found":
      return t("home.open.fail");
    case "erasure_restricted":
      return t("finish.erase.restricted");
    case "invalid_input": {
      const field = String(e.extra.field ?? "");
      const problem = String(e.extra.problem ?? "");
      if (problem === "same_as_lost_phone" || problem === "same_as_device_phone") return t("err.same_as_lost_phone");
      if (field === "imei" && problem) return t(`imei.${problem}`);
      return t("common.check", { field });
    }
    default:
      return t("common.error");
  }
}

export async function sha256File(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
