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
  /** the live workshop this push came through (pitch, workshop chat, follow-up to attendees…) */
  workshop_id: string | null;
  /** Bootcamp only: overrides the auto src code (the apply form saves ?src=) */
  src_code: string | null;
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

/** A live workshop that people (and pushes) come from. Shared across verticals. */
export interface Workshop {
  id: string;
  name: string;
  date: string | null;
  /** short code used in src / utm_content, e.g. st101-22nov */
  code: string;
  /** older codes that mean this workshop, e.g. "lw" */
  aliases: string[];
  created_at?: string;
}

export type Stage = "applied" | "contacted" | "eligible" | "willing" | "enrolled" | "not_fit" | "not_interested";

export const STAGES: { id: Stage; label: string; exit?: boolean; hint: string }[] = [
  { id: "applied", label: "Applied", hint: "Filled the form, nobody has spoken to them yet" },
  { id: "contacted", label: "Contacted", hint: "We've reached them on call / WhatsApp" },
  { id: "eligible", label: "Eligible", hint: "Fits the bootcamp and we can help them" },
  { id: "willing", label: "Willing to pay", hint: "Agreed to the fee, payment pending" },
  { id: "enrolled", label: "Enrolled", hint: "Paid" },
  { id: "not_fit", label: "Not a fit", exit: true, hint: "Not eligible, or we can't help them" },
  { id: "not_interested", label: "Not interested", exit: true, hint: "Said no, can't afford, or no response" },
];

export const DROP_REASONS = ["Not eligible", "We can't help", "Can't afford", "Not interested", "No response", "Next cohort"];

/** Someone who applied through the Bootcamp form. Form fields re-import; pipeline fields are ours. */
export interface Applicant {
  id: string;
  campaign_id: string;
  external_id: string;
  form_status: string | null;
  /** raw ?src= the form saved */
  source: string | null;
  applied_at: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  commitment: string | null;
  /** every other form answer, header -> value */
  answers: Record<string, string>;
  stage: Stage;
  owner: string | null;
  notes: string | null;
  next_followup: string | null;
  drop_reason: string | null;
  stage_changed_at: string | null;
  updated_at?: string;
}

/** The form-owned part of an applicant — what an import is allowed to write. */
export type ApplicantForm = Pick<
  Applicant,
  "campaign_id" | "external_id" | "form_status" | "source" | "applied_at" | "name" | "phone" | "email" | "commitment" | "answers"
>;
