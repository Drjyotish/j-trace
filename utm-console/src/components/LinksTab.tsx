"use client";

import { useMemo, useState } from "react";
import type { LinkRow } from "@/lib/types";
import { displayUrl, isShortOutdated, linkStatus, normaliseUrl, resolveBase, rowUtm, srcFor, usesSrc, workshopOf } from "@/lib/utm";
import type { Ctx } from "./Console";
import { copy, Empty, fmtDay, ownerColor } from "./ui";

const STATUS_LABEL = { brief: "In brief", ready: "Ready", posted: "Posted" } as const;

export function StatusPill({ row }: { row: LinkRow }) {
  const s = linkStatus(row);
  return <span className={`pill st-${s}`}>{STATUS_LABEL[s]}</span>;
}

export function ShortCell({ ctx, row }: { ctx: Ctx; row: LinkRow }) {
  const long = ctx.longOf(row);
  const busy = ctx.busy.has(row.id);
  const [draft, setDraft] = useState("");
  if (!long) {
    return <button className="btn small ghost" onClick={ctx.openBaseLinks} title="Choose a base link for this cohort, or give this row its own">Needs base link</button>;
  }
  if (row.short_url) {
    const outdated = isShortOutdated(row, long);
    return (
      <div className="short">
        <button className={`linkish mono ${outdated ? "strike" : ""}`} title={`Copy ${row.short_url}${outdated ? `\nStill points at the old URL:\n${row.short_target}` : ""}`}
          onClick={async () => ctx.toast((await copy(row.short_url!)) ? "Short link copied" : "Couldn't copy")}>
          {displayUrl(row.short_url)}
        </button>
        {outdated && (
          <div className="outdated">
            <span className="pill warn" title={`Points at ${row.short_target}`}>old URL</span>
            <button className="btn tiny" disabled={busy} onClick={() => ctx.repoint([row])} title="Change where this bit.ly goes (needs a paid Bitly plan)">Re-point</button>
            <button className="btn tiny" disabled={busy} onClick={() => ctx.shorten([row])} title="Make a fresh bit.ly for the new URL. The old one keeps going to the old URL.">New</button>
            <button className="btn tiny ghost" onClick={() => ctx.saveRows([{ ...row, short_target: long }])} title="I already changed it in Bitly">Mark updated</button>
          </div>
        )}
      </div>
    );
  }
  if (ctx.bitlyReady) {
    return <button className="btn small gen" disabled={busy} onClick={() => ctx.shorten([row])}>{busy ? "Shortening…" : "Generate"}</button>;
  }
  const save = () => {
    const u = normaliseUrl(draft);
    if (!draft.trim()) return;
    if (!u) { ctx.toast("That doesn't look like a link", "err"); return; }
    ctx.saveRows([{ ...row, short_url: u, short_target: long }]);
    setDraft("");
  };
  return (
    <input className="cell-input mono" placeholder="Paste bit.ly" value={draft} onChange={(e) => setDraft(e.target.value)}
      onBlur={save} onKeyDown={(e) => e.key === "Enter" && save()} />
  );
}

export function PublishedCell({ ctx, row }: { ctx: Ctx; row: LinkRow }) {
  const [draft, setDraft] = useState("");
  if (row.published_url) {
    return (
      <div className="pub">
        <a className="mono small" href={row.published_url} target="_blank" rel="noreferrer" title={row.published_url}>{displayUrl(row.published_url)}</a>
        <button className="btn tiny ghost" title="Clear" onClick={() => ctx.saveRows([{ ...row, published_url: null }])}>×</button>
      </div>
    );
  }
  if (row.used_long) {
    return (
      <div className="pub">
        <span className="small muted">Used the long link</span>
        <button className="btn tiny ghost" title="Undo" onClick={() => ctx.saveRows([{ ...row, used_long: false }])}>×</button>
      </div>
    );
  }
  const save = () => {
    if (!draft.trim()) return;
    const u = normaliseUrl(draft);
    if (!u) { ctx.toast("That doesn't look like a link", "err"); return; }
    ctx.saveRows([{ ...row, published_url: u }]);
    setDraft("");
  };
  return (
    <div className="pub">
      <input className="cell-input mono" placeholder="Paste post link" value={draft} onChange={(e) => setDraft(e.target.value)}
        onBlur={save} onKeyDown={(e) => e.key === "Enter" && save()} />
      {!row.short_url && ctx.longOf(row) && (
        <button className="btn tiny ghost" onClick={() => ctx.saveRows([{ ...row, used_long: true }])} title="Mark posted without a short link">I used the long link</button>
      )}
    </div>
  );
}

type StatusFilter = "all" | "brief" | "ready" | "posted" | "outdated" | "nobase";

export function LinksTab({ ctx }: { ctx: Ctx }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [owner, setOwner] = useState("");
  const [platform, setPlatform] = useState("");
  const [workshop, setWorkshop] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const { campaign, links } = ctx;
  const bootcamp = usesSrc(campaign);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return links.filter((r) => {
      const long = ctx.longOf(r);
      if (status === "outdated" && !isShortOutdated(r, long)) return false;
      if (status === "nobase" && long) return false;
      if (["brief", "ready", "posted"].includes(status) && linkStatus(r) !== status) return false;
      if (owner && (r.owner ?? "__none__") !== owner) return false;
      if (platform && r.platform !== platform) return false;
      if (workshop && (r.workshop_id ?? "__none__") !== workshop) return false;
      if (!needle) return true;
      return [r.type, r.platform, r.channel, r.tag, r.owner, long, r.short_url, r.published_url, r.notes]
        .some((v) => (v ?? "").toLowerCase().includes(needle));
    });
  }, [links, q, status, owner, platform, workshop, ctx]);

  const groups = useMemo(() => {
    const m = new Map<string, LinkRow[]>();
    for (const r of [...filtered].sort((a, b) => a.post_date.localeCompare(b.post_date) || (a.created_at ?? "").localeCompare(b.created_at ?? ""))) {
      const arr = m.get(r.post_date) ?? [];
      arr.push(r);
      m.set(r.post_date, arr);
    }
    return [...m.entries()];
  }, [filtered]);

  // rows that share a UTM can't be told apart in Sales
  const dupes = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of links) {
      const u = rowUtm(r, campaign, ctx.workshops);
      const k = `${u.utm_source}|${u.utm_content}|${u.utm_term}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    return seen;
  }, [links, campaign]);

  const owners = [...new Set(links.map((l) => l.owner ?? "__none__"))];
  const platforms = [...new Set(links.map((l) => l.platform))].sort();

  if (!links.length) {
    return (
      <Empty title="No links yet">
        <p className="muted">Add a row per post, story, broadcast or bio. The long UTM link is built from the cohort&apos;s base link — which you can choose or change later.</p>
        <button className="btn primary" onClick={() => ctx.openRow()}>+ Add row</button>
      </Empty>
    );
  }

  return (
    <section>
      <div className="toolbar">
        <input className="search" type="search" placeholder="Search long, short or published links, channel, tag…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Status">
          <option value="all">Any status</option>
          <option value="brief">In brief</option>
          <option value="ready">Ready</option>
          <option value="posted">Posted</option>
          <option value="outdated">Short link on old URL</option>
          <option value="nobase">Waiting for base link</option>
        </select>
        <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner">
          <option value="">Any owner</option>
          {owners.map((o) => <option key={o} value={o}>{o === "__none__" ? "Unassigned" : o}</option>)}
        </select>
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Platform">
          <option value="">Any platform</option>
          {platforms.map((p) => <option key={p}>{p}</option>)}
        </select>
        {ctx.workshops.length > 0 && (
          <select value={workshop} onChange={(e) => setWorkshop(e.target.value)} aria-label="Workshop">
            <option value="">Any workshop</option>
            <option value="__none__">Not from a workshop</option>
            {ctx.workshops.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        )}
        <span className="legend mono small muted">Platform=source · Organic/Paid=medium · Cohort=campaign · Channel+Type+Tag=content · Date=term</span>
      </div>

      {groups.length === 0 && <p className="muted pad">Nothing matches those filters.</p>}

      {groups.map(([date, rows]) => {
        const tags = [...new Set(rows.map((r) => r.tag).filter(Boolean))].slice(0, 3).join(", ");
        const toShorten = rows.filter((r) => !r.short_url && !r.used_long && ctx.longOf(r));
        const isCollapsed = collapsed.has(date);
        return (
          <div className="group card" key={date}>
            <div className="group-head">
              <button className="group-toggle" onClick={() => setCollapsed((c) => { const n = new Set(c); if (n.has(date)) n.delete(date); else n.add(date); return n; })}>
                <span className="caret">{isCollapsed ? "▸" : "▾"}</span>
                <strong>{fmtDay(date, { weekday: "short", month: "short", day: "numeric" })}</strong>
                {tags && <span className="muted"> · {tags}</span>}
                <span className="pill">{rows.length} row{rows.length > 1 ? "s" : ""}</span>
              </button>
              <div className="group-actions">
                <span className="small muted">{rows.filter((r) => linkStatus(r) === "posted").length} posted · {rows.filter((r) => r.short_url).length} shortened</span>
                {ctx.bitlyReady && toShorten.length > 0 && (
                  <button className="btn small primary" onClick={() => ctx.shorten(toShorten)}>Shorten all ({toShorten.length})</button>
                )}
                <button className="btn small" onClick={() => ctx.openRow(undefined, date)}>+ Row on this day</button>
              </div>
            </div>
            {!isCollapsed && (
              <div className="table-wrap">
                <table className="links">
                  <thead>
                    <tr>
                      <th>Type</th><th>Platform</th><th>Channel</th><th>Tag</th><th>Workshop</th>{bootcamp && <th>src</th>}<th>Owner</th><th>Org / Paid</th>
                      <th>Base link</th><th>Long link</th><th>Short link</th><th>Published link</th><th>Status</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const long = ctx.longOf(r);
                      const base = resolveBase(r, campaign, ctx.baseLinks);
                      const u = rowUtm(r, campaign, ctx.workshops);
                      const dup = (dupes.get(`${u.utm_source}|${u.utm_content}|${u.utm_term}`) ?? 0) > 1;
                      return (
                        <tr key={r.id}>
                          <td>{r.type}</td>
                          <td>{r.platform}</td>
                          <td className="nowrap">{r.channel}</td>
                          <td className="mono small">{r.tag || <span className="muted">—</span>}{dup && <span className="pill warn" title="Another row has the same source, content and date — sales can't tell them apart. Change the tag.">same UTM</span>}</td>
                          <td className="small">{workshopOf(r, ctx.workshops)?.name ?? <span className="muted">—</span>}</td>
                          {bootcamp && <td className="mono small nowrap">{srcFor(r, ctx.workshops)}</td>}
                          <td className="nowrap"><i className="odot" style={{ background: ownerColor(r.owner) }} />{r.owner ?? <span className="muted">Unassigned</span>}</td>
                          <td><span className={`pill ${r.paid ? "paid" : "organic"}`}>{r.paid ? "Paid" : "Organic"}</span></td>
                          <td className="small">
                            {base ? (
                              <span title={base.url}>{base.via === "default" ? <span className="muted">Default · </span> : null}{base.label}</span>
                            ) : <span className="warn-text">Not set</span>}
                          </td>
                          <td className="long">
                            {long ? (
                              <button className="linkish mono small" title={`${long}\n\nClick to copy`} onClick={async () => ctx.toast((await copy(long)) ? "Long link copied" : "Couldn't copy")}>
                                {displayUrl(long)}
                              </button>
                            ) : <span className="muted small">—</span>}
                          </td>
                          <td><ShortCell ctx={ctx} row={r} /></td>
                          <td><PublishedCell ctx={ctx} row={r} /></td>
                          <td><StatusPill row={r} /></td>
                          <td className="nowrap row-actions">
                            <button className="btn tiny" onClick={() => ctx.openRow(r)}>Edit</button>
                            {long && <button className="btn tiny" onClick={() => ctx.openQr(r)}>QR</button>}
                            <button className="btn tiny ghost" onClick={() => ctx.remove(r)}>Remove</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
