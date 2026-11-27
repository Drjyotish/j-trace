import type { BaseLink, OptionKind, Vertical, Workshop } from "./types";

/** Starting destinations. Every one of these can be edited or replaced in "Base links". */
export const DEFAULT_BASE_LINKS: Omit<BaseLink, "id">[] = [
  { vertical: "course", label: "Course landing", url: "https://ai-course.kkcreate.in/" },
  { vertical: "course", label: "Course checkout", url: "https://learn.kkcreate.in/web/checkout/69d1ffe81ee0d5b55ae2dc14" },
  // the apply form saves ?src=; the landing page doesn't pass it on, so links default to the form
  { vertical: "bootcamp", label: "Bootcamp apply form", url: "https://cb.kkcreate.in/apply" },
  { vertical: "bootcamp", label: "Bootcamp landing", url: "https://cb.kkcreate.in/" },
];

/** "lw" is what the Storytelling 101 workshop links used in the first applicant list. */
export const DEFAULT_WORKSHOPS: Omit<Workshop, "id">[] = [
  { name: "Storytelling 101 · Live Workshop", date: "2026-11-22", code: "st101-22nov", aliases: ["lw"] },
];

/** "Storytelling 101" + 2026-11-22 -> "st101-22nov" */
export function suggestedWorkshopCode(name: string, date: string | null): string {
  const words = name.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w && !["live", "workshop", "the", "a", "for"].includes(w));
  const head = words.map((w) => (/^\d+$/.test(w) ? w : w.slice(0, 2))).join("").slice(0, 8);
  if (!date) return head;
  const d = new Date(`${date}T00:00:00`);
  return `${head}-${d.getDate()}${d.toLocaleString("en", { month: "short" }).toLowerCase()}`;
}

/** Vocabulary from the Storytelling console and the workshop UTM sheets. */
export const DEFAULT_OPTIONS: Record<OptionKind, string[]> = {
  type: [
    "Reel", "Story", "Carousel", "Post", "Short", "YT-Video", "YT-shorts", "YT Repost", "Across Video",
    "Community", "Live", "Broadcast", "Bio link", "Message", "Email", "Ad", "Support", "Pitch", "Follow-up", "QR",
  ],
  platform: [
    "Instagram", "YouTube", "LinkedIn", "Facebook", "Threads", "X", "WhatsApp", "Email", "Automation",
    "Zoom", "Full Video QR", "Meta Ads", "Google Ads", "kkcreate.in", "Live workshop", "Brochure",
  ],
  channel: [
    "@kkc.learn", "@kkc.learn bio", "@kkc.learn DM automation", "@kkcreate", "@kkcreate bio",
    "@kkcreate DM automation", "@kk.create", "@kk.create broadcast", "@learn.kkcreate", "@learnbykk.create",
    "KK Create channel", "Learn channel", "KK Create page", "Kavya Karnatac profile", "Kavya profile",
    "Learn KK broadcast", "KK Create broadcast", "WhatsApp community", "AiSensy broadcast",
    "TagMango cart recovery", "Recovery mail", "Support Mail", "WhatsApp support", "Previous Workshop",
    "Workshop chat", "Workshop slide", "Attendee follow-up mail", "Attendee WhatsApp group", "Printed brochure", "PDF brochure",
  ],
  owner: ["JJ", "Vijeta", "Shambhavi", "Ankit Bisht", "Varun (Pranshu)", "Manan", "Rabiya", "Stuti", "Mamta"],
};

export function suggestedSlug(vertical: Vertical, name: string, startDate: string | null): string {
  const prefix = vertical === "bootcamp" ? "creator-bootcamp" : "ai-course";
  const fromName = name
    .toLowerCase()
    .replace(/creator\s*bootcamp|ai\s*(for\s*content\s*creation\s*)?course|bootcamp|course/g, "")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const date = startDate ? startDate.slice(0, 7) : "";
  return [prefix, fromName || date].filter(Boolean).join("-");
}
