"use client";

import { useMemo, useState } from "react";
import type { LinkRow, Sale, SaleKind } from "@/lib/types";
import { exGst, inr } from "@/lib/attribution";
import { displayUrl } from "@/lib/utm";
import type { Ctx } from "./Console";
import { Empty } from "./ui";

export function linkLabel(l: LinkRow) {
  return `${l.type} · ${l.platform} · ${l.channel}${l.tag ? ` · ${l.tag}` : ""}`;
}

type CouponFilter = "all" | "coupon" | "nocoupon";

export function SalesTab({ ctx }: { ctx: Ctx }) {
  const { sales, campaign, attribution } = ctx;
  const hasPurchases = sales.some((s) => s.kind === "purchase");
  const hasLeads = sales.some((s) => s.kind === "lead");
  const [kind, setKind] = useState<SaleKind>(hasPurchases || !hasLeads ? "purchase" : "lead");
  const [coupon, setCoupon] = useState<CouponFilter>("all");
  const [product, setProduct] = useState("");

  const ofKind = sales.filter((s) => s.kind === kind);
  const products = [...new Set(ofKind.map((s) => s.product).filter(Boolean))] as string[];
  const scoped = ofKind.filter((s) =>
    (coupon === "all" || (coupon === "coupon" ? !!s.coupon : !s.coupon)) && (!product || s.product === product));
  const ok = scoped.filter((s) => s.status === "success");
  const failed = scoped.filter((s) => s.status === "failed");
  const refunded = scoped.filter((s) => s.status === "refunded");
  const unattributed = ok.filter((s) => !attribution.bySale.has(s.id));
  const paid = ok.reduce((a, s) => a + (s.amount ?? 0), 0);
  const net = ok.reduce((a, s) => a + exGst(s.amount, campaign.gst_rate), 0);
  const discount = ok.reduce((a, s) => a + (s.discount ?? 0), 0);
  const couponsUsed = new Set(ok.map((s) => s.coupon).filter(Boolean));

  const byLink = useMemo(() => {
    const linkById = new Map(ctx.links.map((l) => [l.id, l]));
    const m = new Map<string, Sale[]>();
    for (const s of ok) {
      const id = attribution.bySale.get(s.id);
      if (!id) continue;
      const a = m.get(id) ?? [];
      a.push(s);
      m.set(id, a);
    }
    return [...m.entries()]
      .map(([id, list]) => ({ link: linkById.get(id), id, count: list.length, amount: list.reduce((a, s) => a + (s.amount ?? 0), 0) }))
      .filter((x) => x.link)
      .sort((a, b) => b.count - a.count);
  }, [ok, attribution, ctx.links]);

  const byPlatform = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of ok) {
      const key = s.utm_source || "No UTM";
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [ok]);

  const byProduct = useMemo(() => {
    const m = new Map<string, { n: number; amt: number }>();
    for (const s of ok) {
      const k = s.product || "—";
      const v = m.get(k) ?? { n: 0, amt: 0 };
      m.set(k, { n: v.n + 1, amt: v.amt + (s.amount ?? 0) });
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [ok]);

  if (!sales.length) {
    return (
      <Empty title="No sales or leads yet">
        <p className="muted">Import the learn.kkcreate.in export for purchases, or the Bootcamp invite form responses for leads. Each one is matched to the link it came through by its UTMs.</p>
        <div className="row-gap">
          <button className="btn primary" onClick={() => ctx.openImport("purchase")}>Import purchases CSV</button>
          <button className="btn" onClick={() => ctx.openImport("lead")}>Import invite requests CSV</button>
        </div>
      </Empty>
    );
  }

  const max = byLink[0]?.count ?? 1;
  const noun = kind === "purchase" ? "Sales" : "Leads";

  return (
    <section>
      <div className="toolbar">
        <div className="seg">
          <button className={kind === "purchase" ? "on" : ""} onClick={() => setKind("purchase")}>Purchases</button>
          <button className={kind === "lead" ? "on" : ""} onClick={() => setKind("lead")}>Invite requests</button>
        </div>
        <div className="seg">
          <button className={coupon === "all" ? "on" : ""} onClick={() => setCoupon("all")}>All</button>
          <button className={coupon === "coupon" ? "on" : ""} onClick={() => setCoupon("coupon")}>Used a coupon</button>
          <button className={coupon === "nocoupon" ? "on" : ""} onClick={() => setCoupon("nocoupon")}>No coupon</button>
        </div>
        {products.length > 1 && (
          <select value={product} onChange={(e) => setProduct(e.target.value)} aria-label="Product">
            <option value="">Every product</option>
            {products.map((p) => <option key={p}>{p}</option>)}
          </select>
        )}
        {kind === "purchase" && failed.length > 0 && <span className="small muted">{failed.length} failed payments excluded</span>}
        <span className="spacer" />
        <button className="btn small" onClick={() => ctx.openImport(kind)}>Import CSV</button>
      </div>

      {ofKind.length === 0 ? (
        <Empty title={`No ${kind === "purchase" ? "purchases" : "invite requests"} imported`}>
          <button className="btn primary" onClick={() => ctx.openImport(kind)}>Import CSV</button>
        </Empty>
      ) : (
        <>
          <div className="tiles">
            <div className="tile hi"><div className="field-label">{noun}</div><div className="stat mono">{ok.length}</div>
              {kind === "purchase" && <div className="small muted">{inr(net)} ex-GST</div>}</div>
            {kind === "purchase" && <div className="tile"><div className="field-label">Paid incl. GST</div><div className="stat mono">{inr(paid)}</div>
              <div className="small muted">avg {inr(ok.length ? paid / ok.length : 0)}</div></div>}
            <div className={`tile ${unattributed.length ? "warn" : ""}`}><div className="field-label">Not attributed</div><div className="stat mono">{unattributed.length}</div>
              <div className="small muted">no matching link</div></div>
            {kind === "purchase" && <>
              <div className="tile"><div className="field-label">Refunded</div><div className="stat mono">{refunded.length}</div>
                <div className="small muted">{inr(refunded.reduce((a, s) => a + (s.amount ?? 0), 0))}</div></div>
              <div className="tile"><div className="field-label">Failed payments</div><div className="stat mono">{failed.length}</div><div className="small muted">excluded</div></div>
              <div className="tile"><div className="field-label">Coupons</div><div className="stat mono">{ok.filter((s) => s.coupon).length}</div>
                <div className="small muted">{couponsUsed.size} codes{discount ? ` · ${inr(discount)} off` : ""}</div></div>
            </>}
          </div>

          <div className="sales-layout">
            <div className="card">
              <h3>{noun} by link</h3>
              <p className="small muted">Click a link to see everyone who came through it.</p>
              {byLink.length === 0 && <p className="muted small">None of these match a link in this cohort yet. Check that the export includes UTM columns or a landing URL.</p>}
              {byLink.map((x) => (
                <button key={x.id} className="bar-row" onClick={() => ctx.showTransactionsFor(x.id)}>
                  <div className="bar-label">
                    <span>{linkLabel(x.link!)}</span>
                    <span className="mono small muted">{x.link!.short_url ? displayUrl(x.link!.short_url) : x.link!.post_date}</span>
                  </div>
                  <div className="bar"><div style={{ width: `${(x.count / max) * 100}%` }} /></div>
                  <div className="bar-num mono"><strong>{x.count}</strong>{kind === "purchase" && <span className="small muted">{inr(x.amount)}</span>}</div>
                </button>
              ))}
              {unattributed.length > 0 && (
                <button className="bar-row" onClick={() => ctx.showTransactionsFor("__none__")}>
                  <div className="bar-label"><span className="muted">Not attributed</span></div>
                  <div className="bar"><div className="muted-bar" style={{ width: `${(unattributed.length / Math.max(max, unattributed.length)) * 100}%` }} /></div>
                  <div className="bar-num mono"><strong>{unattributed.length}</strong></div>
                </button>
              )}
            </div>
            <div className="side-stack">
              <div className="card">
                <h3>By source</h3>
                {byPlatform.map(([src, n]) => (
                  <div className="kv" key={src}><span>{src}</span><span className="mono">{n} <span className="muted small">{Math.round((n / ok.length) * 100)}%</span></span></div>
                ))}
              </div>
              {byProduct.length > 1 && (
                <div className="card">
                  <h3>What people bought</h3>
                  {byProduct.map(([p, v]) => (
                    <div className="kv" key={p}><span>{p}</span><span className="mono">{v.n}{kind === "purchase" && <span className="muted small"> {inr(v.amt)}</span>}</span></div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
