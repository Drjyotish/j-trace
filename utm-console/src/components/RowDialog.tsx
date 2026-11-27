"use client";

import { useMemo, useState } from "react";
import type { LinkRow } from "@/lib/types";
import { newId } from "@/lib/store";
import { bootcampBaseWarning, buildLongUrl, displayUrl, kebab, normaliseUrl, resolveBase, rowUtm, srcFor, usesSrc } from "@/lib/utm";
import type { Ctx, User } from "./Console";
import { ChipPicker, Modal, monthGrid, todayIso } from "./ui";

export function RowDialog({ ctx, row, date, user, onClose }: {
  ctx: Ctx; row?: LinkRow; date?: string; user: User | null; onClose: () => void;
}) {
  const { campaign, options, verticalBases } = ctx;
  const editing = Boolean(row);
  const [type, setType] = useState<string | null>(row?.type ?? null);
  const [platform, setPlatform] = useState<string | null>(row?.platform ?? null);
  const [channel, setChannel] = useState<string | null>(row?.channel ?? null);
  const [owner, setOwner] = useState<string | null>(row?.owner ?? null);
  const [paid, setPaid] = useState(row?.paid ?? false);
  const [tag, setTag] = useState(row?.tag ?? "");
  const [notes, setNotes] = useState(row?.notes ?? "");
  const [workshopId, setWorkshopId] = useState<string>(row?.workshop_id ?? "");
  const [srcCode, setSrcCode] = useState(row?.src_code ?? "");
  const bootcamp = usesSrc(campaign);
  const [baseChoice, setBaseChoice] = useState<string>(row?.custom_url ? "__custom__" : row?.base_link_id ?? "__default__");
  const [customUrl, setCustomUrl] = useState(row?.custom_url ?? "");
  const start = row?.post_date ?? date ?? campaign.start_date ?? todayIso();
  const [dates, setDates] = useState<string[]>([start]);
  const [view, setView] = useState(() => { const [y, m] = start.split("-").map(Number); return { y, m: m - 1 }; });

  const tagSuggestions = useMemo(() => [...new Set(ctx.links.map((l) => l.tag).filter(Boolean))].sort(), [ctx.links]);
  const daysWithRows = useMemo(() => new Set(ctx.links.map((l) => l.post_date)), [ctx.links]);
  const defaultBase = verticalBases.find((b) => b.id === campaign.default_base_link_id);

  const draftRow = (d: string): LinkRow => ({
    id: row?.id ?? newId(),
    campaign_id: campaign.id,
    post_date: d,
    type: type ?? "",
    platform: platform ?? "",
    channel: channel ?? "",
    tag: tag.trim(),
    owner,
    paid,
    workshop_id: workshopId || null,
    src_code: bootcamp && srcCode.trim() ? kebab(srcCode) : null,
    base_link_id: baseChoice.startsWith("__") ? null : baseChoice,
    custom_url: baseChoice === "__custom__" ? normaliseUrl(customUrl) : null,
    short_url: row?.short_url ?? null,
    short_target: row?.short_target ?? null,
    published_url: row?.published_url ?? null,
    used_long: row?.used_long ?? false,
    notes: notes.trim() || null,
    removed_at: null,
    created_by: row?.created_by ?? user?.email ?? null,
    created_at: row?.created_at,
  });

  const preview = dates.length ? draftRow(dates[0]) : null;
  const utm = preview ? rowUtm(preview, campaign, ctx.workshops) : null;
  const src = preview && bootcamp ? srcFor(preview, ctx.workshops) : null;
  const base = preview ? resolveBase(preview, campaign, ctx.baseLinks) : null;
  const long = utm && base ? buildLongUrl(base.url, utm, src) : null;
  const srcClash = src && preview ? ctx.links.find((l) => l.id !== preview.id && srcFor(l, ctx.workshops) === src) : null;
  const baseWarning = bootcampBaseWarning(campaign, base?.url);
  const clash = preview && utm
    ? ctx.links.find((l) => l.id !== preview.id && dates.includes(l.post_date) && (() => {
        const u = rowUtm(l, campaign, ctx.workshops);
        return u.utm_source === utm.utm_source && u.utm_content === utm.utm_content;
      })())
    : null;

  const missing = [!type && "type", !platform && "platform", !channel && "channel", !dates.length && "a date",
    baseChoice === "__custom__" && !normaliseUrl(customUrl) && "a valid custom URL"].filter(Boolean) as string[];

  const save = async () => {
    if (missing.length) return;
    const rows = dates.map((d, i) => ({ ...draftRow(d), id: i === 0 && row ? row.id : newId() }));
    await ctx.saveRows(rows);
    ctx.toast(editing ? "Row updated" : `Added ${rows.length} row${rows.length > 1 ? "s" : ""}`);
    onClose();
  };

  const toggleDate = (d: string) => {
    if (editing) { setDates([d]); return; }
    setDates((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d].sort()));
  };

  return (
    <Modal side title={editing ? "Edit row" : "Add a row"} sub={`${campaign.name} · utm_campaign=${campaign.slug}`} onClose={onClose}
      footer={
        <>
          <span className="small muted">{missing.length ? `Still needs ${missing.join(", ")}` : editing ? "" : `${dates.length} row${dates.length > 1 ? "s" : ""} will be added`}</span>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={missing.length > 0} onClick={save}>{editing ? "Save" : "Add"}</button>
        </>
      }>
      <ChipPicker label="Type" hint="utm_content" options={options.type} value={type} onChange={setType} onAdd={(v) => ctx.addOption("type", v)} />
      <ChipPicker label="Platform" hint="utm_source" options={options.platform} value={platform} onChange={setPlatform} onAdd={(v) => ctx.addOption("platform", v)} />
      <ChipPicker label="Channel" hint="utm_content" options={options.channel} value={channel} onChange={setChannel} onAdd={(v) => ctx.addOption("channel", v)} />

      <div className="field two">
        <div>
          <div className="field-label">Via workshop <span className="muted small">— optional</span></div>
          <select value={workshopId} onChange={(e) => setWorkshopId(e.target.value)}>
            <option value="">Not from a workshop</option>
            {ctx.workshops.map((w) => <option key={w.id} value={w.id}>{w.name}{w.date ? ` · ${w.date}` : ""}</option>)}
          </select>
          <button type="button" className="linkish small" onClick={ctx.openWorkshops}>Manage workshops</button>
        </div>
        {bootcamp ? (
          <div>
            <div className="field-label">src code <span className="mono muted">?src=</span></div>
            <input className="mono" value={srcCode} onChange={(e) => setSrcCode(e.target.value)} placeholder={preview ? srcFor({ ...preview, src_code: null }, ctx.workshops) : "auto"} />
            <p className="small muted">The apply form saves only this. Leave blank for the automatic code.</p>
          </div>
        ) : <div />}
      </div>

      <div className="field two">
        <div>
          <div className="field-label">Tag <span className="mono muted">utm_content</span></div>
          <input list="tag-suggestions" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="e.g. kickoff, reel-1, countdown" />
          <datalist id="tag-suggestions">{tagSuggestions.map((t) => <option key={t} value={t} />)}</datalist>
        </div>
        <div>
          <div className="field-label">Organic / Paid <span className="mono muted">utm_medium</span></div>
          <div className="seg">
            <button type="button" className={!paid ? "on" : ""} onClick={() => setPaid(false)}>Organic</button>
            <button type="button" className={paid ? "on" : ""} onClick={() => setPaid(true)}>Paid</button>
          </div>
        </div>
      </div>

      <ChipPicker label="Owner" options={options.owner} value={owner} onChange={setOwner} onAdd={(v) => ctx.addOption("owner", v)} allowNone />

      <div className="field">
        <div className="field-label">Base link <span className="muted small">— where the link lands; can be changed later</span></div>
        <select value={baseChoice} onChange={(e) => setBaseChoice(e.target.value)}>
          <option value="__default__">Cohort default — {defaultBase ? `${defaultBase.label} (${displayUrl(defaultBase.url)})` : "not chosen yet"}</option>
          {verticalBases.map((b) => <option key={b.id} value={b.id}>{b.label} — {displayUrl(b.url)}</option>)}
          <option value="__custom__">Custom URL for this row…</option>
        </select>
        {baseChoice === "__custom__" && (
          <input className="mono" style={{ marginTop: 8 }} value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="https://…" />
        )}
        {baseWarning && <p className="small warn-text">{baseWarning}</p>}
        {baseChoice === "__default__" && !defaultBase && (
          <p className="small warn-text">Fine to save now — the long link appears once you pick the cohort&apos;s base link.</p>
        )}
      </div>

      <div className="field">
        <div className="field-label">Date of posting <span className="mono muted">utm_term</span>{!editing && <span className="muted small"> — pick several to add one row per day</span>}</div>
        <div className="mini-cal">
          <div className="mini-cal-head">
            <button type="button" className="btn tiny" onClick={() => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))} aria-label="Previous month">‹</button>
            <strong>{new Date(view.y, view.m, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</strong>
            <button type="button" className="btn tiny" onClick={() => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))} aria-label="Next month">›</button>
          </div>
          <div className="mini-grid">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <span key={i} className="dow">{d}</span>)}
            {monthGrid(view.y, view.m).map((d, i) =>
              d ? (
                <button type="button" key={d} className={`day ${dates.includes(d) ? "on" : ""} ${daysWithRows.has(d) ? "has" : ""}`} onClick={() => toggleDate(d)}
                  aria-label={`${d}${daysWithRows.has(d) ? " — already has rows" : ""}`}>{Number(d.slice(8))}</button>
              ) : <span key={i} />,
            )}
          </div>
        </div>
      </div>

      <div className="field">
        <div className="field-label">Notes</div>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Brief, caption idea, who approves…" />
      </div>

      <div className="preview">
        <div className="field-label">Preview{dates.length > 1 ? ` (first of ${dates.length})` : ""}</div>
        {utm && (
          <div className="utm-grid mono small">
            {Object.entries(utm).map(([k, v]) => <div key={k}><span className="muted">{k}</span> {v || <em className="muted">—</em>}</div>)}
          </div>
        )}
        <div className="mono small long-preview">{long ?? <span className="muted">No base link yet — the long link will be built when one is chosen.</span>}</div>
        {src && <div className="mono small" style={{ marginBottom: 6 }}><span className="muted">src</span> {src}</div>}
        {srcClash && <p className="small warn-text">Another link already uses src “{src}”, so applications can&apos;t be told apart. Set a different src code or tag.</p>}
        {clash && <p className="small warn-text">Another row on this day already has this source + content. Add or change the tag so Sales can tell them apart.</p>}
        {editing && row?.short_url && long && row.short_target && row.short_target !== long && (
          <p className="small warn-text">This changes the long link. The existing short link will be flagged so you can re-point it.</p>
        )}
      </div>
    </Modal>
  );
}
