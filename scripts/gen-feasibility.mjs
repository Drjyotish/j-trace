// Regenerates docs/03-feasibility-matrix.md from src/lib/feasibility.ts so the
// document and the in-app page can never drift apart.
//   node scripts/gen-feasibility.mjs        (Node >= 22.18 strips TypeScript types natively)
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const { FEASIBILITY, CAPABILITY_LABEL } = await import("../src/lib/feasibility.ts");

const IN_TRACE = {
  built: "Built & tested",
  handoff: "Guided hand-off to the official page",
  simulated: "Simulated only (labelled)",
  not_built: "Not built",
};

const esc = (s) => String(s).replaceAll("|", "\\|");
const counts = {};
for (const r of FEASIBILITY) counts[r.status] = (counts[r.status] ?? 0) + 1;

let md = `# Phase 3 — Feasibility matrix

*Generated from \`src/lib/feasibility.ts\` by \`scripts/gen-feasibility.mjs\`. The same data drives the in-app page at \`/feasibility\`.*

Every capability requested in the brief, classified. "Difficulty" is the effort to make it **real**, including the legal and partnership work — not the effort to write code.

| Classification | Count |
|---|---|
${Object.entries(CAPABILITY_LABEL).map(([k, v]) => `| ${v} | ${counts[k] ?? 0} |`).join("\n")}

`;

for (const group of [...new Set(FEASIBILITY.map((r) => r.group))]) {
  md += `## ${group}\n\n| Capability | Classification | In J TRACE today | Why | Closest legitimate alternative | Difficulty |\n|---|---|---|---|---|---|\n`;
  for (const r of FEASIBILITY.filter((x) => x.group === group)) {
    md += `| ${esc(r.capability)} | **${CAPABILITY_LABEL[r.status]}** | ${IN_TRACE[r.inTrace]} | ${esc(r.why)} | ${esc(r.alternative)} | ${r.difficulty} |\n`;
  }
  md += "\n";
}

md += `## Reading the matrix

- **Available now** means it runs in this repository today with no one's permission.
- **Requires user permission** means only the account owner can do it, on the vendor's own page; TRACE takes them there.
- **Requires telecom partnership / government authorisation** means the data exists but is not ours to obtain. Where the product flow depends on it, the prototype uses a *simulated* event that is labelled as such everywhere it appears, and that is disabled when \`TRACE_MODE=production\`.
- **Not technically feasible** means no agreement would make it work.
`;

writeFileSync(fileURLToPath(new URL("../docs/03-feasibility-matrix.md", import.meta.url)), md);
console.log(`Wrote docs/03-feasibility-matrix.md (${FEASIBILITY.length} capabilities)`);
