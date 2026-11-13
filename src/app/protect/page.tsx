"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/components/I18n";
import { ImeiHint } from "@/components/ImeiHint";
import { api, errorText } from "@/lib/client";
import { checkImei } from "@/lib/imei";

const COUNTRIES = ["IN", "NP", "AE"] as const;
interface Pending {
  requestId: string;
  to?: string;
  demoCode?: string;
}

export default function ProtectPage() {
  const { t } = useI18n();
  return (
    <>
      <h1>{t("protect.title")}</h1>
      <p className="muted" style={{ maxWidth: "46em" }}>{t("protect.lead")}</p>
      <Register />
      <h2 id="recover" style={{ marginTop: 34 }}>{t("recover.title")}</h2>
      <Recover />
    </>
  );
}

function CodeForm({ pending, onConfirm, busy }: { pending: Pending; onConfirm: (code: string) => void; busy: boolean }) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); onConfirm(code.trim()); }}>
      {pending.demoCode && <div className="alert sim">{t("otp.demo", { code: pending.demoCode })}</div>}
      <div className="row">
        <input type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("otp.enter")} aria-label={t("otp.enter")} style={{ maxWidth: 180 }} required />
        <button className="btn primary" disabled={busy}>{t("otp.confirm")}</button>
      </div>
    </form>
  );
}

function Register() {
  const { t } = useI18n();
  const [f, setF] = useState({ country: "IN", imei: "", phone: "", recoveryContact: "", brand: "", model: "", consent: false });
  const [pending, setPending] = useState<Pending | null>(null);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setErr("");
    try {
      await fn();
    } catch (x) {
      setErr(errorText(t, x));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return <div className="card accent"><p style={{ margin: 0 }}>✓ {t("protect.saved")}</p></div>;
  }

  return (
    <div className="card">
      <p className="alert info">{t("protect.dial")}</p>
      {!pending ? (
        <form onSubmit={(e) => { e.preventDefault(); run(async () => setPending(await api<Pending>("/api/vault", { body: { action: "register", ...f } }))); }}>
          <label className="field">
            <span className="label">{t("start.country")}</span>
            <select value={f.country} onChange={(e) => set("country", e.target.value)}>
              {COUNTRIES.map((c) => (<option key={c} value={c}>{t(`country.${c}`)}</option>))}
            </select>
          </label>
          <label className="field">
            <span className="label">{t("start.imei")}</span>
            <input type="text" inputMode="numeric" value={f.imei} maxLength={20} onChange={(e) => set("imei", e.target.value)} required autoComplete="off" />
            <ImeiHint value={f.imei} />
          </label>
          <div className="grid2">
            <label className="field">
              <span className="label">{t("start.brand")} <span className="muted small">({t("common.optional")})</span></span>
              <input type="text" value={f.brand} maxLength={60} onChange={(e) => set("brand", e.target.value)} />
            </label>
            <label className="field">
              <span className="label">{t("start.model")} <span className="muted small">({t("common.optional")})</span></span>
              <input type="text" value={f.model} maxLength={80} onChange={(e) => set("model", e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span className="label">{t("protect.phone")}</span>
            <input type="tel" inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} required />
          </label>
          <label className="field">
            <span className="label">{t("protect.recovery")}</span>
            <input type="text" value={f.recoveryContact} onChange={(e) => set("recoveryContact", e.target.value)} required />
            <span className="hint">{t("protect.recovery.help")}</span>
          </label>
          <label className="check card flat">
            <input type="checkbox" checked={f.consent} onChange={(e) => set("consent", e.target.checked)} />
            <span>{t("protect.consent")}</span>
          </label>
          {err && <div className="alert error" role="alert">{err}</div>}
          <button className="btn primary big" disabled={busy || !f.consent || !checkImei(f.imei).ok}>{t("protect.save")}</button>
        </form>
      ) : (
        <>
          <div className="alert ok">{t("otp.sent", { to: pending.to ?? "" })}</div>
          {err && <div className="alert error" role="alert">{err}</div>}
          <CodeForm pending={pending} busy={busy} onConfirm={(code) => run(async () => { await api("/api/vault", { body: { action: "register_confirm", requestId: pending.requestId, code } }); setDone(true); })} />
        </>
      )}
    </div>
  );
}

function Recover() {
  const { t } = useI18n();
  const [country, setCountry] = useState("IN");
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [result, setResult] = useState<{ imei: string; brand: string | null; model: string | null } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setErr("");
    try {
      await fn();
    } catch (x) {
      setErr(errorText(t, x));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="card accent">
        <span className="muted small">{t("recover.result")} {[result.brand, result.model].filter(Boolean).join(" ")}</span>
        <div className="keybox mono" style={{ margin: "8px 0 14px" }}><strong>{result.imei}</strong></div>
        <Link href="/start" className="btn primary">{t("recover.use")} →</Link>
      </div>
    );
  }

  return (
    <div className="card">
      <p className="muted">{t("recover.lead")}</p>
      {!pending ? (
        <form onSubmit={(e) => { e.preventDefault(); run(async () => setPending(await api<Pending>("/api/vault", { body: { action: "recover", country, phone } }))); }}>
          <div className="grid2">
            <label className="field">
              <span className="label">{t("start.country")}</span>
              <select value={country} onChange={(e) => setCountry(e.target.value)}>
                {COUNTRIES.map((c) => (<option key={c} value={c}>{t(`country.${c}`)}</option>))}
              </select>
            </label>
            <label className="field">
              <span className="label">{t("start.phone")}</span>
              <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </label>
          </div>
          {err && <div className="alert error" role="alert">{err}</div>}
          <button className="btn primary" disabled={busy}>{t("recover.send")}</button>
        </form>
      ) : (
        <>
          <div className="alert info">{t("recover.sent")}</div>
          {err && <div className="alert error" role="alert">{err}</div>}
          <CodeForm pending={pending} busy={busy} onConfirm={(code) => run(async () => setResult(await api("/api/vault", { body: { action: "recover_confirm", requestId: pending.requestId, code } })))} />
        </>
      )}
    </div>
  );
}
