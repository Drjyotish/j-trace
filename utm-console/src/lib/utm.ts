import type { BaseLink, Campaign, LinkRow, LinkStatus, Workshop } from "./types";

/** "@kkc.learn" -> "kkclearn", "Bio link" -> "biolink", "linkedin-post-1" -> "linkedinpost1" */
export function slugPart(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** "Creator Bootcamp Jan 2027" -> "creator-bootcamp-jan-2027" */
export function kebab(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Platform label -> utm_source. Keeps dots so "kkcreate.in" stays readable. */
export function sourceFor(platform: string): string {
  return platform
    .normalize("NFKD")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function mediumFor(paid: boolean): string {
  return paid ? "paid" : "social";
}

/** channel-type-tag, prefixed with the workshop code when the push came through a workshop */
export function contentFor(channel: string, type: string, tag: string, workshopCode?: string | null): string {
  const parts = [channel, type, tag].map(slugPart).filter(Boolean);
  return [kebab(workshopCode), ...parts].filter(Boolean).join("-");
}

const PLATFORM_SHORT: Record<string, string> = {
  instagram: "ig", youtube: "yt", facebook: "fb", linkedin: "li", whatsapp: "wa", email: "em", gmail: "em",
  threads: "th", x: "x", automation: "auto", brochure: "br", liveworkshop: "lw", zoom: "zoom", metaads: "meta",
  googleads: "gads", fullvideoqr: "qr", kkcreatein: "web",
};

export function workshopOf(row: Pick<LinkRow, "workshop_id">, workshops: Workshop[]): Workshop | null {
  return row.workshop_id ? workshops.find((w) => w.id === row.workshop_id) ?? null : null;
}

/** Short code the Bootcamp apply form saves (?src=). e.g. st101-22nov-wa-pitch */
export function srcFor(row: Pick<LinkRow, "src_code" | "workshop_id" | "platform" | "tag">, workshops: Workshop[]): string {
  if (row.src_code?.trim()) return kebab(row.src_code);
  const p = slugPart(row.platform);
  return [workshopOf(row, workshops)?.code, PLATFORM_SHORT[p] ?? p.slice(0, 6), kebab(row.tag)].filter(Boolean).join("-");
}

/** Bootcamp links carry src= because the apply form only saves that one value. */
export function usesSrc(campaign: Pick<Campaign, "vertical">): boolean {
  return campaign.vertical === "bootcamp";
}

export interface Utm {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
}

type UtmRow = Pick<LinkRow, "platform" | "paid" | "channel" | "type" | "tag" | "post_date"> & Partial<Pick<LinkRow, "workshop_id">>;

export function rowUtm(row: UtmRow, campaign: Pick<Campaign, "slug">, workshops: Workshop[] = []): Utm {
  return {
    utm_source: sourceFor(row.platform),
    utm_medium: mediumFor(row.paid),
    utm_campaign: campaign.slug,
    utm_content: contentFor(row.channel, row.type, row.tag, workshopOf({ workshop_id: row.workshop_id ?? null }, workshops)?.code),
    utm_term: row.post_date,
  };
}

/** Normalise what people type: adds https:// when missing. Returns null if it can't be a URL. */
export function normaliseUrl(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const withProto = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Adds UTM params to a base URL, keeping its own query (minus old utm_*) and hash. */
export function buildLongUrl(base: string, utm: Utm, src?: string | null): string | null {
  const norm = normaliseUrl(base);
  if (!norm) return null;
  const u = new URL(norm);
  for (const k of [...u.searchParams.keys()]) if (k.startsWith("utm_") || k === "src") u.searchParams.delete(k);
  if (src) u.searchParams.set("src", src);
  const order: (keyof Utm)[] = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  for (const k of order) if (utm[k]) u.searchParams.set(k, utm[k]);
  return u.toString();
}

export interface ResolvedBase {
  url: string;
  label: string;
  /** where the base came from */
  via: "custom" | "row" | "default";
  baseLinkId: string | null;
}

export function resolveBase(
  row: Pick<LinkRow, "custom_url" | "base_link_id">,
  campaign: Pick<Campaign, "default_base_link_id">,
  baseLinks: BaseLink[],
): ResolvedBase | null {
  if (row.custom_url) return { url: row.custom_url, label: "Custom URL", via: "custom", baseLinkId: null };
  if (row.base_link_id) {
    const b = baseLinks.find((x) => x.id === row.base_link_id);
    if (b) return { url: b.url, label: b.label, via: "row", baseLinkId: b.id };
  }
  const d = campaign.default_base_link_id ? baseLinks.find((x) => x.id === campaign.default_base_link_id) : null;
  if (d) return { url: d.url, label: d.label, via: "default", baseLinkId: d.id };
  return null;
}

export function longLinkFor(row: LinkRow, campaign: Campaign, baseLinks: BaseLink[], workshops: Workshop[] = []): string | null {
  const base = resolveBase(row, campaign, baseLinks);
  if (!base) return null;
  return buildLongUrl(base.url, rowUtm(row, campaign, workshops), usesSrc(campaign) ? srcFor(row, workshops) : null);
}

/** cb.kkcreate.in's landing page doesn't pass ?src= on to /apply, so only /apply links get attributed. */
export function bootcampBaseWarning(campaign: Pick<Campaign, "vertical">, url: string | null | undefined): string | null {
  if (!usesSrc(campaign) || !url) return null;
  try {
    const u = new URL(url);
    if (u.hostname === "cb.kkcreate.in" && !/\/apply\/?$/.test(u.pathname)) {
      return "The bootcamp landing page doesn't pass src on to the form, so applications from this link show no source. Point it at cb.kkcreate.in/apply, or get the site to forward the query string.";
    }
  } catch { /* ignore */ }
  return null;
}

export function linkStatus(row: Pick<LinkRow, "published_url" | "used_long" | "short_url">): LinkStatus {
  if (row.published_url || row.used_long) return "posted";
  if (row.short_url) return "ready";
  return "brief";
}

/** True when the short link was made for a different long URL than the row now generates. */
export function isShortOutdated(row: Pick<LinkRow, "short_url" | "short_target">, longUrl: string | null): boolean {
  return !!(row.short_url && row.short_target && longUrl && row.short_target !== longUrl);
}

/** Key that identifies a row in analytics. Two rows sharing it can't be told apart in sales. */
export function utmKey(u: Pick<Utm, "utm_source" | "utm_content" | "utm_term">): string {
  return `${u.utm_source}|${u.utm_content}|${u.utm_term}`;
}

export function hostOf(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** "https://bit.ly/abc" -> "bit.ly/abc" */
export function displayUrl(url: string | null | undefined): string {
  return (url ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/** Pulls utm_* out of any URL-ish string (landing URL columns in exports). */
export function utmFromUrl(raw: string | null | undefined): Partial<Utm> {
  const s = (raw ?? "").trim();
  if (!s) return {};
  const q = s.includes("?") ? s.slice(s.indexOf("?") + 1) : s.includes("utm_") ? s : "";
  if (!q) return {};
  const p = new URLSearchParams(q.split("#")[0]);
  const out: Partial<Utm> = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const) {
    const v = p.get(k);
    if (v) out[k] = v.trim();
  }
  return out;
}
