import type { Applicant, ApplicantForm, BaseLink, Campaign, LinkRow, Option, Sale, SaleKind, Workshop } from "../types";

export interface Shared {
  campaigns: Campaign[];
  baseLinks: BaseLink[];
  options: Option[];
  workshops: Workshop[];
}

/** Everything the UI persists. Two implementations: Supabase (team) and localStorage (demo). */
export interface Store {
  mode: "supabase" | "local";
  loadShared(): Promise<Shared>;
  saveCampaign(c: Campaign): Promise<void>;
  saveBaseLink(b: BaseLink): Promise<void>;
  deleteBaseLink(id: string): Promise<void>;
  saveOptions(o: Option[]): Promise<void>;
  saveWorkshop(w: Workshop): Promise<void>;
  deleteWorkshop(id: string): Promise<void>;
  loadLinks(campaignId: string): Promise<LinkRow[]>;
  saveLinks(rows: LinkRow[]): Promise<void>;
  loadSales(campaignId: string): Promise<Sale[]>;
  /** upsert on (campaign, kind, external_id) — re-importing the same export doesn't double count */
  saveSales(rows: Sale[]): Promise<void>;
  clearSales(campaignId: string, kind: SaleKind): Promise<void>;
  loadApplicants(campaignId: string): Promise<Applicant[]>;
  /** upsert form fields on (campaign, external_id); never touches stage / owner / notes */
  importApplicants(rows: ApplicantForm[]): Promise<void>;
  saveApplicant(a: Applicant): Promise<void>;
}

export const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });

/** Fills in the pipeline fields for a newly imported applicant. */
export function newApplicant(f: ApplicantForm): Applicant {
  return {
    ...f,
    id: newId(),
    stage: "applied",
    owner: null,
    notes: null,
    next_followup: null,
    drop_reason: null,
    stage_changed_at: null,
  };
}
