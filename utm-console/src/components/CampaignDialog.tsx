"use client";

import { useState } from "react";
import type { BaseLink, Campaign, Vertical } from "@/lib/types";
import { VERTICALS } from "@/lib/types";
import { newId } from "@/lib/store";
import { displayUrl, kebab } from "@/lib/utm";
import { suggestedSlug } from "@/lib/seed";
import { Modal } from "./ui";

export function CampaignDialog({ campaign, campaigns, baseLinks, onSave, onClose }: {
  campaign?: Campaign; campaigns: Campaign[]; baseLinks: BaseLink[];
  onSave: (c: Campaign) => Promise<void>; onClose: () => void;
}) {
  const editing = Boolean(campaign);
  const [vertical, setVertical] = useState<Vertical>(campaign?.vertical ?? "bootcamp");
  const [name, setName] = useState(campaign?.name ?? "");
  const [startDate, setStartDate] = useState(campaign?.start_date ?? "");
  const [slug, setSlug] = useState(campaign?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(editing);
  const [baseId, setBaseId] = useState<string>(campaign?.default_base_link_id ?? "");
  const [gst, setGst] = useState(String(campaign?.gst_rate ?? 18));

  const bases = baseLinks.filter((b) => b.vertical === vertical);
  const effectiveSlug = slugTouched ? kebab(slug) : suggestedSlug(vertical, name, startDate || null);
  const taken = campaigns.some((c) => c.slug === effectiveSlug && c.id !== campaign?.id);
  const valid = name.trim() && effectiveSlug && !taken;

  const save = async () => {
    if (!valid) return;
    await onSave({
      id: campaign?.id ?? newId(),
      vertical,
      name: name.trim(),
      slug: effectiveSlug,
      start_date: startDate || null,
      default_base_link_id: bases.some((b) => b.id === baseId) ? baseId : null,
      gst_rate: Number(gst) || 0,
      archived: campaign?.archived ?? false,
      created_at: campaign?.created_at,
    });
    onClose();
  };

  return (
    <Modal title={editing ? "Edit cohort" : "New cohort"} sub="A cohort or launch inside a vertical. Its slug is utm_campaign." onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!valid} onClick={save}>{editing ? "Save" : "Create"}</button></>}>
      <div className="field">
        <div className="field-label">Vertical</div>
        <div className="seg">
          {VERTICALS.map((v) => (
            <button key={v.id} type="button" className={vertical === v.id ? "on" : ""} disabled={editing}
              onClick={() => { setVertical(v.id); setBaseId(""); }}>{v.name}</button>
          ))}
        </div>
      </div>
      <div className="field two">
        <div>
          <div className="field-label">Name</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={vertical === "bootcamp" ? "Jan 2027 cohort" : "Earlybird Dec 2026"} autoFocus />
        </div>
        <div>
          <div className="field-label">Starts / launches</div>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <div className="field-label">utm_campaign</div>
        <input className="mono" value={slugTouched ? slug : effectiveSlug} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }} />
        {taken && <p className="small warn-text">Another cohort already uses this slug.</p>}
        {editing && campaign && effectiveSlug !== campaign.slug && (
          <p className="small warn-text">Changing the slug changes every long link in this cohort. Short links already made will be flagged “old URL”.</p>
        )}
      </div>
      <div className="field two">
        <div>
          <div className="field-label">Default base link</div>
          <select value={baseId} onChange={(e) => setBaseId(e.target.value)}>
            <option value="">Choose later</option>
            {bases.map((b) => <option key={b.id} value={b.id}>{b.label} — {displayUrl(b.url)}</option>)}
          </select>
        </div>
        <div>
          <div className="field-label">GST in prices (%)</div>
          <input type="number" min={0} max={50} value={gst} onChange={(e) => setGst(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
