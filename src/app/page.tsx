"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/components/I18n";
import { api, errorText } from "@/lib/client";

export default function Home() {
  const { t } = useI18n();
  const router = useRouter();
  const [showOpen, setShowOpen] = useState(false);
  const [ref, setRef] = useState("");
  const [key, setKey] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function open(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await api("/api/cases/open", { body: { ref: ref.trim(), accessKey: key.trim() } });
      router.push("/case");
    } catch (x) {
      setErr(errorText(t, x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="hero">
        <h1>{t("home.title")}</h1>
        <p className="lead">{t("home.lead")}</p>
        <div className="row" style={{ margin: "18px 0 6px" }}>
          <Link href="/start" className="btn primary big">
            {t("home.cta.start")} →
          </Link>
          <button type="button" className="btn big" onClick={() => setShowOpen((v) => !v)} aria-expanded={showOpen}>
            {t("home.cta.open")}
          </button>
        </div>
      </section>

      {showOpen && (
        <form className="card" onSubmit={open}>
          <h2>{t("home.open.title")}</h2>
          <div className="grid2">
            <label className="field">
              <span className="label">{t("home.open.ref")}</span>
              <input type="text" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="JT-IN-XXXXXXXX" autoCapitalize="characters" required />
            </label>
            <label className="field">
              <span className="label">{t("home.open.key")}</span>
              <input type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" required />
            </label>
          </div>
          {err && <div className="alert error" role="alert">{err}</div>}
          <button className="btn primary" disabled={busy}>{t("home.open.submit")}</button>
        </form>
      )}

      <section className="card accent">
        <h2>{t("home.time.title")}</h2>
        <p style={{ marginBottom: 0 }}>{t("home.time.body")}</p>
      </section>

      <h2 style={{ marginTop: 28 }}>{t("home.honest.title")}</h2>
      <section className="grid2">
        <div className="card">
          <h3>{t("home.can.title")}</h3>
          <ul className="clean ticks">
            {[1, 2, 3, 4, 5].map((n) => (
              <li key={n}>{t(`home.can.${n}`)}</li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h3>{t("home.cannot.title")}</h3>
          <ul className="clean crosses">
            {[1, 2, 3, 4].map((n) => (
              <li key={n}>{t(`home.cannot.${n}`)}</li>
            ))}
          </ul>
          <p className="small" style={{ marginTop: 12, marginBottom: 0 }}>
            <Link href="/feasibility">{t("nav.feasibility")} →</Link>
          </p>
        </div>
      </section>

      <section className="grid2">
        <Link href="/protect" className="card" style={{ textDecoration: "none", color: "inherit" }}>
          <h3>{t("protect.title")} →</h3>
          <p className="muted" style={{ marginBottom: 0 }}>{t("protect.dial")}</p>
        </Link>
        <Link href="/protect#recover" className="card" style={{ textDecoration: "none", color: "inherit" }}>
          <h3>{t("recover.title")} →</h3>
          <p className="muted" style={{ marginBottom: 0 }}>{t("recover.lead")}</p>
        </Link>
      </section>
    </>
  );
}
