"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "@/lib/client";
import { StaffBar, type StaffInfo } from "@/components/StaffBar";

interface QueueCase {
  id: string;
  ref: string;
  country: string;
  status: string;
  incidentType: string;
  device: string | null;
  level: number;
  priority: number;
  scope: string;
  simChange: boolean;
  crossBorder: boolean;
  referral: { to: string; status: string }[];
  createdAt: string;
}
interface Queue {
  staff: StaffInfo;
  stats: { total: number; open: number; disputed: number; crossBorder: number; recovered: number };
  cases: QueueCase[];
}
interface Meta {
  demo: boolean;
  demoAccounts: { email: string; note: string; verified: boolean }[];
  demoPassword: string | null;
}

export default function Dashboard() {
  const router = useRouter();
  const [queue, setQueue] = useState<Queue | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [filter, setFilter] = useState("open");

  const load = useCallback(async () => {
    try {
      setQueue(await api<Queue>("/api/staff/cases"));
      setNeedLogin(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setNeedLogin(true);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (needLogin) return <Login onDone={load} />;
  if (!queue) return <p className="muted">Loading…</p>;

  const openStatuses = ["open", "active", "referred", "disputed"];
  const rows = queue.cases.filter((c) =>
    filter === "all" ? true : filter === "open" ? openStatuses.includes(c.status) : filter === "cross" ? c.crossBorder : c.status === filter,
  );

  return (
    <>
      <h1>Authorised recovery dashboard</h1>
      <StaffBar staff={queue.staff} />
      <div className="grid3" style={{ marginBottom: 18 }}>
        <div className="stat"><b>{queue.stats.open}</b><span>Open cases in your scope</span></div>
        <div className="stat"><b>{queue.stats.crossBorder}</b><span>With a cross-border signal</span></div>
        <div className="stat"><b>{queue.stats.disputed}</b><span>Ownership disputes</span></div>
        <div className="stat"><b>{queue.stats.recovered}</b><span>Recovered</span></div>
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        {[["open", "Open"], ["cross", "Cross-border"], ["disputed", "Disputed"], ["referred", "Referred"], ["all", "All"]].map(([v, label]) => (
          <button key={v} type="button" className={`btn small ${filter === v ? "primary" : ""}`} onClick={() => setFilter(v)}>{label}</button>
        ))}
        <span className="muted small right">
          You see {queue.staff.jurisdiction === "ALL" ? "metadata for all countries (no personal data)" : `cases from ${queue.staff.jurisdiction} and cases referred to it`}.
        </span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Priority</th>
              <th>Case</th>
              <th>Type</th>
              <th>Device</th>
              <th>Status</th>
              <th>Ownership</th>
              <th>Signals</th>
              <th>Opened</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} className="muted center">No cases match this filter.</td></tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} className="clickable" onClick={() => router.push(`/dashboard/case/${c.id}`)}>
                <td><span className={`prio ${c.priority >= 70 ? "hi" : c.priority >= 40 ? "mid" : ""}`}>{c.priority}</span></td>
                <td>
                  <Link href={`/dashboard/case/${c.id}`} className="mono" onClick={(e) => e.stopPropagation()}>{c.ref}</Link>
                  {c.scope !== "full" && <div><span className="badge">summary only</span></div>}
                </td>
                <td>{c.incidentType}</td>
                <td>{c.device ?? "—"}</td>
                <td>
                  <span className={`badge ${c.status === "disputed" ? "danger" : c.status === "recovered" ? "ok" : "brand"}`}>{c.status}</span>
                  {c.referral.map((r) => (<div key={r.to}><span className="badge warn">→ {r.to}: {r.status}</span></div>))}
                </td>
                <td>Level {c.level}</td>
                <td>
                  {c.simChange && <span className="badge sim">SIM change · SIMULATED</span>}{" "}
                  {c.crossBorder && <span className="badge sim">Cross-border · SIMULATED</span>}
                  {!c.simChange && !c.crossBorder && <span className="muted">—</span>}
                </td>
                <td className="nowrap">{new Date(c.createdAt).toLocaleDateString("en-IN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<Meta | null>(null);

  useEffect(() => {
    api<Meta>("/api/meta").then(setMeta).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent, as?: string) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await api("/api/staff/session", { body: { email: as ?? email, password: as ? meta?.demoPassword : password } });
      onDone();
    } catch (x) {
      setErr(x instanceof ApiError && x.code === "rate_limited" ? "Too many attempts. Try again later." : "Sign-in failed. Check your details, or your account may not be verified yet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid2">
      <form className="card" onSubmit={submit}>
        <h1 style={{ fontSize: "1.5rem" }}>Officer sign-in</h1>
        <p className="muted">For verified police, telecom and oversight staff. Accounts are created by an administrator after the agency is confirmed — there is no self-registration.</p>
        <label className="field">
          <span className="label">Official e-mail</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
        </label>
        <label className="field">
          <span className="label">Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        {err && <div className="alert error" role="alert">{err}</div>}
        <button className="btn primary" disabled={busy}>Sign in</button>
      </form>

      {meta?.demo && (
        <div className="card">
          <h2>Demo accounts</h2>
          <p className="alert sim">All accounts, agencies and cases below are fictional. One click signs you in.</p>
          <div className="stack">
            {meta.demoAccounts.map((a) => (
              <div key={a.email} className="spread">
                <div>
                  <strong>{a.note}</strong>
                  <div className="muted small mono">{a.email}</div>
                </div>
                <button type="button" className="btn small" disabled={busy} onClick={(e) => submit(e, a.email)}>
                  {a.verified ? "Sign in" : "Try (refused)"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
