import type { BaseLink, OptionKind, Vertical } from "./types";

/** Starting destinations. Every one of these can be edited or replaced in "Base links". */
export const DEFAULT_BASE_LINKS: Omit<BaseLink, "id">[] = [
  { vertical: "course", label: "Course landing", url: "https://ai-course.kkcreate.in/" },
  { vertical: "course", label: "Course checkout", url: "https://learn.kkcreate.in/web/checkout/69d1ffe81ee0d5b55ae2dc14" },
  { vertical: "bootcamp", label: "Bootcamp landing", url: "https://cb.kkcreate.in/" },
];

/** Vocabulary from the Storytelling console and the workshop UTM sheets. */
export const DEFAULT_OPTIONS: Record<OptionKind, string[]> = {
  type: [
    "Reel", "Story", "Carousel", "Post", "Short", "YT-Video", "YT-shorts", "YT Repost", "Across Video",
    "Community", "Live", "Broadcast", "Bio link", "Message", "Email", "Ad", "Support",
  ],
  platform: [
    "Instagram", "YouTube", "LinkedIn", "Facebook", "Threads", "X", "WhatsApp", "Email", "Automation",
    "Zoom", "Full Video QR", "Meta Ads", "Google Ads", "kkcreate.in",
  ],
  channel: [
    "@kkc.learn", "@kkc.learn bio", "@kkc.learn DM automation", "@kkcreate", "@kkcreate bio",
    "@kkcreate DM automation", "@kk.create", "@kk.create broadcast", "@learn.kkcreate", "@learnbykk.create",
    "KK Create channel", "Learn channel", "KK Create page", "Kavya Karnatac profile", "Kavya profile",
    "Learn KK broadcast", "KK Create broadcast", "WhatsApp community", "AiSensy broadcast",
    "TagMango cart recovery", "Recovery mail", "Support Mail", "WhatsApp support", "Previous Workshop",
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
