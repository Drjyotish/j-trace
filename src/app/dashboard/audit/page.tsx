"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "@/lib/client";
import { StaffBar, type StaffInfo } from "@/components/StaffBar";

interface Audit {
  chain: { ok: boolean; entries: number; brokenAtSeq?: number; head?: string };
  entries: { seq: number; at: string; actorType: string; actorId: string; action: string; caseId: string | null; detail: Record<string, unknown>; hash: string }[];
}

export default function AuditPage() {
  const [staff, setStaff] = useState<StaffInfo | null>(null);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [error, setError] = useState("");
  const [purge, setPurge] = useState("");

  const load = useCallback(async () => {
    try {
      const me = await api<{ staff: StaffInfo }>("/api/staff/session");
      setStaff(me.staff);
      setAudit(await api<Audit>("/api/staff/audit"));
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? "login" : "forbidden");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (error === "login") return <p>Please <Link href="/dashboard">sign in</Link>.</p>;
  if (error) {
    return (
      <>
        {staff && <StaffBar staff={staff} />}
        <div className="card warn">The audit trail is available to administrators and auditors only.</div>
      </>
    );
  }
  if (!audit || !staff) return <p className="muted">Loading…</p>;

  async function runRetention() {
    try {
      const r = await api<{ purgedCases: number; purgedOtps: number; purgedDevices: number }>("/api/staff/audit", { method: "POST" });
      setPurge(`Retention run: ${r.purgedCases} case(s), ${r.purgedOtps} expired code(s), ${r.purgedDevices} unconfirmed vault record(s) deleted.`);
      load();
    } catch {
      setPurge("Only administrators can run the retention purge.");
    }
  }

  return (
    <>
      <h1>Audit trail</h1>
      <StaffBar staff={staff} />
      <div className={`card ${audit.chain.ok ? "accent" : "danger"}`}>
        <h2>{audit.chain.ok ? "✓ Hash chain verified" : "✕ Hash chain BROKEN"}</h2>
        <p style={{ marginBottom: 0 }}>
          {audit.chain.ok
            ? `All ${audit.chain.entries} entries were recomputed just now. Each entry commits to the one before it, so any edit or deletion would be detected.`
            : `Tampering detected at entry #${audit.chain.brokenAtSeq}.`}
          {audit.chain.head && <span className="mono small muted"> head {audit.chain.head.slice(0, 16)}…</span>}
        </p>
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        {staff.role === "admin" && <button type="button" className="btn small" onClick={runRetention}>Run retention purge now</button>}
        {purge && <span className="small muted">{purge}</span>}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>#</th><th>When</th><th>Actor</th><th>Action</th><th>Case</th><th>Detail (no personal data)</th><th>Hash</th></tr>
          </thead>
          <tbody>
            {audit.entries.map((e) => (
              <tr key={e.seq}>
                <td>{e.seq}</td>
                <td className="nowrap">{new Date(e.at).toLocaleString("en-IN")}</td>
                <td><span className="badge">{e.actorType}</span> <span className="mono small">{e.actorId.slice(0, 8)}</span></td>
                <td><strong>{e.action}</strong></td>
                <td className="mono small">{e.caseId ? e.caseId.slice(0, 8) : "—"}</td>
                <td className="small">{Object.keys(e.detail).length ? JSON.stringify(e.detail) : "—"}</td>
                <td className="mono small muted">{e.hash}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
