import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BaseLink, Campaign, LinkRow, Option, Sale, SaleKind } from "../types";
import type { Shared, Store } from "./index";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabaseConfigured = Boolean(url && anon);

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!client) client = createClient(url, anon, { auth: { persistSession: true, detectSessionInUrl: true, flowType: "pkce" } });
  return client;
}

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

const num = (v: unknown) => (v == null ? null : Number(v));

export class SupabaseStore implements Store {
  mode = "supabase" as const;
  private db = supabase();

  async loadShared(): Promise<Shared> {
    const [c, b, o] = await Promise.all([
      this.db.from("campaigns").select("*").order("created_at"),
      this.db.from("base_links").select("*").order("created_at"),
      this.db.from("options").select("id,kind,label").order("created_at"),
    ]);
    return {
      campaigns: must(c).map((x: Campaign) => ({ ...x, gst_rate: Number(x.gst_rate) })),
      baseLinks: must(b),
      options: must(o),
    };
  }
  async saveCampaign(c: Campaign) {
    must(await this.db.from("campaigns").upsert(c));
  }
  async saveBaseLink(b: BaseLink) {
    must(await this.db.from("base_links").upsert({ ...b, updated_at: new Date().toISOString() }));
  }
  async deleteBaseLink(id: string) {
    must(await this.db.from("base_links").delete().eq("id", id));
  }
  async saveOptions(o: Option[]) {
    if (o.length) must(await this.db.from("options").upsert(o, { onConflict: "kind,label", ignoreDuplicates: true }));
  }
  async loadLinks(campaignId: string) {
    const rows: LinkRow[] = must(
      await this.db.from("links").select("*").eq("campaign_id", campaignId).order("post_date").order("created_at"),
    );
    return rows;
  }
  async saveLinks(rows: LinkRow[]) {
    if (!rows.length) return;
    const now = new Date().toISOString();
    must(await this.db.from("links").upsert(rows.map((r) => ({ ...r, updated_at: now }))));
  }
  async loadSales(campaignId: string) {
    const out: Sale[] = [];
    // page through — PostgREST caps responses at 1000 rows by default
    for (let from = 0; ; from += 1000) {
      const page: Sale[] = must(
        await this.db.from("sales").select("*").eq("campaign_id", campaignId).order("occurred_at", { ascending: false }).range(from, from + 999),
      );
      out.push(...page.map((s) => ({ ...s, amount: num(s.amount), discount: num(s.discount) })));
      if (page.length < 1000) break;
    }
    return out;
  }
  async saveSales(rows: Sale[]) {
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500).map(({ id: _id, ...rest }) => rest);
      must(await this.db.from("sales").upsert(chunk, { onConflict: "campaign_id,kind,external_id" }));
    }
  }
  async clearSales(campaignId: string, kind: SaleKind) {
    must(await this.db.from("sales").delete().eq("campaign_id", campaignId).eq("kind", kind));
  }
}
