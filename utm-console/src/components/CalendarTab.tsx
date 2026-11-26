"use client";

import { useMemo, useState } from "react";
import type { LinkRow } from "@/lib/types";
import { displayUrl, isShortOutdated } from "@/lib/utm";
import type { Ctx } from "./Console";
import { StatusPill } from "./LinksTab";
import { fmtDay, monthGrid, ownerColor, todayIso } from "./ui";

export function CalendarTab({ ctx }: { ctx: Ctx }) {
  const { links, campaign } = ctx;
  const first = useMemo(() => [...links].map((l) => l.post_date).sort()[0], [links]);
  const startIso = first ?? campaign.start_date ?? todayIso();
  const [view, setView] = useState(() => { const [y, m] = startIso.split("-").map(Number); return { y, m: m - 1 }; });
  const [day, setDay] = useState<string>(startIso);

  const byDay = useMemo(() => {
    const m = new Map<string, LinkRow[]>();
    for (const l of links) { const a = m.get(l.post_date) ?? []; a.push(l); m.set(l.post_date, a); }
    return m;
  }, [links]);
  const owners = useMemo(() => [...new Set(links.map((l) => l.owner ?? "Unassigned"))].sort(), [links]);
  const today = todayIso();
  const dayRows = byDay.get(day) ?? [];
  const terms = [...new Set(dayRows.map((r) => r.tag).filter(Boolean))].join(", ");

  return (
    <section className="cal-layout">
      <div className="card cal">
        <div className="cal-head">
          <div className="cal-nav">
            <button className="btn tiny" onClick={() => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))} aria-label="Previous month">‹</button>
            <h3>{new Date(view.y, view.m, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</h3>
            <button className="btn tiny" onClick={() => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))} aria-label="Next month">›</button>
          </div>
          <div className="cal-legend small">
            {owners.map((o) => <span key={o}><i className="odot" style={{ background: ownerColor(o === "Unassigned" ? null : o) }} />{o}</span>)}
          </div>
        </div>
        <div className="cal-grid">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="dow">{d}</div>)}
          {monthGrid(view.y, view.m).map((d, i) => {
            if (!d) return <div key={i} className="cal-cell pad" />;
            const rows = byDay.get(d) ?? [];
            const perOwner = new Map<string, number>();
            rows.forEach((r) => perOwner.set(r.owner ?? "Unassigned", (perOwner.get(r.owner ?? "Unassigned") ?? 0) + 1));
            const toShorten = rows.filter((r) => !r.short_url && !r.used_long).length;
            const stale = rows.filter((r) => isShortOutdated(r, ctx.longOf(r))).length;
            return (
              <button key={d} className={`cal-cell ${d === day ? "on" : ""} ${d === today ? "today" : ""}`} onClick={() => setDay(d)}>
                <div className="cal-date"><span>{Number(d.slice(8))}</span>{rows.length > 0 && <span className="muted">{rows.length}</span>}</div>
                {[...perOwner.entries()].map(([o, n]) => (
                  <span key={o} className="cal-chip" style={{ background: ownerColor(o === "Unassigned" ? null : o) }}>{o} · {n}</span>
                ))}
                {toShorten > 0 && <span className="cal-note">{toShorten} to shorten</span>}
                {stale > 0 && <span className="cal-note warn-text">{stale} on old URL</span>}
              </button>
            );
          })}
        </div>
      </div>

      <aside className="card day-panel">
        <div className="field-label">{fmtDay(day, { weekday: "short", month: "short", day: "numeric" })}{terms && ` · ${terms}`}</div>
        <p className="small muted">{dayRows.length ? `${dayRows.length} row${dayRows.length > 1 ? "s share" : " shares"} utm_term ${day}, so the day reads as one push in reporting.` : "Nothing planned."}</p>
        <button className="btn small primary" onClick={() => ctx.openRow(undefined, day)}>+ Add row on this day</button>
        <div className="day-list">
          {dayRows.map((r) => (
            <div className="day-item" key={r.id}>
              <div className="day-item-head">
                <strong>{r.type} · {r.platform}</strong>
                <StatusPill row={r} />
              </div>
              <div className="mono small muted">{r.channel}{r.tag && ` · ${r.tag}`}</div>
              <div className="day-item-foot">
                <span className="mono small">{r.short_url ? displayUrl(r.short_url) : <span className="muted">not shortened yet</span>}</span>
                <span>
                  {ctx.longOf(r) && <button className="btn tiny" onClick={() => ctx.openQr(r)}>QR</button>}
                  <button className="btn tiny" onClick={() => ctx.openRow(r)}>Edit</button>
                </span>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </section>
  );
}
