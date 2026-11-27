"use client";

import { useMemo, useState } from "react";
import type { Applicant, Stage } from "@/lib/types";
import { DROP_REASONS, STAGES } from "@/lib/types";
import { phoneKey, waLink } from "@/lib/attribution";
import type { Ctx } from "./Console";
import { Empty, fmtDay, localDay, Modal, todayIso } from "./ui";

const ORDER: Record<Stage, number> = { applied: 0, contacted: 1, eligible: 2, willing: 3, enrolled: 4, not_fit: -1, not_interested: -1 };
const stageLabel = (s: Stage) => STAGES.find((x) => x.id === s)?.label ?? s;

function useSourceLabels(ctx: Ctx) {
  return useMemo(() => {
    const linkById = new Map(ctx.links.map((l) => [l.id, l]));
    const wsById = new Map(ctx.workshops.map((w) => [w.id, w]));
    return (a: Applicant) => {
      const src = ctx.applicantSources.get(a.id);
      const ws = src?.workshopId ? wsById.get(src.workshopId) : null;
      const link = src?.linkId ? linkById.get(src.linkId) : null;
      const linkText = link ? `${link.platform} · ${link.channel}${link.tag ? ` · ${link.tag}` : ""}` : null;
      return {
        group: ws?.name ?? linkText ?? (a.source ? `src: ${a.source}` : "No source"),
        detail: ws && linkText ? linkText : null,
        known: Boolean(ws || link),
      };
    };
  }, [ctx.links, ctx.workshops, ctx.applicantSources]);
}

function Drawer({ ctx, a, paid, onClose }: { ctx: Ctx; a: Applicant; paid: boolean; onClose: () => void }) {
  const [notes, setNotes] = useState(a.notes ?? "");
  const source = useSourceLabels(ctx)(a);
  const set = (patch: Partial<Applicant>) => {
    const next = { ...a, ...patch };
    if (patch.stage && patch.stage !== a.stage) next.stage_changed_at = new Date().toISOString();
    if (patch.stage && !STAGES.find((s) => s.id === patch.stage)?.exit) next.drop_reason = null;
    ctx.saveApplicant(next);
  };
  const wa = waLink(a.phone);
  const exit = STAGES.find((s) => s.id === a.stage)?.exit;
  return (
    <Modal side title={a.name || "Applicant"} onClose={onClose}
      sub={<>{[a.email, a.phone].filter(Boolean).join(" · ")}{a.applied_at && ` · applied ${fmtDay(localDay(a.applied_at))}`}</>}>
      <div className="row-gap left">
        {wa && <a className="btn small" href={wa} target="_blank" rel="noreferrer">WhatsApp</a>}
        {a.email && <a className="btn small" href={`mailto:${a.email}`}>Email</a>}
        <span className={`pill ${source.known ? "accent" : "muted-pill"}`}>{source.group}</span>
        {source.detail && <span className="pill muted-pill">{source.detail}</span>}
        {a.form_status && a.form_status.toLowerCase() !== "submitted" && <span className="pill warn">Form {a.form_status.toLowerCase()}</span>}
        {paid && <span className="pill st-posted">Paid</span>}
      </div>

      <div className="field" style={{ marginTop: 16 }}>
        <div className="field-label">Stage</div>
        <div className="chips">
          {STAGES.map((s) => (
            <button key={s.id} type="button" title={s.hint} className={`chip ${a.stage === s.id ? "on" : ""} ${s.exit ? "exit" : ""}`} onClick={() => set({ stage: s.id })}>{s.label}</button>
          ))}
        </div>
        {exit && (
          <div className="chips" style={{ marginTop: 8 }}>
            {DROP_REASONS.map((r) => (
              <button key={r} type="button" className={`chip small-chip ${a.drop_reason === r ? "on" : ""}`} onClick={() => set({ drop_reason: r })}>{r}</button>
            ))}
          </div>
        )}
      </div>

      <div className="field two">
        <div>
          <div className="field-label">Owner</div>
          <select value={a.owner ?? ""} onChange={(e) => set({ owner: e.target.value || null })}>
            <option value="">Unassigned</option>
            {ctx.options.owner.map((o) => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <div className="field-label">Next follow-up</div>
          <input type="date" value={a.next_followup ?? ""} onChange={(e) => set({ next_followup: e.target.value || null })} />
        </div>
      </div>

      <div className="field">
        <div className="field-label">Call notes</div>
        <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (a.notes ?? "") && set({ notes: notes || null })}
          placeholder="Eligible? Can we help them? Budget, objections, what they said…" />
      </div>

      <div className="field">
        <div className="field-label">Form answers</div>
        <dl className="answers">
          {a.commitment && <><dt>Commitment</dt><dd>{a.commitment}</dd></>}
          {Object.entries(a.answers).map(([k, v]) => (
            <div key={k} className="answer"><dt>{k}</dt><dd>{/^https?:\/\//.test(v) ? <a href={v} target="_blank" rel="noreferrer">{v}</a> : v}</dd></div>
          ))}
        </dl>
      </div>
    </Modal>
  );
}

export function ApplicantsTab({ ctx }: { ctx: Ctx }) {
  const { applicants } = ctx;
  const [stage, setStage] = useState<Stage | "all" | "due">("all");
  const [group, setGroup] = useState("");
  const [owner, setOwner] = useState("");
  const [formFilter, setFormFilter] = useState<"" | "submitted" | "incomplete">("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const sourceOf = useSourceLabels(ctx);
  const today = todayIso();

  // purchases in this cohort that match an applicant by email or phone
  const paidIds = useMemo(() => {
    const emails = new Set<string>();
    const phones = new Set<string>();
    for (const s of ctx.sales) {
      if (s.kind !== "purchase" || s.status !== "success") continue;
      if (s.email) emails.add(s.email.toLowerCase());
      if (phoneKey(s.phone).length === 10) phones.add(phoneKey(s.phone));
    }
    return new Set(applicants.filter((a) => (a.email && emails.has(a.email.toLowerCase())) || phones.has(phoneKey(a.phone))).map((a) => a.id));
  }, [ctx.sales, applicants]);

  const funnel = useMemo(() => {
    const m = new Map<string, { known: boolean; n: number; contacted: number; eligible: number; willing: number; enrolled: number; notFit: number; notInt: number }>();
    for (const a of applicants) {
      const s = sourceOf(a);
      const row = m.get(s.group) ?? { known: s.known, n: 0, contacted: 0, eligible: 0, willing: 0, enrolled: 0, notFit: 0, notInt: 0 };
      const i = ORDER[a.stage];
      row.n++;
      if (i >= 1 || i === -1) row.contacted++;
      if (i >= 2) row.eligible++;
      if (i >= 3) row.willing++;
      if (i >= 4) row.enrolled++;
      if (a.stage === "not_fit") row.notFit++;
      if (a.stage === "not_interested") row.notInt++;
      m.set(s.group, row);
    }
    return [...m.entries()].sort((x, y) => Number(y[1].known) - Number(x[1].known) || y[1].n - x[1].n);
  }, [applicants, sourceOf]);

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    applicants.forEach((a) => c.set(a.stage, (c.get(a.stage) ?? 0) + 1));
    return c;
  }, [applicants]);
  const due = applicants.filter((a) => a.next_followup && a.next_followup <= today && !STAGES.find((s) => s.id === a.stage)?.exit && a.stage !== "enrolled");
  const paidNotEnrolled = applicants.filter((a) => paidIds.has(a.id) && a.stage !== "enrolled");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return applicants
      .filter((a) => {
        if (stage === "due" && !due.includes(a)) return false;
        if (stage !== "all" && stage !== "due" && a.stage !== stage) return false;
        if (group && sourceOf(a).group !== group) return false;
        if (owner && (a.owner ?? "__none__") !== owner) return false;
        if (formFilter && (a.form_status ?? "").toLowerCase() !== formFilter) return false;
        if (!needle) return true;
        return [a.name, a.email, a.phone, a.source, a.notes, ...Object.values(a.answers)].some((v) => (v ?? "").toLowerCase().includes(needle));
      })
      .sort((x, y) => (y.applied_at ?? "").localeCompare(x.applied_at ?? ""));
  }, [applicants, stage, group, owner, formFilter, q, sourceOf, due]);

  if (!applicants.length) {
    return (
      <Empty title="No applicants yet">
        <p className="muted">Download the bootcamp form sheet as CSV (File → Download → .csv) and import it. Re-import any time: new people are added, existing ones keep their stage, owner and notes.</p>
        <button className="btn primary" onClick={() => ctx.openImport("applicants")}>Import applications CSV</button>
      </Empty>
    );
  }

  const openA = applicants.find((a) => a.id === open);
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

  return (
    <section>
      <div className="toolbar">
        <div className="seg wrap">
          <button className={stage === "all" ? "on" : ""} onClick={() => setStage("all")}>Everyone · {applicants.length}</button>
          {STAGES.map((s) => (
            <button key={s.id} title={s.hint} className={stage === s.id ? "on" : ""} onClick={() => setStage(s.id)}>{s.label} · {counts.get(s.id) ?? 0}</button>
          ))}
          <button className={stage === "due" ? "on" : ""} onClick={() => setStage("due")}>Follow-up due · {due.length}</button>
        </div>
        <span className="spacer" />
        <button className="btn small" onClick={() => ctx.openImport("applicants")}>Import / refresh CSV</button>
      </div>

      {paidNotEnrolled.length > 0 && (
        <div className="banner info">
          <span>{paidNotEnrolled.length} applicant{paidNotEnrolled.length > 1 ? "s have" : " has"} a matching paid purchase but isn&apos;t marked Enrolled.</span>
          <button className="btn small" onClick={() => paidNotEnrolled.forEach((a) => ctx.saveApplicant({ ...a, stage: "enrolled", stage_changed_at: new Date().toISOString(), drop_reason: null }))}>Mark enrolled</button>
        </div>
      )}

      <div className="card funnel">
        <h3>By workshop / source</h3>
        <p className="small muted">Where applicants came from and how far they got. Click a row to filter the list.</p>
        <div className="table-wrap">
          <table className="links">
            <thead>
              <tr><th>Source</th><th>Applied</th><th>Contacted</th><th>Eligible</th><th>Willing to pay</th><th>Enrolled</th><th>Not a fit</th><th>Not interested</th><th>Applied → enrolled</th></tr>
            </thead>
            <tbody>
              {funnel.map(([g, r]) => (
                <tr key={g} className={`clickable ${group === g ? "selected" : ""}`} onClick={() => setGroup(group === g ? "" : g)}>
                  <td className={r.known ? "" : "muted"}>{g}</td>
                  <td className="mono">{r.n}</td><td className="mono">{r.contacted}</td><td className="mono">{r.eligible}</td>
                  <td className="mono">{r.willing}</td><td className="mono"><strong>{r.enrolled}</strong></td>
                  <td className="mono muted">{r.notFit}</td><td className="mono muted">{r.notInt}</td><td className="mono">{pct(r.enrolled, r.n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {funnel.some(([g]) => g.startsWith("src: ")) && (
          <p className="small muted">Unmatched codes: add them as a workshop&apos;s old code in <button className="linkish inline" onClick={ctx.openWorkshops}>Workshops</button>, or give a link that src code.</p>
        )}
      </div>

      <div className="toolbar">
        <input className="search" type="search" placeholder="Search name, email, phone, answers, notes…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Source">
          <option value="">Any source</option>
          {funnel.map(([g, r]) => <option key={g} value={g}>{g} ({r.n})</option>)}
        </select>
        <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner">
          <option value="">Any owner</option>
          <option value="__none__">Unassigned</option>
          {ctx.options.owner.map((o) => <option key={o}>{o}</option>)}
        </select>
        <select value={formFilter} onChange={(e) => setFormFilter(e.target.value as typeof formFilter)} aria-label="Form">
          <option value="">Submitted + incomplete</option>
          <option value="submitted">Submitted only</option>
          <option value="incomplete">Incomplete only</option>
        </select>
        <span className="small muted">{filtered.length} shown</span>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="links applicants">
            <thead>
              <tr><th>Name</th><th>Contact</th><th>Source</th><th>Applied</th><th>Form</th><th>Stage</th><th>Owner</th><th>Follow-up</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const s = sourceOf(a);
                const wa = waLink(a.phone);
                const overdue = a.next_followup && a.next_followup <= today && ORDER[a.stage] >= 0 && a.stage !== "enrolled";
                return (
                  <tr key={a.id}>
                    <td>
                      <button className="linkish strong" onClick={() => setOpen(a.id)}>{a.name || "—"}</button>
                      <div className="small muted">{[a.answers["City"], a.answers["Role"]].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="small nowrap">
                      {wa ? <a href={wa} target="_blank" rel="noreferrer">{a.phone}</a> : a.phone}
                      <div className="muted">{a.email}</div>
                    </td>
                    <td className="small"><span className={`pill ${s.known ? "accent" : "muted-pill"}`}>{s.group}</span>{s.detail && <div className="muted">{s.detail}</div>}</td>
                    <td className="small nowrap">{a.applied_at ? fmtDay(localDay(a.applied_at)) : "—"}</td>
                    <td className="small">
                      {(a.form_status ?? "").toLowerCase() === "incomplete" ? <span className="pill warn">Incomplete</span> : <span className="muted">Submitted</span>}
                      {a.commitment && <div className={a.commitment.toLowerCase() === "no" ? "warn-text" : "muted"}>Commit: {a.commitment}</div>}
                    </td>
                    <td>
                      <select className={`stage-select st-${a.stage}`} value={a.stage}
                        onChange={(e) => ctx.saveApplicant({ ...a, stage: e.target.value as Stage, stage_changed_at: new Date().toISOString() })}>
                        {STAGES.map((st) => <option key={st.id} value={st.id}>{st.label}</option>)}
                      </select>
                      {a.drop_reason && <div className="small muted">{a.drop_reason}</div>}
                      {paidIds.has(a.id) && <span className="pill st-posted">Paid</span>}
                    </td>
                    <td>
                      <select value={a.owner ?? ""} onChange={(e) => ctx.saveApplicant({ ...a, owner: e.target.value || null })}>
                        <option value="">—</option>
                        {ctx.options.owner.map((o) => <option key={o}>{o}</option>)}
                      </select>
                    </td>
                    <td><input type="date" className={`date-cell ${overdue ? "overdue" : ""}`} value={a.next_followup ?? ""} onChange={(e) => ctx.saveApplicant({ ...a, next_followup: e.target.value || null })} /></td>
                    <td className="small notes-cell" title={a.notes ?? ""}>
                      <button className="linkish" onClick={() => setOpen(a.id)}>{a.notes || <span className="muted">Add notes</span>}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {openA && <Drawer key={openA.id} ctx={ctx} a={openA} paid={paidIds.has(openA.id)} onClose={() => setOpen(null)} />}
      <p className="small muted pad">Stages: {STAGES.map((s) => `${s.label} — ${s.hint}`).join(" · ")}</p>
    </section>
  );
}

export { stageLabel };
