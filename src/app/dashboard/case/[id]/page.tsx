"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "@/lib/client";
import { StaffBar, type StaffInfo } from "@/components/StaffBar";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface StaffCase {
  id: string;
  ref: string;
  scope: "summary" | "full";
  country: string;
  status: string;
  incidentType: string;
  incidentAt: string | null;
  platform: string;
  device: string | null;
  level: number;
  score: number;
  priority: number;
  createdAt: string;
  purgeAfter: string;
  referrals: { id: string; from: string; to: string; status: string; reason: string; legalBasis: string; createdAt: string }[];
  permissions: Record<string, boolean>;
  demo: boolean;
  detail: null | {
    imeiMasked: string | null;
    policeRef: string | null;
    contactVerified: boolean;
    events: { id: string; kind: string; source: string; simulated: boolean; visibility: string; country: string | null; payload: any; at: string }[];
    evidence: { id: string; kind: string; status: string; sha256: string | null; meta: any; createdAt: string }[];
    steps: { key: string; done: boolean }[];
    messages: { id: string; body: string; at: string; author: string; agency: string; role: string }[];
    operators: Record<string, string[]>;
  };
}

const ERR: Record<string, string> = {
  forbidden: "Your role is not allowed to do this.",
  out_of_jurisdiction: "This case is outside your jurisdiction.",
  not_home_jurisdiction: "Only the home jurisdiction can refer a case abroad.",
  foreign_network: "A telecom partner can only report events from its own country's networks.",
  cross_jurisdiction_dispute: "A competing claim is in another jurisdiction — it needs a referral first.",
  invalid_transition: "That status change is not allowed from the current status.",
  referral_exists: "A referral to that country already exists.",
  rate_limited: "Too many requests. Please wait.",
  invalid_input: "Please complete the form (a reason / legal basis of at least 10 characters is required).",
  integration_unavailable: "No real integration is connected; simulation is disabled in production mode.",
};

export default function StaffCasePage() {
  const { id } = useParams<{ id: string }>();
  const [staff, setStaff] = useState<StaffInfo | null>(null);
  const [c, setC] = useState<StaffCase | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "login" | "missing">("loading");
  const [msg, setMsg] = useState<{ kind: "error" | "ok"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [me, data] = await Promise.all([api<{ staff: StaffInfo }>("/api/staff/session"), api<StaffCase>(`/api/staff/cases/${id}`)]);
      setStaff(me.staff);
      setC(data);
      setState("ok");
    } catch (e) {
      setState(e instanceof ApiError && e.status === 401 ? "login" : "missing");
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  const act = useCallback(
    async (body: Record<string, unknown>, okText = "Done."): Promise<any> => {
      setMsg(null);
      try {
        const r = await api(`/api/staff/cases/${id}`, { body });
        setMsg({ kind: "ok", text: okText });
        await load();
        return r;
      } catch (e) {
        setMsg({ kind: "error", text: e instanceof ApiError ? (ERR[e.code] ?? e.code) : "Request failed." });
        return null;
      }
    },
    [id, load],
  );

  if (state === "loading") return <p className="muted">Loading…</p>;
  if (state === "login") return <p>Please <Link href="/dashboard">sign in</Link>.</p>;
  if (state === "missing" || !c || !staff) {
    return (
      <div className="card">
        <h1>Case not available</h1>
        <p>This case does not exist, or it is outside your jurisdiction. The two are deliberately indistinguishable.</p>
        <Link href="/dashboard" className="btn">← Back to queue</Link>
      </div>
    );
  }

  const d = c.detail;
  const p = c.permissions;

  return (
    <>
      <StaffBar staff={staff} />
      <div className="spread">
        <div>
          <h1 style={{ marginBottom: 4 }} className="mono">{c.ref}</h1>
          <p className="muted">{c.incidentType} · {c.device ?? c.platform} · opened {new Date(c.createdAt).toLocaleString("en-IN")}</p>
        </div>
        <div className="row">
          <span className={`prio ${c.priority >= 70 ? "hi" : c.priority >= 40 ? "mid" : ""}`}>Priority {c.priority}</span>
          <span className={`badge ${c.status === "disputed" ? "danger" : "brand"}`}>{c.status}</span>
          <span className="badge">{c.country}</span>
          <span className={`badge ${c.level >= 2 ? "ok" : "warn"}`}>Ownership level {c.level} · score {c.score}</span>
        </div>
      </div>

      {msg && <div className={`alert ${msg.kind}`} role="status">{msg.text}</div>}

      {c.scope === "summary" && (
        <div className="card warn">
          <strong>Summary view.</strong>{" "}
          {staff.role === "admin" || staff.role === "auditor"
            ? "Platform and oversight roles see case metadata only. Personal data and case detail are restricted to police in the case's jurisdiction."
            : "This case was referred to your jurisdiction and is waiting for your decision. Detail and personal data open only after you accept."}
        </div>
      )}

      <Referrals c={c} staff={staff} act={act} onChange={load} setMsg={setMsg} />

      {d && (
        <>
          <div className="grid2">
            <PiiPanel c={c} act={act} />
            <div className="card">
              <h2>Ownership evidence</h2>
              <p className="muted small">Documents stay with the owner; only a SHA-256 fingerprint is held. Ask the owner to present the file and compare the fingerprint before accepting.</p>
              <div className="stack">
                {d.evidence.length === 0 && <p className="muted">No evidence yet.</p>}
                {d.evidence.map((e) => (
                  <div key={e.id} className="step">
                    <div className="spread">
                      <strong>{e.kind.replace("_", " ")}</strong>
                      <span className={`badge ${e.status === "accepted" ? "ok" : e.status === "rejected" ? "danger" : "warn"}`}>{e.status}</span>
                    </div>
                    {e.meta?.reference && <div className="small">Reference: <span className="mono">{e.meta.reference}</span></div>}
                    {e.meta?.mature !== undefined && <div className="small">Vault record older than 7 days: {String(e.meta.mature)}</div>}
                    {e.sha256 && <div className="small mono muted">sha256 {e.sha256.slice(0, 24)}…</div>}
                    {p.reviewEvidence && e.kind !== "contact_otp" && e.kind !== "vault_match" && e.status === "declared" && (
                      <div className="row" style={{ marginTop: 8 }}>
                        <button type="button" className="btn small primary" onClick={() => act({ action: "evidence", evidenceId: e.id, decision: "accepted" }, "Evidence accepted.")}>Accept</button>
                        <button type="button" className="btn small danger" onClick={() => act({ action: "evidence", evidenceId: e.id, decision: "rejected" }, "Evidence rejected.")}>Reject</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid2">
            <div className="card">
              <h2>Device &amp; network events</h2>
              <ul className="timeline">
                {d.events.map((e) => (
                  <li key={e.id} className={e.simulated ? "sim" : undefined}>
                    <time dateTime={e.at}>{new Date(e.at).toLocaleString("en-IN")} · {e.source}</time>
                    <strong>{e.kind.replaceAll("_", " ")}</strong>
                    {e.country && <> · {e.country}</>}
                    {e.payload?.operator && <> · {e.payload.operator}</>}
                    {e.payload?.requestId && <> · <span className="mono">{e.payload.requestId}</span></>}
                    {e.payload?.notice && <> · {e.payload.notice}</>}{" "}
                    {e.simulated && <span className="badge sim">SIMULATED</span>}{" "}
                    <span className="badge">{e.visibility === "owner" ? "owner can see" : "staff only"}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="stack">
              {p.submitEvent && <Simulator c={c} staff={staff} act={act} />}
              {p.setStatus && <StatusPanel c={c} act={act} />}
              {p.resolveDispute && <DisputePanel act={act} />}
              <Messages c={c} act={act} />
            </div>
          </div>
        </>
      )}
      {!d && p.submitEvent && <Simulator c={c} staff={staff} act={act} />}
    </>
  );
}

type Act = (body: Record<string, unknown>, okText?: string) => Promise<any>;

function PiiPanel({ c, act }: { c: StaffCase; act: Act }) {
  const [basis, setBasis] = useState("");
  const [pii, setPii] = useState<Record<string, string | null> | null>(null);
  return (
    <div className="card">
      <h2>Owner &amp; handset identity</h2>
      <dl className="kv">
        <dt>IMEI</dt>
        <dd className="mono">{pii?.imei ?? c.detail?.imeiMasked ?? "not provided"}</dd>
        <dt>Contact verified</dt>
        <dd>{c.detail?.contactVerified ? "yes" : "no"}</dd>
        {c.detail?.policeRef && (<><dt>Police reference</dt><dd className="mono">{c.detail.policeRef}</dd></>)}
        {pii && (
          <>
            <dt>Owner name</dt><dd>{pii.ownerName ?? "—"}</dd>
            <dt>Contact</dt><dd className="mono">{pii.contact ?? "—"}</dd>
            <dt>Lost number</dt><dd className="mono">{pii.phone ?? "—"}</dd>
            <dt>Place</dt><dd>{pii.incidentPlace ?? "—"}</dd>
          </>
        )}
      </dl>
      {!pii && c.permissions.revealPii && (
        <form
          style={{ marginTop: 14 }}
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await act({ action: "reveal", legalBasis: basis }, "Access recorded in the audit trail and disclosed to the owner.");
            if (r) setPii(r);
          }}
        >
          <label className="field">
            <span className="label">Legal basis for access</span>
            <input type="text" value={basis} onChange={(e) => setBasis(e.target.value)} minLength={10} maxLength={300} placeholder="e.g. FIR 0421/2026, s.303 BNS — investigation" required />
            <span className="hint">Recorded permanently against your name. The owner is told that an officer from your agency opened their details.</span>
          </label>
          <button className="btn">Reveal personal data</button>
        </form>
      )}
      {!c.permissions.revealPii && <p className="muted small" style={{ marginTop: 12 }}>Your role cannot view the owner&apos;s identity.</p>}
    </div>
  );
}

function Referrals({ c, staff, act, onChange, setMsg }: { c: StaffCase; staff: StaffInfo; act: Act; onChange: () => void; setMsg: (m: { kind: "error" | "ok"; text: string } | null) => void }) {
  const [to, setTo] = useState(c.country === "IN" ? "NP" : "IN");
  const [reason, setReason] = useState("");
  const [basis, setBasis] = useState("");
  const targets = ["IN", "NP", "AE"].filter((x) => x !== c.country);

  async function decide(id: string, decision: string) {
    try {
      await api(`/api/staff/referrals/${id}`, { body: { decision } });
      setMsg({ kind: "ok", text: `Referral ${decision}.` });
      onChange();
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof ApiError ? (ERR[e.code] ?? e.code) : "Request failed." });
    }
  }

  if (c.referrals.length === 0 && !c.permissions.refer) return null;
  return (
    <div className="card">
      <h2>Cross-border referrals</h2>
      {c.referrals.length === 0 && <p className="muted">None.</p>}
      {c.referrals.map((r) => (
        <div key={r.id} className="step">
          <div className="spread">
            <strong>{r.from} → {r.to}</strong>
            <span className={`badge ${r.status === "accepted" ? "ok" : r.status === "declined" ? "danger" : "warn"}`}>{r.status}</span>
          </div>
          <div className="small">{r.reason}</div>
          <div className="small muted">Legal basis: {r.legalBasis}</div>
          {r.status === "pending" && r.to === staff.jurisdiction && c.permissions.decideReferral && (
            <div className="row" style={{ marginTop: 8 }}>
              <button type="button" className="btn small primary" onClick={() => decide(r.id, "accepted")}>Accept referral</button>
              <button type="button" className="btn small danger" onClick={() => decide(r.id, "declined")}>Decline</button>
            </div>
          )}
        </div>
      ))}
      {c.permissions.refer && (
        <form
          className="stack"
          style={{ marginTop: 12 }}
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await act({ action: "refer", to, reason, legalBasis: basis }, "Referral sent.");
            if (r) { setReason(""); setBasis(""); }
          }}
        >
          <h3>Refer this case to another country</h3>
          <div className="grid2">
            <label className="field">
              <span className="label">To</span>
              <select value={to} onChange={(e) => setTo(e.target.value)}>
                {targets.map((x) => (<option key={x}>{x}</option>))}
              </select>
            </label>
            <label className="field">
              <span className="label">Legal basis / request reference</span>
              <input type="text" value={basis} onChange={(e) => setBasis(e.target.value)} minLength={10} required />
            </label>
          </div>
          <label className="field">
            <span className="label">Reason</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} minLength={10} required />
          </label>
          <button className="btn">Send referral</button>
        </form>
      )}
    </div>
  );
}

function Simulator({ c, staff, act }: { c: StaffCase; staff: StaffInfo; act: Act }) {
  const [kind, setKind] = useState("sim_change");
  const [country, setCountry] = useState(staff.jurisdiction === "ALL" ? c.country : staff.jurisdiction);
  return (
    <div className="card" style={{ borderStyle: "dashed", borderColor: "var(--warn)" }}>
      <h2>Simulation console <span className="badge sim">SIMULATED</span></h2>
      <p className="small muted">
        No operator or regulator feed is connected to J TRACE. This injects a clearly-labelled sample event so the workflow can be demonstrated. It is disabled in production mode.
      </p>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); act({ action: "simulate_event", kind, country }, "Simulated event recorded."); }}>
        <div className="grid2">
          <label className="field">
            <span className="label">Event</span>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="sim_change">Different SIM inserted</option>
              <option value="network_attach">Handset seen on a network</option>
              <option value="registry_blocked">Registry reports IMEI blocked</option>
            </select>
          </label>
          <label className="field">
            <span className="label">Network country</span>
            <select value={country} onChange={(e) => setCountry(e.target.value)} disabled={staff.role === "telecom"}>
              {["IN", "NP", "AE"].map((x) => (<option key={x}>{x}</option>))}
            </select>
          </label>
        </div>
        <button className="btn">Inject simulated event</button>
      </form>
    </div>
  );
}

function StatusPanel({ c, act }: { c: StaffCase; act: Act }) {
  const [note, setNote] = useState("");
  const options: Record<string, string[]> = { open: ["active", "closed"], active: ["recovered", "closed"], referred: ["active", "recovered", "closed"] };
  const next = options[c.status] ?? [];
  if (!next.length) return null;
  return (
    <div className="card">
      <h2>Case status</h2>
      <label className="field">
        <span className="label">Note (kept in the audit trail)</span>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      </label>
      <div className="row">
        {next.map((s) => (
          <button key={s} type="button" className="btn small" onClick={() => act({ action: "status", status: s, note }, `Status set to ${s}.`)}>Mark {s}</button>
        ))}
      </div>
    </div>
  );
}

function DisputePanel({ act }: { act: Act }) {
  const [note, setNote] = useState("");
  return (
    <div className="card danger">
      <h2>Ownership dispute</h2>
      <p className="small">More than one person has claimed this handset. Upholding this claim closes the competing ones. Verify documents in person first.</p>
      <label className="field">
        <span className="label">Basis for the decision</span>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} minLength={10} />
      </label>
      <button type="button" className="btn" onClick={() => act({ action: "resolve_dispute", note }, "Dispute resolved.")}>Uphold this claim</button>
    </div>
  );
}

function Messages({ c, act }: { c: StaffCase; act: Act }) {
  const [body, setBody] = useState("");
  const d = c.detail!;
  if (!c.permissions.message && d.messages.length === 0) return null;
  return (
    <div className="card">
      <h2>Inter-agency messages</h2>
      <p className="small muted">Encrypted at rest. Visible to authorised police and telecom staff on this case, in both jurisdictions once a referral is accepted.</p>
      <div className="stack">
        {d.messages.length === 0 && <p className="muted">No messages.</p>}
        {d.messages.map((m) => (
          <div key={m.id} className="step">
            <div className="small muted">{m.author} · {m.agency} · {new Date(m.at).toLocaleString("en-IN")}</div>
            <div>{m.body}</div>
          </div>
        ))}
      </div>
      {c.permissions.message && (
        <form className="row" style={{ marginTop: 12 }} onSubmit={async (e) => { e.preventDefault(); if (await act({ action: "message", body }, "Message sent.")) setBody(""); }}>
          <input type="text" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} required style={{ flex: 1, minWidth: 180 }} aria-label="Message" />
          <button className="btn">Send</button>
        </form>
      )}
    </div>
  );
}
