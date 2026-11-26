"use client";

import { useState } from "react";
import type { BaseLink, Campaign, LinkRow } from "@/lib/types";
import { VERTICALS } from "@/lib/types";
import { newId } from "@/lib/store";
import { displayUrl, normaliseUrl } from "@/lib/utm";
import { Modal } from "./ui";

function BaseRow({ base, rowsUsing, shortsUsing, cohortsUsing, onSave, onDelete }: {
  base: BaseLink; rowsUsing: number; shortsUsing: number; cohortsUsing: string[];
  onSave: (b: BaseLink) => void; onDelete: () => void;
}) {
  const [label, setLabel] = useState(base.label);
  const [url, setUrl] = useState(base.url);
  const norm = normaliseUrl(url);
  const dirty = label.trim() !== base.label || (norm ?? url) !== base.url;
  const urlChanged = norm && norm !== base.url;
  return (
    <div className="base-row">
      <div className="base-fields">
        <input value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Label" />
        <input className="mono" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="URL" />
      </div>
      <div className="small muted">
        {cohortsUsing.length > 0 && <>Default for {cohortsUsing.join(", ")} · </>}
        {rowsUsing} row{rowsUsing === 1 ? "" : "s"} in this cohort
        {" · "}<a href={base.url} target="_blank" rel="noreferrer">open</a>
      </div>
      {!norm && url.trim() && <p className="small warn-text">Not a valid URL.</p>}
      {urlChanged && shortsUsing > 0 && (
        <p className="small warn-text">
          {shortsUsing} short link{shortsUsing > 1 ? "s" : ""} here still go to {displayUrl(base.url)}. After saving they&apos;re flagged “old URL” so you can re-point them.
        </p>
      )}
      <div className="base-row-actions">
        <button className="btn small primary" disabled={!dirty || !norm || !label.trim()} onClick={() => onSave({ ...base, label: label.trim(), url: norm! })}>Save</button>
        <button className="btn small ghost" onClick={() => {
          const msg = rowsUsing || cohortsUsing.length
            ? `Delete "${base.label}"? Rows using it fall back to the cohort default, and cohorts using it as default go back to "not chosen".`
            : `Delete "${base.label}"?`;
          if (confirm(msg)) onDelete();
        }}>Delete</button>
      </div>
    </div>
  );
}

export function BaseLinksDialog({ campaign, baseLinks, links, campaigns, onSaveBase, onDeleteBase, onSaveCampaign, onClose, toast }: {
  campaign: Campaign; baseLinks: BaseLink[]; links: LinkRow[]; campaigns: Campaign[];
  onSaveBase: (b: BaseLink) => Promise<void>; onDeleteBase: (id: string) => Promise<void>;
  onSaveCampaign: (c: Campaign) => Promise<void>; onClose: () => void; toast: (m: string, k?: "ok" | "err") => void;
}) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const vName = VERTICALS.find((v) => v.id === campaign.vertical)?.name;
  const active = links.filter((l) => !l.removed_at);

  const usage = (b: BaseLink) => {
    const using = active.filter((l) => !l.custom_url && (l.base_link_id === b.id || (!l.base_link_id && campaign.default_base_link_id === b.id)));
    return {
      rows: using.length,
      shorts: using.filter((l) => l.short_url).length,
      cohorts: campaigns.filter((c) => c.default_base_link_id === b.id).map((c) => c.name),
    };
  };

  const add = async () => {
    const norm = normaliseUrl(url);
    if (!label.trim() || !norm) { toast("Give it a name and a valid URL", "err"); return; }
    const b: BaseLink = { id: newId(), vertical: campaign.vertical, label: label.trim(), url: norm };
    await onSaveBase(b);
    if (!campaign.default_base_link_id) await onSaveCampaign({ ...campaign, default_base_link_id: b.id });
    setLabel(""); setUrl("");
    toast(`Added ${b.label}`);
  };

  return (
    <Modal side title="Base links" sub={`Destinations for ${vName}. Edit them any time — long links rebuild automatically.`} onClose={onClose}>
      <div className="field">
        <div className="field-label">Default for “{campaign.name}”</div>
        <div className="radio-list">
          <label className="radio">
            <input type="radio" name="default-base" checked={!campaign.default_base_link_id}
              onChange={() => onSaveCampaign({ ...campaign, default_base_link_id: null })} />
            <span>Not chosen yet <span className="muted small">— rows are saved, links wait</span></span>
          </label>
          {baseLinks.map((b) => (
            <label className="radio" key={b.id}>
              <input type="radio" name="default-base" checked={campaign.default_base_link_id === b.id}
                onChange={() => { onSaveCampaign({ ...campaign, default_base_link_id: b.id }); toast(`Default is now ${b.label}`); }} />
              <span>{b.label} <span className="mono muted small">{displayUrl(b.url)}</span></span>
            </label>
          ))}
        </div>
        <p className="small muted">Switching the default changes every row that follows it. Rows with their own base link or custom URL stay put. Short links made for the old URL get flagged.</p>
      </div>

      <div className="field">
        <div className="field-label">{vName} base links</div>
        {baseLinks.length === 0 && <p className="muted small">None yet — add one below.</p>}
        {baseLinks.map((b) => {
          const u = usage(b);
          return (
            <BaseRow key={b.id + b.updated_at} base={b} rowsUsing={u.rows} shortsUsing={u.shorts} cohortsUsing={u.cohorts}
              onSave={async (nb) => { await onSaveBase(nb); toast(`Saved ${nb.label}`); }}
              onDelete={() => onDeleteBase(b.id)} />
          );
        })}
      </div>

      <div className="field">
        <div className="field-label">Add a base link</div>
        <div className="base-fields">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name, e.g. Course landing v2" />
          <input className="mono" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" onKeyDown={(e) => e.key === "Enter" && add()} />
        </div>
        <button className="btn small primary" style={{ marginTop: 8 }} onClick={add}>Add base link</button>
      </div>
    </Modal>
  );
}
