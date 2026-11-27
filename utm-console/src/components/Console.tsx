"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Applicant, ApplicantForm, BaseLink, Campaign, LinkRow, Option, OptionKind, Sale, SaleKind, Workshop } from "@/lib/types";
import { VERTICALS } from "@/lib/types";
import { newId, type Store } from "@/lib/store";
import { DEFAULT_BASE_LINKS, DEFAULT_OPTIONS, DEFAULT_WORKSHOPS } from "@/lib/seed";
import { attribute, attributeApplicants, withApplicantWorkshops, type ApplicantSource, type Attribution } from "@/lib/attribution";
import { bootcampBaseWarning, displayUrl, hostOf, isShortOutdated, linkStatus, longLinkFor, resolveBase, srcFor, usesSrc, workshopOf } from "@/lib/utm";
import { LINK_COLUMNS, toCsv } from "@/lib/csv";
import { bitlyConfigured, repointLink, shortenLink, type TokenGetter } from "@/lib/bitlyClient";
import { download, Empty } from "./ui";
import { LinksTab } from "./LinksTab";
import { CalendarTab } from "./CalendarTab";
import { SalesTab } from "./SalesTab";
import { TransactionsTab } from "./TransactionsTab";
import { RowDialog } from "./RowDialog";
import { BaseLinksDialog } from "./BaseLinksDialog";
import { CampaignDialog } from "./CampaignDialog";
import { ImportDialog, type ImportMode } from "./ImportDialog";
import { QrDialog } from "./QrDialog";
import { ApplicantsTab } from "./ApplicantsTab";
import { WorkshopsDialog } from "./WorkshopsDialog";

export interface User { email: string; name: string }

type Tab = "links" | "calendar" | "applicants" | "sales" | "transactions";

export interface Ctx {
  store: Store;
  campaign: Campaign;
  baseLinks: BaseLink[];
  verticalBases: BaseLink[];
  options: Record<OptionKind, string[]>;
  workshops: Workshop[];
  links: LinkRow[];
  sales: Sale[];
  applicants: Applicant[];
  applicantSources: Map<string, ApplicantSource>;
  attribution: Attribution;
  longOf: (r: LinkRow) => string | null;
  bitlyReady: boolean;
  busy: Set<string>;
  saveRows: (rows: LinkRow[]) => Promise<void>;
  addOption: (kind: OptionKind, label: string) => void;
  shorten: (rows: LinkRow[]) => Promise<void>;
  repoint: (rows: LinkRow[]) => Promise<void>;
  remove: (row: LinkRow) => void;
  openRow: (row?: LinkRow, date?: string) => void;
  openQr: (row: LinkRow) => void;
  openBaseLinks: () => void;
  openWorkshops: () => void;
  saveApplicant: (a: Applicant) => Promise<void>;
  openImport: (mode: ImportMode) => void;
  toast: (msg: string, kind?: "ok" | "err") => void;
  showTransactionsFor: (linkId: string | null) => void;
  txLinkFilter: string | null;
  setTxLinkFilter: (id: string | null) => void;
}

const LAST_KEY = "kkc-utm-console:last-campaign";
let seeding: Promise<void> | null = null;

export function Console({ store, user, onSignOut, getToken }: {
  store: Store; user: User | null; onSignOut?: () => void; getToken: TokenGetter;
}) {
  const [loaded, setLoaded] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [baseLinks, setBaseLinks] = useState<BaseLink[]>([]);
  const [opts, setOpts] = useState<Option[]>([]);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [workshopDialog, setWorkshopDialog] = useState(false);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [allLinks, setAllLinks] = useState<LinkRow[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [tab, setTab] = useState<Tab>("links");
  const [bitlyReady, setBitlyReady] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: "ok" | "err" }[]>([]);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [rowDialog, setRowDialog] = useState<{ row?: LinkRow; date?: string } | null>(null);
  const [qrRow, setQrRow] = useState<LinkRow | null>(null);
  const [baseDialog, setBaseDialog] = useState(false);
  const [campaignDialog, setCampaignDialog] = useState<{ campaign?: Campaign } | null>(null);
  const [importMode, setImportMode] = useState<ImportMode | null>(null);
  const [txLinkFilter, setTxLinkFilter] = useState<string | null>(null);
  const switcherRef = useRef<HTMLDivElement>(null);

  const toast = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "err" ? 7000 : 3200);
  }, []);

  // ---- loading ------------------------------------------------------------
  const loadShared = useCallback(async () => {
    // first run: seed base links and vocabulary (once per page load, even if effects run twice)
    seeding ??= (async () => {
      const s = await store.loadShared();
      try {
        if (!s.baseLinks.length) {
          for (const b of DEFAULT_BASE_LINKS) await store.saveBaseLink({ ...b, id: newId() });
        }
        if (!s.options.length) {
          const seed: Option[] = [];
          (Object.keys(DEFAULT_OPTIONS) as OptionKind[]).forEach((kind) =>
            DEFAULT_OPTIONS[kind].forEach((label) => seed.push({ id: newId(), kind, label })));
          await store.saveOptions(seed);
        }
        if (!s.workshops.length) {
          for (const w of DEFAULT_WORKSHOPS) await store.saveWorkshop({ ...w, id: newId() });
        }
      } catch {
        // a teammate seeded at the same moment — the unique constraints stopped the duplicate
      }
    })();
    await seeding;
    const shared = await store.loadShared();
    setCampaigns(shared.campaigns);
    setBaseLinks(shared.baseLinks);
    setOpts(shared.options);
    setWorkshops(shared.workshops);
    return shared;
  }, [store]);

  useEffect(() => {
    (async () => {
      try {
        const shared = await loadShared();
        const last = typeof localStorage !== "undefined" ? localStorage.getItem(LAST_KEY) : null;
        const pick = shared.campaigns.find((c) => c.id === last && !c.archived) ?? shared.campaigns.find((c) => !c.archived);
        setCampaignId(pick?.id ?? null);
      } catch (e) {
        toast(`Couldn't load: ${(e as Error).message}`, "err");
      } finally {
        setLoaded(true);
      }
    })();
    bitlyConfigured().then(setBitlyReady);
  }, [loadShared, toast]);

  const loadCampaignData = useCallback(async (id: string) => {
    const [l, s, a] = await Promise.all([store.loadLinks(id), store.loadSales(id), store.loadApplicants(id)]);
    setAllLinks(l);
    setSales(s);
    setApplicants(a);
  }, [store]);

  useEffect(() => {
    if (!campaignId) { setAllLinks([]); setSales([]); setApplicants([]); return; }
    setTab((t) => (t === "applicants" ? "links" : t));
    localStorage.setItem(LAST_KEY, campaignId);
    setTxLinkFilter(null);
    loadCampaignData(campaignId).catch((e) => toast(`Couldn't load links: ${e.message}`, "err"));
  }, [campaignId, loadCampaignData, toast]);

  // pick up teammates' changes when the tab regains focus
  useEffect(() => {
    if (store.mode !== "supabase") return;
    const onFocus = () => {
      loadShared().catch(() => {});
      if (campaignId) loadCampaignData(campaignId).catch(() => {});
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [store, campaignId, loadShared, loadCampaignData]);

  useEffect(() => {
    if (!switcherOpen) return;
    const close = (e: MouseEvent) => { if (!switcherRef.current?.contains(e.target as Node)) setSwitcherOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [switcherOpen]);

  // ---- derived -------------------------------------------------------------
  const campaign = campaigns.find((c) => c.id === campaignId) ?? null;
  const verticalBases = useMemo(
    () => (campaign ? baseLinks.filter((b) => b.vertical === campaign.vertical) : []),
    [baseLinks, campaign],
  );
  const options = useMemo(() => {
    const o: Record<OptionKind, string[]> = { type: [], platform: [], channel: [], owner: [] };
    for (const x of opts) if (!o[x.kind].includes(x.label)) o[x.kind].push(x.label);
    return o;
  }, [opts]);
  const links = useMemo(() => allLinks.filter((l) => !l.removed_at), [allLinks]);
  const removed = useMemo(() => allLinks.filter((l) => l.removed_at), [allLinks]);
  const longOf = useCallback((r: LinkRow) => (campaign ? longLinkFor(r, campaign, baseLinks, workshops) : null), [campaign, baseLinks, workshops]);
  const applicantSources = useMemo(() => attributeApplicants(applicants, allLinks, workshops), [applicants, allLinks, workshops]);
  const attribution = useMemo(
    () => (campaign
      ? withApplicantWorkshops(attribute(sales, allLinks, campaign, workshops), sales, applicants, applicantSources)
      : { bySale: new Map(), byLink: new Map(), workshopBySale: new Map() }),
    [sales, allLinks, campaign, workshops, applicants, applicantSources],
  );
  const stats = useMemo(() => {
    const shortened = links.filter((l) => l.short_url).length;
    const posted = links.filter((l) => linkStatus(l) === "posted").length;
    const outdated = links.filter((l) => isShortOutdated(l, longOf(l)));
    const noBase = links.filter((l) => !longOf(l)).length;
    return { shortened, posted, outdated, noBase };
  }, [links, longOf]);

  // ---- actions -------------------------------------------------------------
  const saveRows = useCallback(async (rows: LinkRow[]) => {
    if (!rows.length) return;
    setAllLinks((prev) => {
      const map = new Map(prev.map((r) => [r.id, r]));
      rows.forEach((r) => map.set(r.id, r));
      return [...map.values()];
    });
    try {
      await store.saveLinks(rows);
    } catch (e) {
      toast(`Not saved: ${(e as Error).message}`, "err");
      if (campaignId) loadCampaignData(campaignId);
    }
  }, [store, toast, campaignId, loadCampaignData]);

  const addOption = useCallback((kind: OptionKind, label: string) => {
    if (opts.some((o) => o.kind === kind && o.label.toLowerCase() === label.toLowerCase())) return;
    const o = { id: newId(), kind, label };
    setOpts((p) => [...p, o]);
    store.saveOptions([o]).catch((e) => toast(`Couldn't save "${label}": ${e.message}`, "err"));
  }, [opts, store, toast]);

  const withBusy = async (ids: string[], fn: () => Promise<void>) => {
    setBusy((b) => new Set([...b, ...ids]));
    try { await fn(); } finally {
      setBusy((b) => { const n = new Set(b); ids.forEach((i) => n.delete(i)); return n; });
    }
  };

  const shorten = useCallback(async (rows: LinkRow[]) => {
    if (!bitlyReady) { toast("Bitly isn't set up yet — shorten in Bitly and paste the link in the Short link cell.", "err"); return; }
    const todo = rows.filter((r) => longOf(r));
    if (!todo.length) { toast("Pick a base link first — these rows have no long link yet.", "err"); return; }
    await withBusy(todo.map((r) => r.id), async () => {
      const done: LinkRow[] = [];
      for (const r of todo) {
        const long = longOf(r)!;
        try {
          const short = await shortenLink(long, getToken);
          done.push({ ...r, short_url: short, short_target: long });
        } catch (e) {
          toast(`Bitly: ${(e as Error).message}`, "err");
          break;
        }
      }
      await saveRows(done);
      if (done.length) toast(`Shortened ${done.length} link${done.length > 1 ? "s" : ""}`);
    });
  }, [bitlyReady, longOf, getToken, saveRows, toast]);

  const repoint = useCallback(async (rows: LinkRow[]) => {
    const todo = rows.filter((r) => isShortOutdated(r, longOf(r)));
    if (!todo.length) return;
    if (!bitlyReady) {
      toast("Bitly isn't connected — update these in Bitly by hand, then press 'Mark updated'.", "err");
      return;
    }
    await withBusy(todo.map((r) => r.id), async () => {
      const done: LinkRow[] = [];
      for (const r of todo) {
        const long = longOf(r)!;
        try {
          await repointLink(r.short_url!, long, getToken);
          done.push({ ...r, short_target: long });
        } catch (e) {
          toast(`Bitly couldn't re-point ${displayUrl(r.short_url)}: ${(e as Error).message}. Editing a destination needs a paid Bitly plan — use “New short link” instead.`, "err");
          break;
        }
      }
      await saveRows(done);
      if (done.length) toast(`Re-pointed ${done.length} short link${done.length > 1 ? "s" : ""} to the new base link`);
    });
  }, [bitlyReady, longOf, getToken, saveRows, toast]);

  const remove = useCallback((row: LinkRow) => {
    saveRows([{ ...row, removed_at: new Date().toISOString() }]);
  }, [saveRows]);

  const undoRemoved = () => saveRows(removed.map((r) => ({ ...r, removed_at: null })));

  const saveCampaign = async (c: Campaign) => {
    setCampaigns((p) => (p.some((x) => x.id === c.id) ? p.map((x) => (x.id === c.id ? c : x)) : [...p, c]));
    try {
      await store.saveCampaign(c);
    } catch (e) {
      toast(`Cohort not saved: ${(e as Error).message}`, "err");
      loadShared();
    }
  };

  const saveBaseLink = async (b: BaseLink) => {
    setBaseLinks((p) => (p.some((x) => x.id === b.id) ? p.map((x) => (x.id === b.id ? b : x)) : [...p, b]));
    try { await store.saveBaseLink(b); } catch (e) { toast(`Base link not saved: ${(e as Error).message}`, "err"); loadShared(); }
  };
  const deleteBaseLink = async (id: string) => {
    setBaseLinks((p) => p.filter((x) => x.id !== id));
    setCampaigns((p) => p.map((c) => (c.default_base_link_id === id ? { ...c, default_base_link_id: null } : c)));
    setAllLinks((p) => p.map((l) => (l.base_link_id === id ? { ...l, base_link_id: null } : l)));
    try { await store.deleteBaseLink(id); } catch (e) { toast(`Couldn't delete: ${(e as Error).message}`, "err"); loadShared(); }
  };

  const saveWorkshop = async (w: Workshop) => {
    setWorkshops((p) => (p.some((x) => x.id === w.id) ? p.map((x) => (x.id === w.id ? w : x)) : [w, ...p]));
    try { await store.saveWorkshop(w); } catch (e) { toast(`Workshop not saved: ${(e as Error).message}`, "err"); loadShared(); }
  };
  const deleteWorkshop = async (id: string) => {
    setWorkshops((p) => p.filter((x) => x.id !== id));
    setAllLinks((p) => p.map((l) => (l.workshop_id === id ? { ...l, workshop_id: null } : l)));
    try { await store.deleteWorkshop(id); } catch (e) { toast(`Couldn't delete: ${(e as Error).message}`, "err"); loadShared(); }
  };

  const saveApplicant = useCallback(async (a: Applicant) => {
    setApplicants((p) => p.map((x) => (x.id === a.id ? a : x)));
    try { await store.saveApplicant(a); } catch (e) {
      toast(`Not saved: ${(e as Error).message}`, "err");
      if (campaignId) loadCampaignData(campaignId);
    }
  }, [store, toast, campaignId, loadCampaignData]);

  const importApplicants = async (rows: ApplicantForm[]) => {
    if (!campaign) return;
    await store.importApplicants(rows);
    setApplicants(await store.loadApplicants(campaign.id));
  };

  const importSales = async (rows: Sale[], kind: SaleKind, replace: boolean) => {
    if (!campaign) return;
    if (replace) await store.clearSales(campaign.id, kind);
    await store.saveSales(rows);
    setSales(await store.loadSales(campaign.id));
  };

  const exportCsv = () => {
    if (!campaign) return;
    const data = [...links].sort((a, b) => a.post_date.localeCompare(b.post_date)).map((r) => {
      const base = resolveBase(r, campaign, baseLinks);
      return {
        date: r.post_date, type: r.type, platform: r.platform, channel: r.channel, tag: r.tag, owner: r.owner ?? "",
        workshop: workshopOf(r, workshops)?.name ?? "", src: usesSrc(campaign) ? srcFor(r, workshops) : "",
        organic_or_paid: r.paid ? "Paid" : "Organic",
        base_link: base && base.via !== "custom" ? base.label : "", custom_url: r.custom_url ?? "",
        long_link: longOf(r) ?? "", short_link: r.short_url ?? "", published_link: r.published_url ?? "",
        status: linkStatus(r), notes: r.notes ?? "",
      };
    });
    download(`${campaign.slug}-utm-console.csv`, toCsv(data, [...LINK_COLUMNS]));
  };

  // ---- render --------------------------------------------------------------
  if (!loaded) return <div className="center muted">Loading console…</div>;

  const defaultBase = campaign ? verticalBases.find((b) => b.id === campaign.default_base_link_id) ?? null : null;
  const vName = (v: string) => VERTICALS.find((x) => x.id === v)?.name ?? v;

  const ctx: Ctx | null = campaign && {
    store, campaign, baseLinks, verticalBases, options, workshops, links, sales, applicants, applicantSources,
    attribution, longOf, bitlyReady, busy, saveRows, addOption, shorten, repoint, remove, toast, saveApplicant,
    openWorkshops: () => setWorkshopDialog(true),
    openRow: (row, date) => setRowDialog({ row, date }),
    openQr: setQrRow,
    openBaseLinks: () => setBaseDialog(true),
    openImport: setImportMode,
    showTransactionsFor: (id) => { setTxLinkFilter(id); setTab("transactions"); },
    txLinkFilter, setTxLinkFilter,
  };

  return (
    <div className="app">
      <header className="top">
        <div className="brand" ref={switcherRef}>
          <div className="logo">K</div>
          <button className="switcher" onClick={() => setSwitcherOpen((o) => !o)} aria-expanded={switcherOpen}>
            <span className="switcher-name">{campaign ? campaign.name : "No cohort yet"}</span>
            <span className="switcher-sub">
              {campaign ? `${vName(campaign.vertical)} · ${hostOf(defaultBase?.url) || "base link not set"}` : "Create one to start"}
            </span>
            <span className="caret">▾</span>
          </button>
          {switcherOpen && (
            <div className="menu">
              {VERTICALS.map((v) => {
                const list = campaigns.filter((c) => c.vertical === v.id && (showArchived || !c.archived));
                return (
                  <div key={v.id} className="menu-group">
                    <div className="menu-head">{v.name}</div>
                    {list.length === 0 && <div className="menu-empty">No cohorts</div>}
                    {list.map((c) => (
                      <button key={c.id} className={`menu-item ${c.id === campaignId ? "on" : ""}`}
                        onClick={() => { setCampaignId(c.id); setSwitcherOpen(false); }}>
                        <span>{c.name}{c.archived && <em className="muted"> · archived</em>}</span>
                        <span className="mono muted small">{c.slug}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
              <div className="menu-foot">
                <button className="btn small primary" onClick={() => { setCampaignDialog({}); setSwitcherOpen(false); }}>+ New cohort</button>
                {campaign && <button className="btn small" onClick={() => { setCampaignDialog({ campaign }); setSwitcherOpen(false); }}>Edit this cohort</button>}
                <label className="small muted check"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>
              </div>
            </div>
          )}
        </div>

        <nav className="tabs" role="tablist">
          {([["links", "All links"], ["calendar", "Calendar"], ...(campaign?.vertical === "bootcamp" ? [["applicants", `Applicants${applicants.length ? ` · ${applicants.length}` : ""}`]] : []), ["sales", "Sales"], ["transactions", "Transactions"]] as [Tab, string][]).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={`tab ${tab === id ? "on" : ""}`} onClick={() => setTab(id)} disabled={!campaign}>{label}</button>
          ))}
        </nav>

        <div className="top-right">
          <button className="btn primary big" onClick={() => setRowDialog({})} disabled={!campaign}>+ Add row</button>
          {user ? (
            <div className="user">
              <span className="avatar">{(user.name || user.email)[0]?.toUpperCase()}</span>
              <span className="user-name">{user.name || user.email}</span>
              <button className="btn small" onClick={onSignOut}>Sign out</button>
            </div>
          ) : (
            <span className="pill warn" title="No Supabase keys found. Data stays in this browser.">Local demo</span>
          )}
        </div>
      </header>

      <div className="status-line small muted">
        <span><i className={`dot ${store.mode === "supabase" ? "ok" : "warn"}`} />{store.mode === "supabase" ? "Shared with the team" : "Demo mode — saved in this browser only"}</span>
        <span><i className={`dot ${bitlyReady ? "ok" : "warn"}`} />{bitlyReady ? "Bitly connected" : "Bitly not connected — paste short links by hand"}</span>
      </div>

      {!campaign ? (
        <Empty title="Start with a cohort">
          <p className="muted">Each vertical (AI Course, Creator Bootcamp) is split into cohorts or launches. A cohort&apos;s slug becomes <span className="mono">utm_campaign</span>; its base link can be chosen now or later.</p>
          <button className="btn primary" onClick={() => setCampaignDialog({})}>+ New cohort</button>
        </Empty>
      ) : (
        <>
          <section className="summary">
            <div className="card base-card">
              <div className="base-main">
                <div className="field-label">Default base link</div>
                {defaultBase ? (
                  <div>
                    <strong>{defaultBase.label}</strong>{" "}
                    <a className="mono small" href={defaultBase.url} target="_blank" rel="noreferrer">{displayUrl(defaultBase.url)}</a>
                  </div>
                ) : (
                  <div className="warn-text">Not chosen yet — rows save fine, links generate once you pick one.</div>
                )}
                <p className="muted small">Rows follow this unless they pick another base link or a custom URL. Change it any time; long links update everywhere.</p>
                {bootcampBaseWarning(campaign, defaultBase?.url) && <p className="small warn-text">{bootcampBaseWarning(campaign, defaultBase?.url)}</p>}
              </div>
              <div className="base-actions">
                <button className="btn" onClick={() => setBaseDialog(true)}>{defaultBase ? "Change base link" : "Choose base link"}</button>
                <button className="btn" onClick={() => setWorkshopDialog(true)}>Workshops</button>
                <button className="btn" onClick={exportCsv}>Export CSV</button>
                <button className="btn" onClick={() => setImportMode("links")}>Import CSV</button>
                <button className="btn" title={campaign.archived ? "Bring back into the switcher" : "Take this cohort out of the switcher. Nothing is deleted and links keep working."}
                  onClick={() => saveCampaign({ ...campaign, archived: !campaign.archived })}>{campaign.archived ? "Unarchive" : "Archive"}</button>
              </div>
            </div>
            <div className="card stats">
              <div><div className="field-label">Shortened</div><div className="stat mono">{stats.shortened} / {links.length}</div></div>
              <div><div className="field-label">Published captured</div><div className="stat mono">{stats.posted} / {links.length}</div></div>
              {stats.outdated.length > 0 && (
                <div className="stat-warn">
                  <div className="field-label">Short links on an old URL</div>
                  <div className="stat mono">{stats.outdated.length}</div>
                  <button className="btn small primary" onClick={() => repoint(stats.outdated)}>Re-point all</button>
                </div>
              )}
              {stats.noBase > 0 && (
                <div className="stat-warn">
                  <div className="field-label">Waiting for a base link</div>
                  <div className="stat mono">{stats.noBase}</div>
                </div>
              )}
            </div>
          </section>

          {removed.length > 0 && tab === "links" && (
            <div className="banner">
              <span>{removed.length} row{removed.length > 1 ? "s" : ""} removed from this cohort — still recoverable.</span>
              <button className="btn small" onClick={undoRemoved}>Undo all</button>
            </div>
          )}

          {ctx && tab === "links" && <LinksTab ctx={ctx} />}
          {ctx && tab === "calendar" && <CalendarTab ctx={ctx} />}
          {ctx && tab === "applicants" && <ApplicantsTab ctx={ctx} />}
          {ctx && tab === "sales" && <SalesTab ctx={ctx} />}
          {ctx && tab === "transactions" && <TransactionsTab ctx={ctx} />}
        </>
      )}

      {ctx && rowDialog && (
        <RowDialog ctx={ctx} row={rowDialog.row} date={rowDialog.date} user={user} onClose={() => setRowDialog(null)} />
      )}
      {ctx && qrRow && <QrDialog ctx={ctx} row={qrRow} onClose={() => setQrRow(null)} />}
      {campaign && baseDialog && (
        <BaseLinksDialog
          campaign={campaign} baseLinks={verticalBases} links={allLinks} campaigns={campaigns}
          onSaveBase={saveBaseLink} onDeleteBase={deleteBaseLink} onSaveCampaign={saveCampaign}
          onClose={() => setBaseDialog(false)} toast={toast}
        />
      )}
      {campaignDialog && (
        <CampaignDialog
          campaign={campaignDialog.campaign} campaigns={campaigns} baseLinks={baseLinks}
          onSave={async (c) => { await saveCampaign(c); setCampaignId(c.id); }}
          onClose={() => setCampaignDialog(null)}
        />
      )}
      {ctx && importMode && (
        <ImportDialog ctx={ctx} mode={importMode} user={user} onImportSales={importSales} onImportApplicants={importApplicants} onClose={() => setImportMode(null)} />
      )}
      {workshopDialog && (
        <WorkshopsDialog workshops={workshops} links={allLinks} onSave={saveWorkshop} onDelete={deleteWorkshop} onClose={() => setWorkshopDialog(false)} toast={toast} />
      )}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.msg}</div>)}
      </div>
    </div>
  );
}
