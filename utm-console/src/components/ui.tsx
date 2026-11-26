"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function Modal({
  title, sub, onClose, children, footer, side = false, wide = false,
}: {
  title: string; sub?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; side?: boolean; wide?: boolean;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${side ? "modal-side" : ""} ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {sub && <p className="muted small">{sub}</p>}
          </div>
          <button className="btn icon" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** Single-choice chip list with "+ new" — the Add row vocabulary picker. */
export function ChipPicker({
  label, hint, options, value, onChange, onAdd, allowNone = false,
}: {
  label: string; hint?: string; options: string[]; value: string | null; onChange: (v: string | null) => void;
  onAdd: (v: string) => void; allowNone?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (adding) ref.current?.focus(); }, [adding]);
  const commit = () => {
    const v = draft.trim();
    if (v) { onAdd(v); onChange(v); }
    setDraft(""); setAdding(false);
  };
  return (
    <div className="field">
      <div className="field-label">{label}{hint && <span className="mono muted"> {hint}</span>}</div>
      <div className="chips">
        {allowNone && (
          <button type="button" className={`chip ${value == null ? "on" : ""}`} onClick={() => onChange(null)}>Unassigned</button>
        )}
        {options.map((o) => (
          <button type="button" key={o} className={`chip ${value === o ? "on" : ""}`} onClick={() => onChange(o)}>{o}</button>
        ))}
        {adding ? (
          <input
            ref={ref} className="chip-input" value={draft} placeholder="New…" onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") setAdding(false); }}
            onBlur={commit}
          />
        ) : (
          <button type="button" className="chip ghost" onClick={() => setAdding(true)}>+ new</button>
        )}
      </div>
    </div>
  );
}

const OWNER_COLORS = ["#c25a4a", "#3f73b5", "#c07a2b", "#7c5cc4", "#2f8f7b", "#b8487f", "#5d7a2e", "#8a6d3b", "#4a8fb0", "#9b4fb0"];
export function ownerColor(owner: string | null | undefined): string {
  if (!owner) return "#8a8f98";
  let h = 0;
  for (const c of owner) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return OWNER_COLORS[h % OWNER_COLORS.length];
}

export async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function download(filename: string, content: string | Blob, type = "text/csv;charset=utf-8") {
  const blob = typeof content === "string" ? new Blob([content], { type }) : content;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function fmtDay(iso: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", opts);
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Month grid (Sun-first) of ISO dates; null for padding cells. */
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array(first).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children}
    </div>
  );
}
