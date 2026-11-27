"use client";

import { useState } from "react";
import type { LinkRow, Workshop } from "@/lib/types";
import { newId } from "@/lib/store";
import { kebab } from "@/lib/utm";
import { suggestedWorkshopCode } from "@/lib/seed";
import { fmtDay, Modal } from "./ui";

const parseAliases = (s: string) => [...new Set(s.split(/[,\s]+/).map((x) => kebab(x)).filter(Boolean))];

function WorkshopRow({ w, used, taken, onSave, onDelete }: {
  w: Workshop; used: number; taken: (code: string, id: string) => boolean;
  onSave: (w: Workshop) => void; onDelete: () => void;
}) {
  const [name, setName] = useState(w.name);
  const [date, setDate] = useState(w.date ?? "");
  const [code, setCode] = useState(w.code);
  const [aliases, setAliases] = useState(w.aliases.join(", "));
  const k = kebab(code);
  const dirty = name !== w.name || (date || null) !== w.date || k !== w.code || parseAliases(aliases).join(",") !== w.aliases.join(",");
  const clash = taken(k, w.id);
  return (
    <div className="base-row">
      <div className="ws-fields">
        <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Workshop name" />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
        <input className="mono" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Code" title="Goes into src and utm_content" />
        <input className="mono" value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="old codes, e.g. lw" aria-label="Aliases" />
      </div>
      <div className="small muted">{w.date ? fmtDay(w.date, { day: "numeric", month: "short", year: "numeric" }) : "No date"} · {used} link{used === 1 ? "" : "s"} in this cohort</div>
      {clash && <p className="small warn-text">Another workshop already uses this code or alias.</p>}
      {k !== w.code && used > 0 && <p className="small warn-text">Changing the code changes those links. Short links made already will be flagged “old URL”.</p>}
      <div className="base-row-actions">
        <button className="btn small primary" disabled={!dirty || !name.trim() || !k || clash}
          onClick={() => onSave({ ...w, name: name.trim(), date: date || null, code: k, aliases: parseAliases(aliases) })}>Save</button>
        <button className="btn small ghost" onClick={() => confirm(`Delete "${w.name}"? Links that used it keep working but lose the workshop tag.`) && onDelete()}>Delete</button>
      </div>
    </div>
  );
}

export function WorkshopsDialog({ workshops, links, onSave, onDelete, onClose, toast }: {
  workshops: Workshop[]; links: LinkRow[]; onSave: (w: Workshop) => Promise<void>; onDelete: (id: string) => Promise<void>;
  onClose: () => void; toast: (m: string, k?: "ok" | "err") => void;
}) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [code, setCode] = useState("");
  const [aliases, setAliases] = useState("");
  const suggested = suggestedWorkshopCode(name, date || null);
  const k = kebab(code || suggested);
  const taken = (c: string, id: string) =>
    workshops.some((w) => w.id !== id && (w.code === c || w.aliases.includes(c)));

  const add = async () => {
    if (!name.trim() || !k) { toast("Give the workshop a name", "err"); return; }
    if (taken(k, "")) { toast("That code is already used", "err"); return; }
    await onSave({ id: newId(), name: name.trim(), date: date || null, code: k, aliases: parseAliases(aliases) });
    setName(""); setDate(""); setCode(""); setAliases("");
    toast(`Added ${name.trim()}`);
  };

  return (
    <Modal side title="Workshops" onClose={onClose}
      sub="Live workshops that people and pushes come from. Tag a link with its workshop, and sales and applicants roll up by workshop.">
      <div className="field">
        <div className="field-label">Add a workshop</div>
        <div className="ws-fields">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. AI Editing Workshop" />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input className="mono" value={code} onChange={(e) => setCode(e.target.value)} placeholder={suggested || "code"} />
          <input className="mono" value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="old codes (optional)" />
        </div>
        <p className="small muted">The code goes into <span className="mono">src</span> and the front of <span className="mono">utm_content</span>. Old codes catch links made before, like <span className="mono">lw</span>.</p>
        <button className="btn small primary" onClick={add}>Add workshop</button>
      </div>
      <div className="field">
        <div className="field-label">All workshops</div>
        {workshops.length === 0 && <p className="muted small">None yet.</p>}
        {workshops.map((w) => (
          <WorkshopRow key={w.id + w.code + w.aliases.join()} w={w} used={links.filter((l) => !l.removed_at && l.workshop_id === w.id).length}
            taken={taken} onSave={async (nw) => { await onSave(nw); toast(`Saved ${nw.name}`); }} onDelete={() => onDelete(w.id)} />
        ))}
      </div>
    </Modal>
  );
}
