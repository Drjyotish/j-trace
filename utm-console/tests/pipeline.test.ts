import { describe, expect, it } from "vitest";
import { attribute, attributeApplicants, phoneKey, waLink, withApplicantWorkshops, workshopForCode } from "@/lib/attribution";
import { guessApplicantMapping, parseCsv, rowsToApplicants } from "@/lib/csv";
import { suggestedWorkshopCode } from "@/lib/seed";
import { newApplicant } from "@/lib/store";
import { bootcampBaseWarning, longLinkFor, rowUtm, srcFor } from "@/lib/utm";
import type { BaseLink, Campaign, LinkRow, Sale, Workshop } from "@/lib/types";

const ws: Workshop[] = [
  { id: "w1", name: "Storytelling 101", date: "2026-11-22", code: "st101-22nov", aliases: ["lw"] },
  { id: "w2", name: "AI Editing", date: "2026-12-06", code: "aied-6dec", aliases: [] },
];
const bases: BaseLink[] = [{ id: "apply", vertical: "bootcamp", label: "Apply form", url: "https://cb.kkcreate.in/apply" }];
const bootcamp: Campaign = {
  id: "c1", vertical: "bootcamp", name: "Jan 2027", slug: "creator-bootcamp-jan-2027", start_date: null,
  default_base_link_id: "apply", gst_rate: 18, archived: false,
};
const course: Campaign = { ...bootcamp, id: "c2", vertical: "course", slug: "ai-course-evergreen" };
const row = (over: Partial<LinkRow> = {}): LinkRow => ({
  id: "r1", campaign_id: "c1", post_date: "2026-11-22", type: "Pitch", platform: "WhatsApp", channel: "Attendee WhatsApp group",
  tag: "pitch", owner: null, paid: false, workshop_id: "w1", src_code: null, base_link_id: null, custom_url: null,
  short_url: null, short_target: null, published_url: null, used_long: false, notes: null, removed_at: null, created_by: null, ...over,
});

describe("workshop + src codes", () => {
  it("builds a short src from workshop, platform and tag", () => {
    expect(srcFor(row(), ws)).toBe("st101-22nov-wa-pitch");
    expect(srcFor(row({ workshop_id: null, platform: "Instagram", tag: "reel-1" }), ws)).toBe("ig-reel-1");
    expect(srcFor(row({ src_code: "My Code" }), ws)).toBe("my-code");
  });
  it("puts src on bootcamp links only, and the workshop code at the front of utm_content", () => {
    const b = longLinkFor(row(), bootcamp, bases, ws)!;
    expect(b).toContain("cb.kkcreate.in/apply?src=st101-22nov-wa-pitch&utm_source=whatsapp");
    expect(rowUtm(row(), bootcamp, ws).utm_content).toBe("st101-22nov-attendeewhatsappgroup-pitch-pitch");
    const c = longLinkFor(row({ campaign_id: "c2" }), course, bases, ws)!;
    expect(c).not.toContain("src=");
  });
  it("warns when a bootcamp link points at the landing page", () => {
    expect(bootcampBaseWarning(bootcamp, "https://cb.kkcreate.in/")).toMatch(/doesn't pass src/);
    expect(bootcampBaseWarning(bootcamp, "https://cb.kkcreate.in/apply")).toBeNull();
    expect(bootcampBaseWarning(course, "https://cb.kkcreate.in/")).toBeNull();
  });
  it("suggests workshop codes", () => {
    expect(suggestedWorkshopCode("Storytelling 101 Live Workshop", "2026-11-22")).toBe("st101-22nov");
  });
  it("finds workshops by code, alias or prefix", () => {
    expect(workshopForCode("lw", ws)?.id).toBe("w1");
    expect(workshopForCode("ST101-22NOV", ws)?.id).toBe("w1");
    expect(workshopForCode("aied-6dec-em-followup", ws)?.id).toBe("w2");
    expect(workshopForCode("random", ws)).toBeNull();
  });
});

describe("applicants", () => {
  // same columns as the cb.kkcreate.in/apply sheet, made-up people
  const csv = parseCsv(
    "Id,Status,Last step,Source,Started,Updated,Name,WhatsApp,Age,Email,City,Role,Commitment\n" +
      "a1,Submitted,2,lw,22/11/2026,22/11/2026,Asha Test,9000000001,30,ASHA@example.com,Pune,Creator,Yes\n" +
      "a2,Incomplete,1,,22/11/2026,22/11/2026,Ravi Test,+919000000002,25,ravi@example.com,Delhi,,\n" +
      "a3,Submitted,2,st101-22nov-wa-pitch,23/11/2026,23/11/2026,Meera Test,9000000003,28,meera@example.com,Goa,Student,No\n" +
      "a4,Submitted,2,mystery,23/11/2026,23/11/2026,Kabir Test,9000000004,28,kabir@example.com,Goa,Student,Yes\n",
  );
  const m = guessApplicantMapping(csv.headers);
  const forms = rowsToApplicants(csv.rows, m, "c1");

  it("maps the form columns and keeps the rest as answers", () => {
    expect(m).toMatchObject({ external_id: "Id", form_status: "Status", source: "Source", applied_at: "Started", name: "Name", phone: "WhatsApp", email: "Email", commitment: "Commitment" });
    expect(forms).toHaveLength(4);
    expect(forms[0]).toMatchObject({ external_id: "a1", source: "lw", email: "asha@example.com", form_status: "Submitted" });
    expect(forms[0].answers).toEqual({ Age: "30", City: "Pune", Role: "Creator" });
    expect(forms[0].answers).not.toHaveProperty("Last step");
  });
  it("attributes by link src first, then workshop alias", () => {
    const apps = forms.map(newApplicant);
    const src = attributeApplicants(apps, [row()], ws);
    const by = (ext: string) => src.get(apps.find((a) => a.external_id === ext)!.id);
    expect(by("a1")).toEqual({ linkId: null, workshopId: "w1" });
    expect(by("a2")).toBeUndefined();
    expect(by("a3")).toEqual({ linkId: "r1", workshopId: "w1" });
    expect(by("a4")).toBeUndefined();
  });
  it("matches phones and builds WhatsApp links", () => {
    expect(phoneKey("+91 90000 00002")).toBe(phoneKey("9000000002"));
    expect(waLink("9000000001")).toBe("https://wa.me/919000000001");
    expect(waLink("123")).toBeNull();
  });
});

describe("sales by workshop", () => {
  it("rolls purchases up to the workshop of their link, or a workshop code in the UTMs", () => {
    const link = row({ campaign_id: "c2" });
    const u = rowUtm(link, course, ws);
    const sale = (id: string, over: Partial<Sale>): Sale => ({
      id, campaign_id: "c2", kind: "purchase", external_id: id, name: null, email: null, phone: null, country: null, product: null,
      amount: 499, coupon: null, discount: null, status: "success", utm_source: null, utm_medium: null, utm_campaign: null,
      utm_content: null, utm_term: null, occurred_at: null, import_batch: null, ...over,
    });
    const a = attribute(
      [sale("s1", { utm_source: u.utm_source, utm_content: u.utm_content, utm_term: u.utm_term }), sale("s2", { utm_source: "lw" }), sale("s3", { utm_source: "instagram", utm_content: "x" })],
      [link], course, ws,
    );
    expect(a.bySale.get("s1")).toBe("r1");
    expect(a.workshopBySale.get("s1")).toBe("w1");
    expect(a.workshopBySale.get("s2")).toBe("w1");
    expect(a.workshopBySale.has("s3")).toBe(false);
  });

  it("gives a bootcamp payment the workshop of the applicant who paid", () => {
    const ap = newApplicant({ campaign_id: "c1", external_id: "a1", form_status: "Submitted", source: "lw", applied_at: null, name: "A", phone: "+91 90000 00009", email: "a@example.com", commitment: null, answers: {} });
    const paid: Sale = {
      id: "p1", campaign_id: "c1", kind: "purchase", external_id: "p1", name: null, email: null, phone: "9000000009", country: null, product: null,
      amount: 11800, coupon: null, discount: null, status: "success", utm_source: null, utm_medium: null, utm_campaign: null,
      utm_content: null, utm_term: null, occurred_at: null, import_batch: null,
    };
    const base = attribute([paid], [], bootcamp, ws);
    expect(base.workshopBySale.has("p1")).toBe(false);
    const withAp = withApplicantWorkshops(base, [paid], [ap], attributeApplicants([ap], [], ws));
    expect(withAp.workshopBySale.get("p1")).toBe("w1");
  });
});
