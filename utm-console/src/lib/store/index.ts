import type { BaseLink, Campaign, LinkRow, Option, Sale, SaleKind } from "../types";

export interface Shared {
  campaigns: Campaign[];
  baseLinks: BaseLink[];
  options: Option[];
}

/** Everything the UI persists. Two implementations: Supabase (team) and localStorage (demo). */
export interface Store {
  mode: "supabase" | "local";
  loadShared(): Promise<Shared>;
  saveCampaign(c: Campaign): Promise<void>;
  saveBaseLink(b: BaseLink): Promise<void>;
  deleteBaseLink(id: string): Promise<void>;
  saveOptions(o: Option[]): Promise<void>;
  loadLinks(campaignId: string): Promise<LinkRow[]>;
  saveLinks(rows: LinkRow[]): Promise<void>;
  loadSales(campaignId: string): Promise<Sale[]>;
  /** upsert on (campaign, kind, external_id) — re-importing the same export doesn't double count */
  saveSales(rows: Sale[]): Promise<void>;
  clearSales(campaignId: string, kind: SaleKind): Promise<void>;
}

export const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });
