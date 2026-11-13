"use client";

import Link from "next/link";
import { api } from "@/lib/client";

export interface StaffInfo {
  id: string;
  name: string;
  email: string;
  role: string;
  agency: string;
  jurisdiction: string;
}

export async function signOut() {
  await api("/api/staff/session", { method: "DELETE" });
  window.location.href = "/dashboard";
}

export function StaffBar({ staff }: { staff: StaffInfo }) {
  return (
    <div className="card flat spread" style={{ padding: "12px 16px" }}>
      <div>
        <strong>{staff.name}</strong> <span className="badge brand">{staff.role}</span> <span className="badge">{staff.jurisdiction}</span>
        <div className="muted small">{staff.agency}</div>
      </div>
      <div className="row">
        <Link href="/dashboard" className="btn small">Case queue</Link>
        {(staff.role === "admin" || staff.role === "auditor") && <Link href="/dashboard/audit" className="btn small">Audit trail</Link>}
        <button type="button" className="btn small" onClick={signOut}>Sign out</button>
      </div>
    </div>
  );
}
