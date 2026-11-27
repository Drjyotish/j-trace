import type { Applicant, Campaign, LinkRow, Sale, Workshop } from "./types";
import { rowUtm, slugPart, srcFor, utmKey } from "./utm";

export interface Attribution {
  /** sale id -> link id */
  bySale: Map<string, string>;
  /** link id -> sales attributed */
  byLink: Map<string, Sale[]>;
  /** sale id -> workshop id (via its link, or a workshop code in its UTMs) */
  workshopBySale: Map<string, string>;
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Finds a workshop from a raw code: exact code, an alias ("lw"), or a code prefix ("st101-22nov-wa"). */
export function workshopForCode(code: string | null | undefined, workshops: Workshop[]): Workshop | null {
  const c = norm(code);
  if (!c) return null;
  return (
    workshops.find((w) => norm(w.code) === c || w.aliases.some((a) => norm(a) === c)) ??
    workshops.find((w) => w.code && c.startsWith(`${norm(w.code)}-`)) ??
    null
  );
}

/**
 * Matches each sale to the link it came through.
 * 1. exact source + content + term
 * 2. content + term (source spelled differently)
 * 3. source + content (term missing or edited)
 * Removed rows still count — a link can be pulled from the plan after people bought through it.
 */
export function attribute(sales: Sale[], links: LinkRow[], campaign: Campaign, workshops: Workshop[] = []): Attribution {
  const exact = new Map<string, string>();
  const contentTerm = new Map<string, string>();
  const sourceContent = new Map<string, string>();
  const linkById = new Map(links.map((l) => [l.id, l]));
  for (const l of links) {
    const u = rowUtm(l, campaign, workshops);
    const content = norm(u.utm_content);
    exact.set(utmKey({ utm_source: norm(u.utm_source), utm_content: content, utm_term: u.utm_term }), l.id);
    if (!contentTerm.has(`${content}|${u.utm_term}`)) contentTerm.set(`${content}|${u.utm_term}`, l.id);
    if (!sourceContent.has(`${norm(u.utm_source)}|${content}`)) sourceContent.set(`${norm(u.utm_source)}|${content}`, l.id);
  }
  const bySale = new Map<string, string>();
  const byLink = new Map<string, Sale[]>();
  const workshopBySale = new Map<string, string>();
  for (const s of sales) {
    if (!s.utm_content) {
      const w = workshopForCode(s.utm_source, workshops);
      if (w) workshopBySale.set(s.id, w.id);
      continue;
    }
    const content = norm(s.utm_content);
    const source = norm(s.utm_source);
    const term = norm(s.utm_term);
    const id =
      exact.get(utmKey({ utm_source: source, utm_content: content, utm_term: term })) ??
      contentTerm.get(`${content}|${term}`) ??
      sourceContent.get(`${source}|${content}`) ??
      // content tags typed by hand in other tools sometimes keep punctuation
      sourceContent.get(`${source}|${content.split("-").map(slugPart).join("-")}`);
    if (id) {
      bySale.set(s.id, id);
      const arr = byLink.get(id) ?? [];
      arr.push(s);
      byLink.set(id, arr);
      const wid = linkById.get(id)?.workshop_id;
      if (wid) workshopBySale.set(s.id, wid);
    }
    if (!workshopBySale.has(s.id)) {
      const w = workshopForCode(s.utm_content, workshops) ?? workshopForCode(s.utm_source, workshops);
      if (w) workshopBySale.set(s.id, w.id);
    }
  }
  return { bySale, byLink, workshopBySale };
}

export interface ApplicantSource {
  linkId: string | null;
  workshopId: string | null;
}

/** Bootcamp form saves one value (?src= or utm_source). Match it to a link's src code, then to a workshop code/alias. */
export function attributeApplicants(applicants: Applicant[], links: LinkRow[], workshops: Workshop[]): Map<string, ApplicantSource> {
  const bySrc = new Map<string, LinkRow>();
  for (const l of links) {
    const code = norm(srcFor(l, workshops));
    if (code && !bySrc.has(code)) bySrc.set(code, l);
  }
  const out = new Map<string, ApplicantSource>();
  for (const a of applicants) {
    const code = norm(a.source);
    if (!code) continue;
    const link = bySrc.get(code);
    if (link) {
      out.set(a.id, { linkId: link.id, workshopId: link.workshop_id ?? workshopForCode(code, workshops)?.id ?? null });
      continue;
    }
    const w = workshopForCode(code, workshops);
    if (w) out.set(a.id, { linkId: null, workshopId: w.id });
  }
  return out;
}

/**
 * Payment exports don't carry the bootcamp src, so a purchase with no workshop of its own takes the workshop
 * of the applicant with the same email or phone.
 */
export function withApplicantWorkshops(
  a: Attribution, sales: Sale[], applicants: Applicant[], sources: Map<string, ApplicantSource>,
): Attribution {
  if (!applicants.length) return a;
  const byEmail = new Map<string, string>();
  const byPhone = new Map<string, string>();
  for (const ap of applicants) {
    const w = sources.get(ap.id)?.workshopId;
    if (!w) continue;
    if (ap.email) byEmail.set(ap.email.toLowerCase(), w);
    if (phoneKey(ap.phone).length === 10) byPhone.set(phoneKey(ap.phone), w);
  }
  const workshopBySale = new Map(a.workshopBySale);
  for (const s of sales) {
    if (workshopBySale.has(s.id)) continue;
    const w = (s.email && byEmail.get(s.email.toLowerCase())) || byPhone.get(phoneKey(s.phone));
    if (w) workshopBySale.set(s.id, w);
  }
  return { ...a, workshopBySale };
}

/** last 10 digits — enough to match +91 / 0-prefixed / plain Indian numbers */
export function phoneKey(p: string | null | undefined): string {
  const d = (p ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : d;
}

export function waLink(p: string | null | undefined): string | null {
  const d = (p ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return `https://wa.me/${d.length === 10 ? `91${d}` : d}`;
}

export function exGst(amount: number | null, gstRate: number): number {
  if (amount == null) return 0;
  return amount / (1 + (gstRate || 0) / 100);
}

export function inr(n: number, digits = 0): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
