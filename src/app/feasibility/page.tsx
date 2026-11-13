import { CAPABILITY_LABEL, FEASIBILITY } from "@/lib/feasibility";
import { INTEGRATIONS } from "@/lib/adapters";
import type { Capability } from "@/lib/playbook";

const IN_TRACE: Record<string, { label: string; cls: string }> = {
  built: { label: "Built & tested", cls: "ok" },
  handoff: { label: "Guided hand-off to official page", cls: "info" },
  simulated: { label: "Simulated only", cls: "sim" },
  not_built: { label: "Not built", cls: "" },
};

const MODE: Record<string, { label: string; cls: string }> = {
  user_directed: { label: "Live — user does it on the official page", cls: "ok" },
  simulated: { label: "Simulated", cls: "sim" },
  unavailable: { label: "Not connected", cls: "" },
};

const ORDER: Capability[] = ["AVAILABLE_NOW", "REQUIRES_USER_PERMISSION", "REQUIRES_TELECOM_PARTNERSHIP", "REQUIRES_GOVERNMENT_AUTHORIZATION", "NOT_TECHNICALLY_FEASIBLE"];

export default function FeasibilityPage() {
  const groups = Array.from(new Set(FEASIBILITY.map((r) => r.group)));
  return (
    <>
      <h1>What is actually possible</h1>
      <p className="muted" style={{ maxWidth: "52em" }}>
        J TRACE is an independent open-source project with no government or telecom agreements. This page states, capability by capability,
        what works today, what needs someone else&apos;s permission, and what cannot be done at all. Nothing on this site tracks a phone.
      </p>

      <div className="grid3" style={{ margin: "18px 0 26px" }}>
        {ORDER.map((c) => (
          <div className="stat" key={c}>
            <b>{FEASIBILITY.filter((r) => r.status === c).length}</b>
            <span className={`badge ${c}`}>{CAPABILITY_LABEL[c]}</span>
          </div>
        ))}
      </div>

      {groups.map((g) => (
        <section key={g} style={{ marginBottom: 26 }}>
          <h2>{g}</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: "24%" }}>Capability</th>
                  <th>Classification</th>
                  <th>In J TRACE today</th>
                  <th style={{ width: "30%" }}>Why</th>
                  <th style={{ width: "20%" }}>Closest legitimate alternative</th>
                </tr>
              </thead>
              <tbody>
                {FEASIBILITY.filter((r) => r.group === g).map((r) => (
                  <tr key={r.capability}>
                    <td><strong>{r.capability}</strong></td>
                    <td><span className={`badge ${r.status}`}>{CAPABILITY_LABEL[r.status]}</span></td>
                    <td><span className={`badge ${IN_TRACE[r.inTrace].cls}`}>{IN_TRACE[r.inTrace].label}</span></td>
                    <td>{r.why}</td>
                    <td>{r.alternative}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <h2>Integration status</h2>
      <p className="muted">Every external system J TRACE touches or would like to, and how it is connected right now.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>System</th>
              <th>Region</th>
              <th>Status in this deployment</th>
              <th>What a real integration needs</th>
            </tr>
          </thead>
          <tbody>
            {INTEGRATIONS.map((i) => (
              <tr key={i.id}>
                <td>
                  <strong>{i.name}</strong>
                  {i.url && (
                    <>
                      <br />
                      <a className="small" href={i.url} target="_blank" rel="noopener noreferrer">official page ↗</a>
                    </>
                  )}
                </td>
                <td>{i.country}</td>
                <td><span className={`badge ${MODE[i.mode].cls}`}>{MODE[i.mode].label}</span></td>
                <td>{i.needs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card warn" style={{ marginTop: 26 }}>
        <h3>Why the owner never gets a location from J TRACE</h3>
        <p style={{ marginBottom: 0 }}>
          A service that turns a phone number or IMEI into a location is a stalking tool, whatever its intentions. Network traces go to police
          under legal authority in every country covered here. J TRACE keeps to that line: verified owners receive coarse status notices,
          officers work inside their own jurisdiction, and every access to personal data is logged and shown to the owner.
        </p>
      </div>
    </>
  );
}
