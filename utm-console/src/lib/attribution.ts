import type { Campaign, LinkRow, Sale } from "./types";
import { rowUtm, slugPart, utmKey } from "./utm";

export interface Attribution {
  /** sale id -> link id */
  bySale: Map<string, string>;
  /** link id -> sales attributed */
  byLink: Map<string, Sale[]>;
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/**
 * Matches each sale to the link it came through.
 * 1. exact source + content + term
 * 2. content + term (source spelled differently)
 * 3. source + content (term missing or edited)
 * Removed rows still count — a link can be pulled from the plan after people bought through it.
 */
export function attribute(sales: Sale[], links: LinkRow[], campaign: Campaign): Attribution {
  const exact = new Map<string, string>();
  const contentTerm = new Map<string, string>();
  const sourceContent = new Map<string, string>();
  for (const l of links) {
    const u = rowUtm(l, campaign);
    const content = norm(u.utm_content);
    exact.set(utmKey({ utm_source: norm(u.utm_source), utm_content: content, utm_term: u.utm_term }), l.id);
    if (!contentTerm.has(`${content}|${u.utm_term}`)) contentTerm.set(`${content}|${u.utm_term}`, l.id);
    if (!sourceContent.has(`${norm(u.utm_source)}|${content}`)) sourceContent.set(`${norm(u.utm_source)}|${content}`, l.id);
  }
  const bySale = new Map<string, string>();
  const byLink = new Map<string, Sale[]>();
  for (const s of sales) {
    if (!s.utm_content) continue;
    const content = norm(s.utm_content);
    const source = norm(s.utm_source);
    const term = norm(s.utm_term);
    const id =
      exact.get(utmKey({ utm_source: source, utm_content: content, utm_term: term })) ??
      contentTerm.get(`${content}|${term}`) ??
      sourceContent.get(`${source}|${content}`) ??
      // content tags typed by hand in other tools sometimes keep punctuation
      sourceContent.get(`${source}|${content.split("-").map(slugPart).join("-")}`);
    if (!id) continue;
    bySale.set(s.id, id);
    const arr = byLink.get(id) ?? [];
    arr.push(s);
    byLink.set(id, arr);
  }
  return { bySale, byLink };
}

export function exGst(amount: number | null, gstRate: number): number {
  if (amount == null) return 0;
  return amount / (1 + (gstRate || 0) / 100);
}

export function inr(n: number, digits = 0): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
