import { describe, expect, it } from "vitest";
import {
  buildLongUrl, contentFor, isShortOutdated, linkStatus, longLinkFor, normaliseUrl, resolveBase, rowUtm, sourceFor, utmFromUrl,
} from "@/lib/utm";
import { attribute } from "@/lib/attribution";
import { guessMapping, parseCsv, parseDate, parseStatus, rowsToSales } from "@/lib/csv";
import { suggestedSlug } from "@/lib/seed";
import type { BaseLink, Campaign, LinkRow, Sale } from "@/lib/types";

const bases: BaseLink[] = [
  { id: "land", vertical: "course", label: "Course landing", url: "https://ai-course.kkcreate.in/" },
  { id: "chk", vertical: "course", label: "Checkout", url: "https://learn.kkcreate.in/web/checkout/69d1ffe81ee0d5b55ae2dc14" },
];
const campaign: Campaign = {
  id: "c1", vertical: "course", name: "Earlybird", slug: "ai-course-2026-12",
  start_date: "2026-12-01", default_base_link_id: "land", gst_rate: 18, archived: false,
};
const row = (over: Partial<LinkRow> = {}): LinkRow => ({
  id: "r1", campaign_id: "c1", post_date: "2026-11-05", type: "Story", platform: "Instagram", channel: "@kkc.learn",
  tag: "kickoff", owner: null, paid: false, base_link_id: null, custom_url: null, short_url: null, short_target: null,
  published_url: null, used_long: false, notes: null, removed_at: null, created_by: null, ...over,
});

describe("utm naming (matches the Storytelling console)", () => {
  it("builds content from channel-type-tag", () => {
    expect(contentFor("@kkc.learn", "Story", "kickoff")).toBe("kkclearn-story-kickoff");
    expect(contentFor("Kavya profile", "Post", "linkedin-post-1")).toBe("kavyaprofile-post-linkedinpost1");
    expect(contentFor("@kkc.learn bio", "Bio link", "")).toBe("kkclearnbio-biolink");
  });
  it("keeps dots in sources", () => {
    expect(sourceFor("kkcreate.in")).toBe("kkcreate.in");
    expect(sourceFor("Full Video QR")).toBe("full-video-qr");
  });
  it("generates the same long link shape", () => {
    expect(longLinkFor(row(), campaign, bases)).toBe(
      "https://ai-course.kkcreate.in/?utm_source=instagram&utm_medium=social&utm_campaign=ai-course-2026-12&utm_content=kkclearn-story-kickoff&utm_term=2026-11-05",
    );
    expect(rowUtm(row({ paid: true }), campaign).utm_medium).toBe("paid");
  });
  it("keeps existing query/hash and replaces old utm params", () => {
    const u = buildLongUrl("cb.kkcreate.in/?ref=x&utm_source=old#form", rowUtm(row(), campaign))!;
    expect(u.startsWith("https://cb.kkcreate.in/?ref=x&utm_source=instagram")).toBe(true);
    expect(u.endsWith("#form")).toBe(true);
    expect(u.match(/utm_source/g)!.length).toBe(1);
  });
  it("rejects junk URLs", () => {
    expect(normaliseUrl("hello")).toBeNull();
    expect(normaliseUrl("javascript:alert(1)")).toBeNull();
    expect(normaliseUrl("cb.kkcreate.in")).toBe("https://cb.kkcreate.in/");
  });
});

describe("base links can change later", () => {
  it("follows the cohort default, a chosen base, or a custom URL", () => {
    expect(resolveBase(row(), campaign, bases)?.via).toBe("default");
    expect(resolveBase(row({ base_link_id: "chk" }), campaign, bases)?.url).toContain("checkout");
    expect(resolveBase(row({ custom_url: "https://x.kkcreate.in/" }), campaign, bases)?.via).toBe("custom");
  });
  it("has no link until a base is chosen", () => {
    expect(longLinkFor(row(), { ...campaign, default_base_link_id: null }, bases)).toBeNull();
  });
  it("regenerates when a base link URL is edited and flags the old short link", () => {
    const before = longLinkFor(row(), campaign, bases)!;
    const r = row({ short_url: "https://bit.ly/abc", short_target: before });
    expect(isShortOutdated(r, before)).toBe(false);
    const edited = bases.map((b) => (b.id === "land" ? { ...b, url: "https://course.kkcreate.in/" } : b));
    const after = longLinkFor(r, campaign, edited)!;
    expect(after).toContain("course.kkcreate.in");
    expect(isShortOutdated(r, after)).toBe(true);
  });
  it("derives status", () => {
    expect(linkStatus(row())).toBe("brief");
    expect(linkStatus(row({ short_url: "x" }))).toBe("ready");
    expect(linkStatus(row({ used_long: true }))).toBe("posted");
  });
});

describe("csv + attribution", () => {
  it("guesses columns and reads UTMs from a landing URL column", () => {
    const csv = parseCsv(
      "Order ID,Customer Name,Email,Phone,Amount Paid,Payment Status,Coupon Code,Created At,Landing URL\n" +
        "o1,Asha,ASHA@x.com,98,₹589.00,Success,KK100,22/11/2026 13:31,https://ai-course.kkcreate.in/?utm_source=instagram&utm_medium=social&utm_campaign=ai-course-2026-12&utm_content=kkclearn-story-kickoff&utm_term=2026-11-05\n" +
        "o2,Ravi,r@x.com,97,589,Failed,,22/11/2026 10:01,\n",
    );
    const m = guessMapping(csv.headers);
    expect(m).toMatchObject({ external_id: "Order ID", name: "Customer Name", email: "Email", amount: "Amount Paid", status: "Payment Status", coupon: "Coupon Code", landing_url: "Landing URL" });
    let n = 0;
    const sales = rowsToSales(csv.rows, m, { kind: "purchase", campaignId: "c1", batch: "b", newId: () => `s${++n}` });
    expect(sales).toHaveLength(2);
    expect(sales[0]).toMatchObject({ email: "asha@x.com", amount: 589, status: "success", utm_content: "kkclearn-story-kickoff" });
    expect(sales[1].status).toBe("failed");
    const a = attribute(sales as Sale[], [row()], campaign);
    expect(a.bySale.get("s1")).toBe("r1");
    expect(a.bySale.has("s2")).toBe(false);
  });
  it("parses dates and statuses", () => {
    expect(parseDate("05/11/2026")?.slice(0, 10)).toMatch(/2026-11-0[45]/);
    expect(parseStatus("Refunded")).toBe("refunded");
    expect(parseStatus("captured")).toBe("success");
  });
  it("utmFromUrl tolerates bare query strings", () => {
    expect(utmFromUrl("utm_source=yt&utm_content=a")).toEqual({ utm_source: "yt", utm_content: "a" });
  });
  it("suggests cohort slugs", () => {
    expect(suggestedSlug("bootcamp", "Jan 2027 cohort", "2027-01-10")).toBe("creator-bootcamp-jan-2027-cohort");
    expect(suggestedSlug("course", "", "2026-12-01")).toBe("ai-course-2026-12");
  });
});
