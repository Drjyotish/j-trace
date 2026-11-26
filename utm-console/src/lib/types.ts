export type Vertical = "course" | "bootcamp";

export const VERTICALS: { id: Vertical; name: string; short: string }[] = [
  { id: "course", name: "AI Course", short: "Course" },
  { id: "bootcamp", name: "Creator Bootcamp", short: "Bootcamp" },
];

/** A destination a link can point at. Editable at any time; rows reference it by id. */
export interface BaseLink {
  id: string;
  vertical: Vertical;
  label: string;
  url: string;
  created_at?: string;
  updated_at?: string;
}

/** A cohort / launch inside a vertical. Its slug is utm_campaign. */
export interface Campaign {
  id: string;
  vertical: Vertical;
  name: string;
  slug: string;
  start_date: string | null;
  /** null = "base link not chosen yet". Rows without their own base follow this. */
  default_base_link_id: string | null;
  gst_rate: number;
  archived: boolean;
  created_at?: string;
}

export type OptionKind = "type" | "platform" | "channel" | "owner";

export interface Option {
  id: string;
  kind: OptionKind;
  label: string;
}

export interface LinkRow {
  id: string;
  campaign_id: string;
  post_date: string; // YYYY-MM-DD, also utm_term
  type: string;
  platform: string;
  channel: string;
  tag: string;
  owner: string | null;
  paid: boolean;
  /** null = follow the cohort's default base link */
  base_link_id: string | null;
  /** set = ignore base links and use this URL */
  custom_url: string | null;
  short_url: string | null;
  /** the long URL the short link was created for — used to spot outdated short links */
  short_target: string | null;
  published_url: string | null;
  used_long: boolean;
  notes: string | null;
  removed_at: string | null;
  created_by: string | null;
  created_at?: string;
  updated_at?: string;
}

export type SaleKind = "purchase" | "lead";
export type SaleStatus = "success" | "failed" | "refunded";

export interface Sale {
  id: string;
  campaign_id: string;
  kind: SaleKind;
  external_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  product: string | null;
  amount: number | null; // paid incl. GST
  coupon: string | null;
  discount: number | null;
  status: SaleStatus;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  occurred_at: string | null;
  import_batch: string | null;
}

export type LinkStatus = "brief" | "ready" | "posted";
