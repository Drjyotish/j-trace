"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/components/I18n";
import { ImeiHint } from "@/components/ImeiHint";
import { api, errorText } from "@/lib/client";
import { checkImei } from "@/lib/imei";

const COUNTRIES = ["IN", "NP", "AE"] as const;

export default function StartPage() {
  const { t, locale } = useI18n();
  const [stage, setStage] = useState(1);
  const [f, setF] = useState({
    country: "IN", incidentType: "stolen", incidentAt: "", incidentPlace: "",
    platform: "android", brand: "", model: "", phone: "", imei: "",
    ownerName: "", contact: "", consent: false,
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ ref: string; accessKey: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const imeiState = f.imei.trim() ? checkImei(f.imei) : null;

  function next(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (stage === 2 && imeiState && !imeiState.ok) return;
    setStage((s) => s + 1);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await api<{ ref: string; accessKey: string }>("/api/cases", {
        body: { ...f, incidentAt: f.incidentAt ? new Date(f.incidentAt).toISOString() : null, locale },
      });
      setCreated(res);
    } catch (x) {
      setErr(errorText(t, x));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(`J TRACE\n${t("home.open.ref")}: ${created.ref}\n${t("home.open.key")}: ${created.accessKey}`);
      setCopied(true);
    } catch {
      /* clipboard blocked: the values are on screen */
    }
  }

  if (created) {
    return (
      <div className="card accent">
        <h1>{t("start.created.title")}</h1>
        <p>{t("start.created.save")}</p>
        <div className="keybox stack">
          <div>
            <span className="muted small">{t("home.open.ref")}</span>
            <div className="mono"><strong>{created.ref}</strong></div>
          </div>
          <div>
            <span className="muted small">{t("home.open.key")}</span>
            <div className="mono"><strong>{created.accessKey}</strong></div>
          </div>
        </div>
        <div className="row" style={{ marginTop: 16 }}>
          <button type="button" className="btn" onClick={copy}>{copied ? t("common.copied") : t("common.copy")}</button>
          <Link href="/case" className="btn primary big">{t("start.created.go")} →</Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <h1>{t("start.title")}</h1>
      <div className="progress" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <div key={n} className={stage >= n ? "on" : undefined}>{n}. {t(`start.s${n}`)}</div>
        ))}
      </div>

      {stage === 1 && (
        <form className="card" onSubmit={next}>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: "0 0 16px" }}>
            <span className="label">{t("start.country")}</span>
            <div className="choice">
              {COUNTRIES.map((c) => (
                <label key={c}>
                  <input type="radio" name="country" checked={f.country === c} onChange={() => set("country", c)} />
                  {t(`country.${c}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: "0 0 16px" }}>
            <span className="label">{t("start.type")}</span>
            <div className="choice">
              {(["stolen", "lost"] as const).map((v) => (
                <label key={v}>
                  <input type="radio" name="type" checked={f.incidentType === v} onChange={() => set("incidentType", v)} />
                  {t(`start.${v}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid2">
            <label className="field">
              <span className="label">{t("start.when")} <span className="muted small">({t("common.optional")})</span></span>
              <input type="datetime-local" value={f.incidentAt} onChange={(e) => set("incidentAt", e.target.value)} />
            </label>
            <label className="field">
              <span className="label">{t("start.place")} <span className="muted small">({t("common.optional")})</span></span>
              <input type="text" value={f.incidentPlace} maxLength={200} onChange={(e) => set("incidentPlace", e.target.value)} />
            </label>
          </div>
          <button className="btn primary big">{t("common.continue")} →</button>
        </form>
      )}

      {stage === 2 && (
        <form className="card" onSubmit={next}>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: "0 0 16px" }}>
            <span className="label">{t("start.platform")}</span>
            <div className="choice">
              {(["android", "ios", "other"] as const).map((v) => (
                <label key={v}>
                  <input type="radio" name="platform" checked={f.platform === v} onChange={() => set("platform", v)} />
                  {t(`start.${v}`)}
                </label>
              ))}
            </div>
          </fieldset>
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
            <span className="label">{t("start.phone")} <span className="muted small">({t("common.optional")})</span></span>
            <input type="tel" inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="off" />
          </label>
          <label className="field">
            <span className="label">{t("start.imei")} <span className="muted small">({t("common.optional")})</span></span>
            <input type="text" inputMode="numeric" value={f.imei} maxLength={20} onChange={(e) => set("imei", e.target.value)} autoComplete="off" />
            <ImeiHint value={f.imei} emptyHint={t("start.imei.help")} />
          </label>
          <div className="row">
            <button type="button" className="btn" onClick={() => setStage(1)}>← {t("common.back")}</button>
            <button className="btn primary big" disabled={!!imeiState && !imeiState.ok}>{t("common.continue")} →</button>
          </div>
        </form>
      )}

      {stage === 3 && (
        <form className="card" onSubmit={submit}>
          <label className="field">
            <span className="label">{t("start.name")} <span className="muted small">({t("common.optional")})</span></span>
            <input type="text" value={f.ownerName} maxLength={120} onChange={(e) => set("ownerName", e.target.value)} autoComplete="name" />
          </label>
          <label className="field">
            <span className="label">{t("start.contact")}</span>
            <input type="text" value={f.contact} onChange={(e) => set("contact", e.target.value)} required autoComplete="email" />
            <span className="hint">{t("start.contact.help")}</span>
          </label>
          <label className="check card flat">
            <input type="checkbox" checked={f.consent} onChange={(e) => set("consent", e.target.checked)} />
            <span>{t("start.consent")}</span>
          </label>
          {err && <div className="alert error" role="alert">{err}</div>}
          <div className="row">
            <button type="button" className="btn" onClick={() => setStage(2)}>← {t("common.back")}</button>
            <button className="btn primary big" disabled={busy || !f.consent}>{t("start.submit")}</button>
          </div>
        </form>
      )}
    </>
  );
}
