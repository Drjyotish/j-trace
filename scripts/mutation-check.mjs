// Sanity check for the test suite: break one security rule at a time and
// confirm the tests notice. Restores every file afterwards.
//   node scripts/mutation-check.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const MUTATIONS = [
  {
    name: "Jurisdiction: foreign officers get full access",
    file: "src/lib/rbac.ts",
    from: 'if (mine.some((r) => r.status === "pending")) return "summary";\n  return "none";',
    to: 'if (mine.some((r) => r.status === "pending")) return "summary";\n  return "full";',
    tests: "tests/unit.test.ts tests/staff.test.ts",
  },
  {
    name: "Ownership: self-declared evidence counts in full",
    file: "src/lib/ownership.ts",
    from: 'points = it.status === "accepted" ? w : Math.floor(w / 2);',
    to: "points = w;",
    tests: "tests/unit.test.ts tests/owner.test.ts",
  },
  {
    name: "Disclosure: network notices shown to unverified owners",
    file: "src/lib/services/owner.ts",
    from: "const visible = events.filter((e) => e.min_level <= level && OWNER_EVENT_TEXT_KEYS.has(e.kind));",
    to: "const visible = events.filter((e) => OWNER_EVENT_TEXT_KEYS.has(e.kind));",
    tests: "tests/staff.test.ts",
  },
  {
    name: "Audit: chain verification always passes",
    file: "src/lib/audit.ts",
    from: "if (r.seq !== expectedSeq || r.prev_hash !== prev || r.hash !== h) {",
    to: "if (false) {",
    tests: "tests/staff.test.ts",
  },
  {
    name: "Enumeration: vault lookup reveals unknown numbers",
    file: "src/lib/services/vault.ts",
    from: "return { requestId, demoCode: isDemo() ? code : undefined, simulatedDelivery: true };\n}\n\nexport async function confirmImeiRecovery",
    to: "return { requestId, demoCode: isDemo() && dev ? code : undefined, simulatedDelivery: true };\n}\n\nexport async function confirmImeiRecovery",
    tests: "tests/owner.test.ts",
  },
  {
    name: "PII: reveal works without a legal basis",
    file: "src/lib/services/staff.ts",
    from: 'if (basis.length < 10) throw invalid("legalBasis", "too_short");',
    to: "",
    tests: "tests/staff.test.ts tests/api.test.ts",
  },
];

let caught = 0;
for (const m of MUTATIONS) {
  const original = readFileSync(m.file, "utf8");
  if (!original.includes(m.from)) {
    console.log(`SKIPPED  ${m.name} (pattern not found)`);
    continue;
  }
  writeFileSync(m.file, original.replace(m.from, m.to));
  try {
    const r = spawnSync(`npx vitest run ${m.tests}`, { shell: true, encoding: "utf8" });
    const out = (r.stdout ?? "") + (r.stderr ?? "");
    const failed = /(\d+) failed/.exec(out.split("\n").filter((l) => l.includes("Tests")).join(" "))?.[1] ?? "0";
    const ok = r.status !== 0 && Number(failed) > 0;
    if (ok) caught++;
    console.log(`${ok ? "CAUGHT " : "MISSED "}  ${m.name} — ${failed} test(s) failed`);
  } finally {
    writeFileSync(m.file, original);
  }
}
console.log(`\n${caught}/${MUTATIONS.length} mutations caught`);
process.exit(caught === MUTATIONS.length ? 0 : 1);
