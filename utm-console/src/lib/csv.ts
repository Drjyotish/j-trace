import Papa from "papaparse";
import type { Sale, SaleKind, SaleStatus } from "./types";
import { utmFromUrl } from "./utm";

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseCsv(text: string): ParsedCsv {
  const res = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  const headers = (res.meta.fields ?? []).filter(Boolean);
  return { headers, rows: res.data };
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  return Papa.unparse({ fields: columns, data: rows.map((r) => columns.map((c) => r[c] ?? "")) });
}

/** Fields a sales / leads export can map into. */
export const SALE_FIELDS = [
  { key: "external_id", label: "Order / response ID", guess: /^(order|transaction|txn|payment|invoice|response|submission)[\s_-]*(id|no|number)?$|^id$/i },
  { key: "name", label: "Name", guess: /^(full[\s_-]*)?name$|customer[\s_-]*name|buyer[\s_-]*name|^your name/i },
  { key: "email", label: "Email", guess: /e-?mail/i },
  { key: "phone", label: "Phone", guess: /phone|mobile|whats ?app|contact[\s_-]*(no|number)/i },
  { key: "country", label: "Country", guess: /^country/i },
  { key: "product", label: "Product / offer", guess: /product|offer|course|item|package|plan/i },
  { key: "amount", label: "Amount paid (incl. GST)", guess: /amount|total|paid|price|revenue/i },
  { key: "coupon", label: "Coupon", guess: /coupon|promo|discount[\s_-]*code/i },
  { key: "discount", label: "Discount amount", guess: /^discount([\s_-]*(amount|value))?$/i },
  { key: "status", label: "Payment status", guess: /status|state/i },
  { key: "occurred_at", label: "Date / time", guess: /date|time|created|timestamp|submitted/i },
  { key: "utm_source", label: "utm_source", guess: /utm[\s_-]*source/i },
  { key: "utm_medium", label: "utm_medium", guess: /utm[\s_-]*medium/i },
  { key: "utm_campaign", label: "utm_campaign", guess: /utm[\s_-]*campaign/i },
  { key: "utm_content", label: "utm_content", guess: /utm[\s_-]*content/i },
  { key: "utm_term", label: "utm_term", guess: /utm[\s_-]*term/i },
  { key: "landing_url", label: "Landing / page URL (UTMs read from it)", guess: /landing|page[\s_-]*url|referr|source[\s_-]*url|^url$/i },
] as const;

export type SaleFieldKey = (typeof SALE_FIELDS)[number]["key"];
export type Mapping = Partial<Record<SaleFieldKey, string>>;

export function guessMapping(headers: string[]): Mapping {
  const m: Mapping = {};
  const used = new Set<string>();
  // utm + specific fields first so generic ones ("amount", "date") don't grab them
  const order = [...SALE_FIELDS].sort((a, b) => Number(b.key.startsWith("utm_")) - Number(a.key.startsWith("utm_")));
  for (const f of order) {
    const h = headers.find((x) => !used.has(x) && f.guess.test(x));
    if (h) {
      m[f.key] = h;
      used.add(h);
    }
  }
  return m;
}

export function parseAmount(raw: string | undefined): number | null {
  if (raw == null) return null;
  const s = String(raw).replace(/[^0-9.\-]/g, "");
  if (!s || s === "-" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseStatus(raw: string | undefined): SaleStatus {
  const s = (raw ?? "").toLowerCase();
  if (/refund|chargeback|reversed/.test(s)) return "refunded";
  if (/fail|cancel|declin|abandon|pending|incomplete|unpaid|error/.test(s)) return "failed";
  return "success";
}

/** Accepts ISO, "22/11/2026 13:31", "22-11-2026", "Nov 22, 2026 1:31 pm". Day-first for slashes. */
export function parseDate(raw: string | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const dm = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]m)?)?/i);
  if (dm) {
    let [, d, mo, y, h = "0", mi = "0", sec = "0", ap] = dm;
    let year = Number(y);
    if (year < 100) year += 2000;
    let hour = Number(h);
    if (ap) hour = (hour % 12) + (/p/i.test(ap) ? 12 : 0);
    const dt = new Date(year, Number(mo) - 1, Number(d), hour, Number(mi), Number(sec));
    return isNaN(dt.getTime()) ? null : dt.toISOString();
  }
  const t = Date.parse(s);
  return isNaN(t) ? null : new Date(t).toISOString();
}

const clean = (v: string | undefined) => {
  const s = (v ?? "").trim();
  return s ? s : null;
};

export function rowsToSales(
  rows: Record<string, string>[],
  mapping: Mapping,
  opts: { kind: SaleKind; campaignId: string; batch: string; newId: () => string },
): Sale[] {
  const get = (r: Record<string, string>, k: SaleFieldKey) => (mapping[k] ? r[mapping[k]!] : undefined);
  const out: Sale[] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const email = clean(get(r, "email"))?.toLowerCase() ?? null;
    const phone = clean(get(r, "phone"));
    const name = clean(get(r, "name"));
    if (!email && !phone && !name) return; // blank / footer line
    const occurred = parseDate(get(r, "occurred_at"));
    const fromUrl = utmFromUrl(get(r, "landing_url"));
    const ext =
      clean(get(r, "external_id")) ??
      `${email ?? phone ?? name}|${occurred ?? ""}|${clean(get(r, "product")) ?? ""}|${i}`;
    if (seen.has(ext)) return;
    seen.add(ext);
    out.push({
      id: opts.newId(),
      campaign_id: opts.campaignId,
      kind: opts.kind,
      external_id: ext,
      name,
      email,
      phone,
      country: clean(get(r, "country")),
      product: clean(get(r, "product")),
      amount: opts.kind === "purchase" ? parseAmount(get(r, "amount")) : null,
      coupon: clean(get(r, "coupon")),
      discount: parseAmount(get(r, "discount")),
      status: opts.kind === "purchase" ? (mapping.status ? parseStatus(get(r, "status")) : "success") : "success",
      utm_source: clean(get(r, "utm_source")) ?? fromUrl.utm_source ?? null,
      utm_medium: clean(get(r, "utm_medium")) ?? fromUrl.utm_medium ?? null,
      utm_campaign: clean(get(r, "utm_campaign")) ?? fromUrl.utm_campaign ?? null,
      utm_content: clean(get(r, "utm_content")) ?? fromUrl.utm_content ?? null,
      utm_term: clean(get(r, "utm_term")) ?? fromUrl.utm_term ?? null,
      occurred_at: occurred,
      import_batch: opts.batch,
    });
  });
  return out;
}

/** Columns used by Export CSV and accepted back by Import links. */
export const LINK_COLUMNS = [
  "date",
  "type",
  "platform",
  "channel",
  "tag",
  "owner",
  "organic_or_paid",
  "base_link",
  "custom_url",
  "long_link",
  "short_link",
  "published_link",
  "status",
  "notes",
] as const;
