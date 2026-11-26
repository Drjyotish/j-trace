"use client";

import { useMemo, useState } from "react";
import type { Sale } from "@/lib/types";
import { exGst, inr } from "@/lib/attribution";
import type { Ctx } from "./Console";
import { linkLabel } from "./SalesTab";
import { Empty } from "./ui";

type Filter = "everyone" | "refunded" | "failed" | "coupon" | "leads";

export function TransactionsTab({ ctx }: { ctx: Ctx }) {
  const { sales, attribution, campaign, txLinkFilter, setTxLinkFilter } = ctx;
  const [filter, setFilter] = useState<Filter>("everyone");
  const [source, setSource] = useState("");
  const [q, setQ] = useState("");
  const linkById = useMemo(() => new Map(ctx.links.map((l) => [l.id, l])), [ctx.links]);

  const sources = useMemo(() => {
    const m = new Map<string, number>();
    sales.forEach((s) => m.set(s.utm_source || "__none__", (m.get(s.utm_source || "__none__") ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [sales]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return sales.filter((s) => {
      if (filter === "refunded" && s.status !== "refunded") return false;
      if (filter === "failed" && s.status !== "failed") return false;
      if (filter === "coupon" && !s.coupon) return false;
      if (filter === "leads" && s.kind !== "lead") return false;
      if (source && (s.utm_source || "__none__") !== source) return false;
      if (txLinkFilter) {
        const id = attribution.bySale.get(s.id);
        if (txLinkFilter === "__none__" ? id : id !== txLinkFilter) return false;
      }
      if (!needle) return true;
      return [s.name, s.email, s.phone, s.external_id, s.coupon, s.product, s.utm_source, s.utm_content, s.utm_term]
        .some((v) => (v ?? "").toLowerCase().includes(needle));
    });
  }, [sales, filter, source, q, txLinkFilter, attribution]);

  // one card per person, newest first
  const people = useMemo(() => {
    const m = new Map<string, Sale[]>();
    for (const s of filtered) {
      const k = s.email || s.phone || s.name || s.id;
      const a = m.get(k) ?? [];
      a.push(s);
      m.set(k, a);
    }
    return [...m.values()]
      .map((list) => list.sort((a, b) => (b.occurred_at ?? "").localeCompare(a.occurred_at ?? "")))
      .sort((a, b) => (b[0].occurred_at ?? "").localeCompare(a[0].occurred_at ?? ""));
  }, [filtered]);

  const [limit, setLimit] = useState(60);

  if (!sales.length) {
    return (
      <Empty title="No transactions yet">
        <div className="row-gap">
          <button className="btn primary" onClick={() => ctx.openImport("purchase")}>Import purchases CSV</button>
          <button className="btn" onClick={() => ctx.openImport("lead")}>Import invite requests CSV</button>
        </div>
      </Empty>
    );
  }

  const linkFilterLabel = txLinkFilter === "__none__" ? "Not attributed" : txLinkFilter && linkById.get(txLinkFilter) ? linkLabel(linkById.get(txLinkFilter)!) : null;

  return (
    <section>
      <div className="toolbar">
        <div className="seg">
          {([["everyone", "Everyone"], ["refunded", "Refunded"], ["failed", "Failed payment"], ["coupon", "Used a coupon"], ["leads", "Invite requests"]] as [Filter, string][]).map(([id, label]) => (
            <button key={id} className={filter === id ? "on" : ""} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
        <select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Source">
          <option value="">Any source</option>
          {sources.map(([s, n]) => <option key={s} value={s}>{s === "__none__" ? "No UTM" : s} ({n})</option>)}
        </select>
        <input className="search" type="search" placeholder="Search name, email, phone, order id, coupon, UTM…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="small muted">{people.length} people · {filtered.length} records</span>
      </div>
      {linkFilterLabel && (
        <div className="banner info">
          <span>Showing people who came through <strong>{linkFilterLabel}</strong></span>
          <button className="btn small" onClick={() => setTxLinkFilter(null)}>Show everyone</button>
        </div>
      )}

      <div className="people">
        {people.slice(0, limit).map((list) => {
          const p = list[0];
          const ok = list.filter((s) => s.status === "success" && s.kind === "purchase");
          const paid = ok.reduce((a, s) => a + (s.amount ?? 0), 0);
          return (
            <div className="card person" key={p.id}>
              <div className="person-head">
                <div>
                  <strong>{p.name || "—"}</strong>
                  <div className="mono small muted">{[p.email, p.phone, p.country].filter(Boolean).join(" · ")}</div>
                </div>
                {ok.length > 0 && (
                  <div className="person-money">
                    <div><div className="mono accent">{inr(ok.reduce((a, s) => a + exGst(s.amount, campaign.gst_rate), 0))}</div><div className="small muted">revenue, ex-GST</div></div>
                    <div><div className="mono">{inr(paid)}</div><div className="small muted">paid incl. GST</div></div>
                  </div>
                )}
              </div>
              {list.map((s) => {
                const lid = attribution.bySale.get(s.id);
                const link = lid ? linkById.get(lid) : null;
                return (
                  <div className="tx" key={s.id}>
                    <div className="tx-tags">
                      {s.product && <span className="pill accent">{s.product}</span>}
                      {s.kind === "lead" && <span className="pill">Invite request</span>}
                      {s.coupon && <span className="pill">{s.coupon}{s.discount ? ` · −${inr(s.discount)}` : ""}</span>}
                      {s.status === "failed" && <span className="pill bad">Failed</span>}
                      {s.status === "refunded" && <span className="pill warn">Refunded</span>}
                    </div>
                    <div className="tx-tags">
                      {link ? (
                        <button className="pill link" onClick={() => setTxLinkFilter(link.id)}>{link.platform} · {link.channel} · {link.type} <span className="mono">{link.tag}</span></button>
                      ) : s.utm_source || s.utm_content ? (
                        <span className="pill muted-pill mono" title="UTMs don't match any link in this cohort">{[s.utm_source, s.utm_content, s.utm_term].filter(Boolean).join(" · ")}</span>
                      ) : (
                        <span className="pill muted-pill">No UTM</span>
                      )}
                    </div>
                    <div className="tx-foot">
                      <span className="mono small muted">{s.occurred_at ? new Date(s.occurred_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : ""}{s.external_id && !s.external_id.includes("|") ? ` · ${s.external_id}` : ""}</span>
                      {s.amount != null && <span className={`mono ${s.status !== "success" ? "strike muted" : ""}`}>{inr(s.amount)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      {people.length > limit && <div className="center"><button className="btn" onClick={() => setLimit((l) => l + 60)}>Show more ({people.length - limit} left)</button></div>}
    </section>
  );
}
