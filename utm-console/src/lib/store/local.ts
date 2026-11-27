import type { Applicant, ApplicantForm, BaseLink, Campaign, LinkRow, Option, Sale, SaleKind, Workshop } from "../types";
import { newApplicant, type Shared, type Store } from "./index";

const KEY = "kkc-utm-console:v1";

interface Db {
  campaigns: Campaign[];
  baseLinks: BaseLink[];
  options: Option[];
  links: LinkRow[];
  sales: Sale[];
  workshops: Workshop[];
  applicants: Applicant[];
}

const empty = (): Db => ({ campaigns: [], baseLinks: [], options: [], links: [], sales: [], workshops: [], applicants: [] });

function read(): Db {
  if (typeof localStorage === "undefined") return empty();
  try {
    return { ...empty(), ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return empty();
  }
}

function write(db: Db) {
  localStorage.setItem(KEY, JSON.stringify(db));
}

function upsert<T extends { id: string }>(list: T[], items: T[]): T[] {
  const byId = new Map(list.map((x) => [x.id, x]));
  for (const it of items) byId.set(it.id, { ...byId.get(it.id), ...it });
  return [...byId.values()];
}

/** Demo mode: data lives in this browser only. */
export class LocalStore implements Store {
  mode = "local" as const;

  async loadShared(): Promise<Shared> {
    const db = read();
    return { campaigns: db.campaigns, baseLinks: db.baseLinks, options: db.options, workshops: db.workshops };
  }
  async saveCampaign(c: Campaign) {
    const db = read();
    db.campaigns = upsert(db.campaigns, [c]);
    write(db);
  }
  async saveBaseLink(b: BaseLink) {
    const db = read();
    db.baseLinks = upsert(db.baseLinks, [{ ...b, updated_at: new Date().toISOString() }]);
    write(db);
  }
  async deleteBaseLink(id: string) {
    const db = read();
    db.baseLinks = db.baseLinks.filter((b) => b.id !== id);
    db.campaigns = db.campaigns.map((c) => (c.default_base_link_id === id ? { ...c, default_base_link_id: null } : c));
    db.links = db.links.map((l) => (l.base_link_id === id ? { ...l, base_link_id: null } : l));
    write(db);
  }
  async saveOptions(o: Option[]) {
    const db = read();
    db.options = upsert(db.options, o);
    write(db);
  }
  async loadLinks(campaignId: string) {
    return read().links.filter((l) => l.campaign_id === campaignId);
  }
  async saveLinks(rows: LinkRow[]) {
    const db = read();
    const now = new Date().toISOString();
    db.links = upsert(db.links, rows.map((r) => ({ ...r, updated_at: now, created_at: r.created_at ?? now })));
    write(db);
  }
  async loadSales(campaignId: string) {
    return read().sales.filter((s) => s.campaign_id === campaignId);
  }
  async saveSales(rows: Sale[]) {
    const db = read();
    const key = (s: Sale) => `${s.campaign_id}|${s.kind}|${s.external_id}`;
    const byKey = new Map(db.sales.map((s) => [key(s), s]));
    for (const s of rows) {
      const prev = byKey.get(key(s));
      byKey.set(key(s), prev ? { ...s, id: prev.id } : s);
    }
    db.sales = [...byKey.values()];
    write(db);
  }
  async saveWorkshop(w: Workshop) {
    const db = read();
    db.workshops = upsert(db.workshops, [w]);
    write(db);
  }
  async deleteWorkshop(id: string) {
    const db = read();
    db.workshops = db.workshops.filter((w) => w.id !== id);
    db.links = db.links.map((l) => (l.workshop_id === id ? { ...l, workshop_id: null } : l));
    write(db);
  }
  async loadApplicants(campaignId: string) {
    return read().applicants.filter((a) => a.campaign_id === campaignId);
  }
  async importApplicants(rows: ApplicantForm[]) {
    const db = read();
    const key = (a: { campaign_id: string; external_id: string }) => `${a.campaign_id}|${a.external_id}`;
    const byKey = new Map(db.applicants.map((a) => [key(a), a]));
    for (const f of rows) {
      const prev = byKey.get(key(f));
      byKey.set(key(f), prev ? { ...prev, ...f } : newApplicant(f));
    }
    db.applicants = [...byKey.values()];
    write(db);
  }
  async saveApplicant(a: Applicant) {
    const db = read();
    db.applicants = upsert(db.applicants, [{ ...a, updated_at: new Date().toISOString() }]);
    write(db);
  }
  async clearSales(campaignId: string, kind: SaleKind) {
    const db = read();
    db.sales = db.sales.filter((s) => !(s.campaign_id === campaignId && s.kind === kind));
    write(db);
  }
}
