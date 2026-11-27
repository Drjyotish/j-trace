"use client";

import { useMemo, useState } from "react";
import type { ApplicantForm, LinkRow, Sale, SaleKind } from "@/lib/types";
import { newApplicant, newId } from "@/lib/store";
import { attribute, attributeApplicants } from "@/lib/attribution";
import {
  APPLICANT_FIELDS, guessApplicantMapping, guessMapping, parseCsv, parseDate, rowsToApplicants, rowsToSales, SALE_FIELDS,
  type ApplicantMapping, type Mapping, type ParsedCsv,
} from "@/lib/csv";
import { normaliseUrl } from "@/lib/utm";
import type { Ctx, User } from "./Console";
import { Modal } from "./ui";

export type ImportMode = SaleKind | "links" | "applicants";

const LINK_HEADERS: Record<string, RegExp> = {
  date: /^(post[\s_]*)?date|date of posting|link use date|utm_term/i,
  type: /^type$|format/i,
  platform: /^platform$|^utm_source$/i,
  channel: /^channel$|account/i,
  tag: /^tag$|content tag/i,
  owner: /^owner$/i,
  paid: /organic|paid|medium/i,
  base_link: /^base[\s_]*link$/i,
  custom_url: /custom[\s_]*url|website[\s_]*url/i,
  short_link: /short[\s_]*link|bit\.?ly/i,
  published_link: /published/i,
  notes: /^notes?$/i,
  workshop: /^workshop$/i,
};

function isoDay(raw: string | undefined): string | null {
  const s = (raw ?? "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const p = parseDate(s);
  if (!p) return null;
  const d = new Date(p);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ImportDialog({ ctx, mode, user, onImportSales, onImportApplicants, onClose }: {
  ctx: Ctx; mode: ImportMode; user: User | null;
  onImportSales: (rows: Sale[], kind: SaleKind, replace: boolean) => Promise<void>;
  onImportApplicants: (rows: ApplicantForm[]) => Promise<void>;
  onClose: () => void;
}) {
  const [file, setFile] = useState<{ name: string; csv: ParsedCsv } | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [aMapping, setAMapping] = useState<ApplicantMapping>({});
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) { setError("That file is over 20 MB."); return; }
    const csv = parseCsv(await f.text());
    if (!csv.headers.length || !csv.rows.length) { setError("Couldn't find a header row and data in that CSV."); return; }
    setFile({ name: f.name, csv });
    if (mode === "applicants") setAMapping(guessApplicantMapping(csv.headers));
    else if (mode !== "links") setMapping(guessMapping(csv.headers));
  };

  const applicantPreview = useMemo(() => {
    if (!file || mode !== "applicants") return null;
    const rows = rowsToApplicants(file.csv.rows, aMapping, ctx.campaign.id);
    const existing = new Set(ctx.applicants.map((a) => a.external_id));
    const sources = attributeApplicants(rows.map(newApplicant), ctx.links, ctx.workshops);
    const codes = new Map<string, number>();
    rows.forEach((r) => codes.set(r.source || "(none)", (codes.get(r.source || "(none)") ?? 0) + 1));
    return { rows, added: rows.filter((r) => !existing.has(r.external_id)).length, matched: sources.size, codes: [...codes.entries()].sort((a, b) => b[1] - a[1]) };
  }, [file, aMapping, mode, ctx.campaign.id, ctx.applicants, ctx.links, ctx.workshops]);

  const salesPreview = useMemo(() => {
    if (!file || mode === "links" || mode === "applicants") return null;
    const rows = rowsToSales(file.csv.rows, mapping, { kind: mode, campaignId: ctx.campaign.id, batch: file.name, newId });
    const a = attribute(rows, ctx.links, ctx.campaign);
    const otherCampaign = rows.filter((r) => r.utm_campaign && r.utm_campaign !== ctx.campaign.slug).length;
    return { rows, matched: a.bySale.size, withUtm: rows.filter((r) => r.utm_content).length, otherCampaign };
  }, [file, mapping, mode, ctx.campaign, ctx.links]);

  const linksPreview = useMemo(() => {
    if (!file || mode !== "links") return null;
    const col: Record<string, string | undefined> = {};
    for (const [k, re] of Object.entries(LINK_HEADERS)) col[k] = file.csv.headers.find((h) => re.test(h));
    const get = (r: Record<string, string>, k: string) => (col[k] ? (r[col[k]!] ?? "").trim() : "");
    const out: LinkRow[] = [];
    let skipped = 0;
    for (const r of file.csv.rows) {
      const date = isoDay(get(r, "date"));
      const type = get(r, "type"), platform = get(r, "platform"), channel = get(r, "channel");
      if (!date || !type || !platform || !channel) { skipped++; continue; }
      const baseName = get(r, "base_link").toLowerCase();
      const base = ctx.verticalBases.find((b) => b.label.toLowerCase() === baseName || b.url === normaliseUrl(baseName));
      const shortUrl = normaliseUrl(get(r, "short_link"));
      out.push({
        id: newId(), campaign_id: ctx.campaign.id, post_date: date, type, platform, channel,
        tag: get(r, "tag"), owner: get(r, "owner") || null, paid: /paid/i.test(get(r, "paid")),
        workshop_id: ctx.workshops.find((w) => [w.name.toLowerCase(), w.code].includes(get(r, "workshop").toLowerCase()))?.id ?? null,
        src_code: null,
        base_link_id: base?.id ?? null, custom_url: base ? null : normaliseUrl(get(r, "custom_url")),
        short_url: shortUrl, short_target: null, published_url: normaliseUrl(get(r, "published_link")),
        used_long: false, notes: get(r, "notes") || null, removed_at: null, created_by: user?.email ?? null,
      });
    }
    // a short link imported from a sheet is assumed to point at what this row builds now
    for (const row of out) if (row.short_url) row.short_target = ctx.longOf(row);
    return { rows: out, skipped, col };
  }, [file, mode, ctx, user]);

  const doImport = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === "links" && linksPreview) {
        for (const r of linksPreview.rows) {
          ctx.addOption("type", r.type); ctx.addOption("platform", r.platform); ctx.addOption("channel", r.channel);
          if (r.owner) ctx.addOption("owner", r.owner);
        }
        await ctx.saveRows(linksPreview.rows);
        ctx.toast(`Imported ${linksPreview.rows.length} rows`);
      } else if (mode === "applicants" && applicantPreview) {
        await onImportApplicants(applicantPreview.rows);
        ctx.toast(`${applicantPreview.added} new applicant${applicantPreview.added === 1 ? "" : "s"}, ${applicantPreview.rows.length - applicantPreview.added} updated`);
      } else if (salesPreview && mode !== "links" && mode !== "applicants") {
        await onImportSales(salesPreview.rows, mode, replace);
        ctx.toast(`Imported ${salesPreview.rows.length} ${mode === "purchase" ? "purchases" : "invite requests"}`);
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "links" ? "Import links CSV" : mode === "purchase" ? "Import purchases" : mode === "applicants" ? "Import bootcamp applications" : "Import invite requests";
  const sub = mode === "links"
    ? "Use a file from Export CSV, or any sheet with date, type, platform and channel columns."
    : mode === "purchase"
      ? "The learn.kkcreate.in (TagMango) export. Re-importing the same orders updates them instead of double counting."
      : mode === "applicants"
        ? "The cb.kkcreate.in/apply sheet (File → Download → CSV). Re-import any time: new people are added; stage, owner and notes are kept."
        : "Invite form responses. Counted as leads per link.";
  const count = mode === "links" ? linksPreview?.rows.length ?? 0 : mode === "applicants" ? applicantPreview?.rows.length ?? 0 : salesPreview?.rows.length ?? 0;

  return (
    <Modal wide title={title} sub={sub} onClose={onClose}
      footer={<>
        {error && <span className="small warn-text">{error}</span>}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!count || busy} onClick={doImport}>{busy ? "Importing…" : `Import ${count || ""}`}</button>
      </>}>
      <div className="field">
        <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
        {file && <p className="small muted">{file.name} · {file.csv.rows.length} rows · {file.csv.headers.length} columns</p>}
      </div>

      {file && mode === "applicants" && applicantPreview && (
        <>
          <div className="field">
            <div className="field-label">Match the columns</div>
            <div className="map-grid">
              {APPLICANT_FIELDS.map((f) => (
                <label key={f.key} className="map-row">
                  <span className="small">{f.label}</span>
                  <select value={aMapping[f.key] ?? ""} onChange={(e) => setAMapping((m) => ({ ...m, [f.key]: e.target.value || undefined }))}>
                    <option value="">— not in file —</option>
                    {file.csv.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <p className="small muted">Every other column (city, role, goals, problems…) is kept as form answers on each person&apos;s call sheet.</p>
          </div>
          <div className="preview">
            <div className="field-label">Result</div>
            <p className="small">
              {applicantPreview.rows.length} applicants · <strong>{applicantPreview.added}</strong> new · {applicantPreview.rows.length - applicantPreview.added} already here (stage and notes kept) ·{" "}
              <strong>{applicantPreview.matched}</strong> matched to a workshop or link
            </p>
            <p className="small muted">Source codes in this file: {applicantPreview.codes.map(([c, n]) => `${c} (${n})`).join(" · ")}</p>
          </div>
        </>
      )}

      {file && mode !== "links" && mode !== "applicants" && salesPreview && (
        <>
          <div className="field">
            <div className="field-label">Match the columns</div>
            <div className="map-grid">
              {SALE_FIELDS.filter((f) => mode === "purchase" || !["amount", "status", "discount", "coupon"].includes(f.key)).map((f) => (
                <label key={f.key} className="map-row">
                  <span className="small">{f.label}</span>
                  <select value={mapping[f.key] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value || undefined }))}>
                    <option value="">— not in file —</option>
                    {file.csv.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>
              ))}
            </div>
            {!mapping.utm_content && !mapping.landing_url && (
              <p className="small warn-text">No utm_content or landing URL column picked — records will import but can&apos;t be matched to links.</p>
            )}
          </div>
          <div className="preview">
            <div className="field-label">Result</div>
            <p className="small">
              {salesPreview.rows.length} records · {salesPreview.withUtm} carry UTMs · <strong>{salesPreview.matched}</strong> match a link in this cohort
              {salesPreview.otherCampaign > 0 && <> · <span className="warn-text">{salesPreview.otherCampaign} have a different utm_campaign</span></>}
            </p>
            <div className="table-wrap">
              <table className="links small">
                <thead><tr><th>Name</th><th>Email</th>{mode === "purchase" && <><th>Amount</th><th>Status</th></>}<th>utm_source</th><th>utm_content</th><th>utm_term</th><th>Date</th></tr></thead>
                <tbody>
                  {salesPreview.rows.slice(0, 5).map((s) => (
                    <tr key={s.id}><td>{s.name}</td><td>{s.email}</td>{mode === "purchase" && <><td>{s.amount}</td><td>{s.status}</td></>}
                      <td className="mono">{s.utm_source}</td><td className="mono">{s.utm_content}</td><td className="mono">{s.utm_term}</td>
                      <td className="mono">{s.occurred_at?.slice(0, 10)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="check small"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Replace everything previously imported as {mode === "purchase" ? "purchases" : "invite requests"} for this cohort</label>
          </div>
        </>
      )}

      {file && mode === "links" && linksPreview && (
        <div className="preview">
          <div className="field-label">Result</div>
          <p className="small">{linksPreview.rows.length} rows ready{linksPreview.skipped ? ` · ${linksPreview.skipped} skipped (missing date, type, platform or channel)` : ""}</p>
          <p className="small muted">Columns used: {Object.entries(linksPreview.col).filter(([, v]) => v).map(([k, v]) => `${k} ← ${v}`).join(" · ") || "none found"}</p>
        </div>
      )}
    </Modal>
  );
}
