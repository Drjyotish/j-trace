"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/I18n";
import { ImeiHint } from "@/components/ImeiHint";
import { ApiError, api, errorText, sha256File } from "@/lib/client";
import { checkImei } from "@/lib/imei";
import { LOCALE_NAMES } from "@/lib/i18n";
import { LOCALES, type Locale, type PlaybookStep } from "@/lib/playbook";

interface OwnerEvent {
  id: string;
  kind: string;
  simulated: boolean;
  country: string | null;
  payload: Record<string, string>;
  at: string;
}
interface View {
  ref: string;
  status: string;
  country: string;
  incidentType: string;
  platform: string;
  brand: string | null;
  model: string | null;
  hasImei: boolean;
  imeiMasked: string | null;
  phoneMasked: string | null;
  contactMasked: string;
  contactVerified: boolean;
  policeRef: string | null;
  verification: { level: number; effectiveLevel: number; score: number; threshold: number; breakdown: { kind: string; points: number; status: string }[] };
  steps: (PlaybookStep & { done: boolean })[];
  evidence: { kind: string; status: string; fileName: string | null }[];
  events: OwnerEvent[];
  hiddenEvents: number;
  blockHandoff: { url: string | null; documents: string[]; expected: string };
  purgeAfter: string;
  demo: boolean;
}

type TFn = (key: string, vars?: Record<string, string | number>) => string;

export default function CasePage() {
  const { t, locale } = useI18n();
  const [view, setView] = useState<View | null>(null);
  const [state, setState] = useState<"loading" | "none" | "ready" | "erased">("loading");

  const load = useCallback(async () => {
    try {
      setView(await api<View>(`/api/case?locale=${locale}`));
      setState("ready");
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 404)) setState("none");
      else setState("none");
    }
  }, [locale]);

  useEffect(() => {
    load();
  }, [load]);

  if (state === "loading") return <p className="muted">{t("common.loading")}</p>;
  if (state === "erased" || state === "none" || !view) {
    return (
      <div className="card">
        <h1>{t("case.title")}</h1>
        <p>{t("case.none")}</p>
        <div className="row">
          <Link href="/start" className="btn primary">{t("home.cta.start")}</Link>
          <Link href="/" className="btn">{t("home.cta.open")}</Link>
        </div>
      </div>
    );
  }

  const v = view;
  const closed = v.status === "recovered" || v.status === "closed";
  const groups: ("now" | "today" | "later")[] = ["now", "today", "later"];
  let n = 0;

  return (
    <>
      <div className="spread">
        <div>
          <h1 style={{ marginBottom: 4 }}>{t("case.title")}</h1>
          <p className="muted mono" style={{ marginBottom: 8 }}>{v.ref}</p>
        </div>
        <div className="row">
          <span className={`badge ${v.status === "disputed" ? "danger" : v.status === "recovered" ? "ok" : "brand"}`}>{t(`status.${v.status}`)}</span>
          <span className="badge">{t(`country.${v.country}`)}</span>
          <span className={`badge ${v.verification.effectiveLevel >= 2 ? "ok" : "warn"}`}>{t(`verify.level.${v.verification.effectiveLevel}`)}</span>
        </div>
      </div>

      <div className="card flat">
        <dl className="kv">
          <dt>{t("start.s2")}</dt>
          <dd>{[v.brand, v.model].filter(Boolean).join(" ") || t(`start.${v.platform}`)}</dd>
          <dt>IMEI</dt>
          <dd className="mono">{v.imeiMasked ?? "—"}</dd>
          {v.phoneMasked && (<><dt>{t("start.phone")}</dt><dd className="mono">{v.phoneMasked}</dd></>)}
          {v.policeRef && (<><dt>{t("ev.police_report")}</dt><dd className="mono">{v.policeRef}</dd></>)}
        </dl>
      </div>

      {v.status === "disputed" && <div className="card danger"><p style={{ margin: 0 }}>{t("case.disputed.note")}</p></div>}

      <h2 style={{ marginTop: 26 }}>{t("case.plan.title")}</h2>
      {groups.map((g) => {
        const steps = v.steps.filter((s) => s.urgency === g);
        return (
          <section key={g}>
            <p className="row" style={{ margin: "14px 0 8px" }}>
              <span className={`badge ${g === "now" ? "danger" : g === "today" ? "warn" : ""}`}>{t(`urgency.${g}`)}</span>
            </p>
            {steps.map((s) => (
              <StepCard key={s.key} step={s} index={++n} view={v} onChange={load} disabled={closed} />
            ))}
          </section>
        );
      })}

      {!closed && (
        <>
          <h2 style={{ marginTop: 30 }}>{t("verify.title")}</h2>
          <Verify view={v} onChange={load} />
          {!v.hasImei && <AddImei onChange={load} />}
        </>
      )}

      <h2 style={{ marginTop: 30 }}>{t("docs.title")}</h2>
      <Complaint />

      <h2 style={{ marginTop: 30 }}>{t("updates.title")}</h2>
      <div className="card">
        {v.hiddenEvents > 0 && <div className="alert info">{t("updates.hidden", { n: v.hiddenEvents })}</div>}
        {v.events.length === 0 ? (
          <p className="muted">{t("updates.none")}</p>
        ) : (
          <ul className="timeline">
            {v.events.map((e) => (
              <li key={e.id} className={e.simulated ? "sim" : undefined}>
                <time dateTime={e.at}>{new Date(e.at).toLocaleString(locale === "en" ? "en-IN" : `${locale}-IN`)}</time>
                {eventText(t, e)} {e.simulated && <span className="badge sim">{t("common.simulated")}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <h2 style={{ marginTop: 30 }}>{t("finish.title")}</h2>
      <Finish view={v} onChange={load} onGone={() => setState("erased")} />
    </>
  );
}

function eventText(t: TFn, e: OwnerEvent): string {
  const p = e.payload ?? {};
  const country = e.country ? t(`country.${e.country}`) : "";
  switch (e.kind) {
    case "owner_notice":
      return t(`n.${p.notice}`, { country });
    case "evidence_added":
      return t("e.evidence_added", { x: t(`ev.${p.evidence}`) });
    case "evidence_reviewed":
      return t("e.evidence_reviewed", { x: `${t(`ev.${p.evidence}`)} — ${t(`ev.${p.decision}`)}` });
    case "block_request_recorded":
      return t("e.block_request_recorded", { x: p.requestId ? `(${p.requestId})` : "" });
    case "dispute_resolved":
      return t(`e.dispute_resolved.${p.outcome}`);
    case "status_changed":
      return t("e.status_changed", { x: t(`status.${p.status}`) });
    case "referral_created":
      return t("e.referral_created", { country });
    case "referral_decided":
      return t(`e.referral_decided.${p.decision}`, { country });
    case "officer_access":
      return t("e.officer_access", { x: p.agency ?? "" });
    default:
      return t(`e.${e.kind}`);
  }
}

function StepCard({ step, index, view, onChange, disabled }: { step: PlaybookStep & { done: boolean }; index: number; view: View; onChange: () => void; disabled: boolean }) {
  const { t } = useI18n();
  const [requestId, setRequestId] = useState("");
  const [busy, setBusy] = useState(false);
  const isBlock = step.key === "block_imei";

  async function toggle(done: boolean) {
    setBusy(true);
    try {
      await api("/api/case/actions", { body: { action: "step", key: step.key, done, requestId: isBlock ? requestId : undefined } });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`step ${step.done ? "done" : ""}`}>
      <div className="step-head">
        <span className="num" aria-hidden="true">{step.done ? "✓" : index}</span>
        <div style={{ flex: 1 }}>
          <h3>{step.title}</h3>
        </div>
      </div>
      {!step.done && (
        <div className="step-body">
          <p>{step.body}</p>
          {step.phones.length > 0 && (
            <p className="row">
              {step.phones.map((p) => (
                <a key={p.label + p.number} className="btn small tel" href={`tel:${p.number}`}>📞 {p.label}: {p.number}</a>
              ))}
            </p>
          )}
          {step.links.length > 0 && (
            <div className="links">
              {step.links.map((l) => (
                <a key={l.url} className="btn small" href={l.url} target="_blank" rel="noopener noreferrer">{l.label} ↗</a>
              ))}
            </div>
          )}
          {isBlock && (
            <div className="card flat">
              <p className="small"><strong>{t("step.docs")}:</strong> {view.blockHandoff.documents.join(" · ")}</p>
              <p className="small muted">{view.blockHandoff.expected}</p>
              <p className="small muted" style={{ marginBottom: 8 }}>{t("step.you")}</p>
              <label className="field" style={{ marginBottom: 0 }}>
                <span className="label small">{t("step.requestId")} <span className="muted">({t("common.optional")})</span></span>
                <input type="text" value={requestId} maxLength={64} onChange={(e) => setRequestId(e.target.value)} />
              </label>
            </div>
          )}
        </div>
      )}
      {!disabled && (
        <div className="step-body">
          {step.done ? (
            <button type="button" className="btn small" disabled={busy} onClick={() => toggle(false)}>{t("step.undo")}</button>
          ) : (
            <button type="button" className="btn small primary" disabled={busy} onClick={() => toggle(true)}>✓ {t("step.mark")}</button>
          )}
        </div>
      )}
    </article>
  );
}

function Verify({ view, onChange }: { view: View; onChange: () => void }) {
  const { t } = useI18n();
  const [otp, setOtp] = useState<{ to: string; demoCode?: string } | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [policeRef, setPoliceRef] = useState("");
  const v = view.verification;
  const pct = Math.min(100, v.score);
  const have = new Map(view.evidence.map((e) => [e.kind, e]));

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setErr("");
    try {
      await fn();
      onChange();
    } catch (x) {
      setErr(errorText(t, x));
    } finally {
      setBusy(false);
    }
  }

  const sendOtp = () => run(async () => setOtp(await api("/api/case/actions", { body: { action: "otp_request" } })));
  const confirmOtp = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api("/api/case/actions", { body: { action: "otp_confirm", code: code.trim() } });
      setOtp(null);
      setCode("");
    });
  };
  const addFile = (kind: string, file: File | undefined) => {
    if (!file) return;
    run(async () => api("/api/case/actions", { body: { action: "evidence", kind, sha256: await sha256File(file), fileName: file.name } }));
  };

  const status = (kind: string) => {
    const e = have.get(kind);
    if (!e) return null;
    return <span className={`badge ${e.status === "accepted" ? "ok" : e.status === "rejected" ? "danger" : "warn"}`}>{t(`ev.${e.status}`)}</span>;
  };

  return (
    <div className="card">
      <p className="muted">{t("verify.lead")}</p>
      <div className="row">
        <strong>{t(`verify.level.${v.effectiveLevel}`)}</strong>
        <span className="muted small">{t("verify.score", { score: v.score, threshold: v.threshold })}</span>
      </div>
      <div className="meter" role="img" aria-label={t("verify.score", { score: v.score, threshold: v.threshold })}>
        <i style={{ width: `${pct}%` }} />
        <b style={{ left: `${v.threshold}%` }} />
      </div>

      {err && <div className="alert error" role="alert">{err}</div>}

      <div className="stack" style={{ marginTop: 16 }}>
        <div className="step">
          <div className="spread">
            <strong>1. {t("otp.title")} <span className="muted small mono">{view.contactMasked}</span></strong>
            {view.contactVerified ? <span className="badge ok">✓ {t("ev.contact_otp")}</span> : null}
          </div>
          {!view.contactVerified && (
            <div style={{ marginTop: 10 }}>
              {!otp ? (
                <button type="button" className="btn primary" disabled={busy} onClick={sendOtp}>{t("otp.send")}</button>
              ) : (
                <form onSubmit={confirmOtp} className="stack">
                  <div className="alert ok">{t("otp.sent", { to: otp.to })}</div>
                  {otp.demoCode && <div className="alert sim">{t("otp.demo", { code: otp.demoCode })}</div>}
                  <div className="row">
                    <input type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("otp.enter")} aria-label={t("otp.enter")} style={{ maxWidth: 180 }} required />
                    <button className="btn primary" disabled={busy}>{t("otp.confirm")}</button>
                    <button type="button" className="btn" disabled={busy} onClick={sendOtp}>{t("otp.send")}</button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

        {have.has("vault_match") && (
          <div className="step">
            <div className="spread"><strong>{t("ev.vault_match")}</strong>{status("vault_match")}</div>
          </div>
        )}

        <div className="step">
          <strong>2. {t("ev.title")}</strong>
          <p className="small muted" style={{ margin: "6px 0 12px" }}>🔒 {t("ev.private")}</p>
          <div className="stack">
            <div className="spread">
              <span>{t("ev.police_report")} {status("police_report")}</span>
              <form className="row" onSubmit={(e) => { e.preventDefault(); run(() => api("/api/case/actions", { body: { action: "evidence", kind: "police_report", reference: policeRef } })).then(() => setPoliceRef("")); }}>
                <input type="text" value={policeRef} onChange={(e) => setPoliceRef(e.target.value)} minLength={3} maxLength={64} required style={{ maxWidth: 220 }} aria-label={t("ev.police_report")} />
                <button className="btn small" disabled={busy}>{t("ev.add")}</button>
              </form>
            </div>
            {(["invoice", "box_label", "id_document"] as const).map((kind) => (
              <div className="spread" key={kind}>
                <span>{t(`ev.${kind}`)} {status(kind)} {have.get(kind)?.fileName && <span className="muted small">({have.get(kind)!.fileName})</span>}</span>
                <label className="btn small">
                  {t("ev.choose")}
                  <input type="file" accept="image/*,application/pdf" hidden disabled={busy} onChange={(e) => addFile(kind, e.target.files?.[0])} />
                </label>
              </div>
            ))}
            <div className="spread">
              <span>{t("ev.account_access")} {status("account_access")}</span>
              {!have.has("account_access") && (
                <button type="button" className="btn small" disabled={busy} onClick={() => run(() => api("/api/case/actions", { body: { action: "evidence", kind: "account_access" } }))}>{t("ev.add")}</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddImei({ onChange }: { onChange: () => void }) {
  const { t } = useI18n();
  const [imei, setImei] = useState("");
  const [err, setErr] = useState("");
  const ok = checkImei(imei).ok;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      await api("/api/case/actions", { body: { action: "imei", imei } });
      onChange();
    } catch (x) {
      setErr(errorText(t, x));
    }
  }
  return (
    <form className="card" onSubmit={save}>
      <h3>{t("imeiadd.title")}</h3>
      <label className="field">
        <input type="text" inputMode="numeric" value={imei} maxLength={20} onChange={(e) => setImei(e.target.value)} aria-label="IMEI" />
        <ImeiHint value={imei} emptyHint={t("imeiadd.once")} />
      </label>
      {err && <div className="alert error" role="alert">{err}</div>}
      <div className="row">
        <button className="btn primary" disabled={!ok}>{t("imeiadd.save")}</button>
        <Link href="/protect#recover" className="btn">{t("recover.title")}</Link>
      </div>
    </form>
  );
}

function Complaint() {
  const { t, locale } = useI18n();
  const [lang, setLang] = useState<Locale>(locale);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => setLang(locale), [locale]);

  async function make() {
    const r = await api<{ text: string }>("/api/case/actions", { body: { action: "complaint", locale: lang } });
    setText(r.text);
    setCopied(false);
  }
  return (
    <div className="card">
      <p className="muted print-hide">{t("docs.lead")}</p>
      <div className="row print-hide">
        <select value={lang} onChange={(e) => setLang(e.target.value as Locale)} style={{ maxWidth: 180 }} aria-label="Language">
          {LOCALES.map((l) => (<option key={l} value={l}>{LOCALE_NAMES[l]}</option>))}
        </select>
        <button type="button" className="btn primary" onClick={make}>{t("docs.make")}</button>
        {text && (
          <>
            <button type="button" className="btn" onClick={() => window.print()}>{t("common.print")}</button>
            <button type="button" className="btn" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { /* clipboard blocked */ } }}>{copied ? t("common.copied") : t("common.copy")}</button>
          </>
        )}
      </div>
      {text && <pre className="doc" lang={lang} style={{ marginTop: 14 }}>{text}</pre>}
    </div>
  );
}

function Finish({ view, onChange, onGone }: { view: View; onChange: () => void; onGone: () => void }) {
  const { t, locale } = useI18n();
  const [err, setErr] = useState("");
  const closed = view.status === "recovered" || view.status === "closed";

  async function recovered() {
    setErr("");
    try {
      await api("/api/case/actions", { body: { action: "recovered" } });
      onChange();
    } catch (x) {
      setErr(errorText(t, x));
    }
  }
  async function erase() {
    if (!window.confirm(t("finish.erase.confirm"))) return;
    setErr("");
    try {
      await api("/api/case", { method: "DELETE" });
      onGone();
    } catch (x) {
      setErr(errorText(t, x));
    }
  }
  async function signout() {
    await api("/api/case/actions", { body: { action: "signout" } });
    onGone();
  }

  return (
    <div className="card">
      {err && <div className="alert error" role="alert">{err}</div>}
      <div className="row">
        {!closed && <button type="button" className="btn primary" onClick={recovered}>🎉 {t("finish.recovered")}</button>}
        <button type="button" className="btn" onClick={signout}>{t("finish.signout")}</button>
        <button type="button" className="btn danger" onClick={erase}>{t("finish.erase")}</button>
      </div>
      <p className="muted small" style={{ margin: "12px 0 0" }}>
        {t("finish.retention", { date: new Date(view.purgeAfter).toLocaleDateString(locale === "en" ? "en-IN" : `${locale}-IN`) })}
      </p>
    </div>
  );
}
