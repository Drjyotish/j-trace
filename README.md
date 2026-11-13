# J TRACE

**An open-source, privacy-first recovery assistant for lost and stolen phones in India, Nepal and the UAE.**

J TRACE does **not** track phones. No independent service lawfully can. What it does is make the first hour after a loss fast and correct, verify ownership in a way that resists abuse, and give authorised police a case and cross-border referral tool with a tamper-evident audit trail.

> **Status: working prototype.** Every network and registry event in the app is **simulated and labelled**. J TRACE has no government or telecom agreements and is not affiliated with any government, regulator, operator or device maker. Do not enter real personal data into a demo deployment.

## What works today

| | |
|---|---|
| ✅ Real | Multilingual first-hour checklist (English, हिन्दी, नेपाली) with official links and helplines for 3 countries × 3 device types |
| ✅ Real | Police complaint generator in three languages |
| ✅ Real | Pre-loss device vault: recover your IMEI from your phone number — only via the recovery contact you chose |
| ✅ Real | Ownership verification: contact code, vault match, document fingerprints (files never leave the device), officer review, dispute freeze |
| ✅ Real | Officer dashboard: roles, jurisdiction limits, break-glass PII access with legal basis, cross-border referrals, encrypted messages, hash-chained audit log, retention purge |
| 🔗 Hand-off | IMEI blocking (Sanchar Saathi/CEIR, NTA MDMS, e&/du), Google Find Hub, Apple Find My, Samsung Find — you act on the official page |
| 🧪 Simulated | SIM-change, network-sighting, cross-border and registry-status events (demo mode only, always badged) |
| ❌ Not possible | IMEI → location, phone number → IMEI from operators, reset/resale detection. See [the reality check](docs/01-reality-check.md) |

## Read the reasoning

| Phase | Document |
|---|---|
| 1 | [Reality check](docs/01-reality-check.md) — which assumptions fail, and why |
| 2 | [Global research](docs/02-global-research.md) — CEIR, MDMS, TDRA, GSMA, Google/Apple, open source; sourced and dated |
| 3 | [Feasibility matrix](docs/03-feasibility-matrix.md) — every capability classified |
| 4 | [Product blueprint](docs/04-product-blueprint.md) — journeys, architecture, schema, API |
| 5 | Working MVP — this repository |
| 6 | [Test report](docs/07-test-report.md) — 108 tests, actual results, mutation check |
| 7 | [Launch strategy](docs/06-launch-strategy.md) — partners, pilot, budget, SLOs, 30/60/90 |
| — | [Security & privacy](docs/05-security-privacy.md) — threat model mapped to code and tests |

## Run it locally

Requires Node.js 20 or newer. No database to install: the prototype uses an embedded PostgreSQL (PGlite) stored in `.data/`.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000. Demo data (fictional people, handsets and agencies) is loaded on first start.

- **Public portal:** `/` → *Start recovery now*.
- **Officer dashboard:** `/dashboard` lists the demo accounts with one-click sign-in (police in each country, a telecom partner, an admin, an auditor, and one unverified account that is refused). The shared demo password is defined in [`src/lib/seed.ts`](src/lib/seed.ts).

```bash
npm test
```

```bash
node scripts/mutation-check.mjs
```

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `TRACE_MODE` | `demo` | `demo`: seed data, simulated adapters, codes shown on screen. `production`: none of those; secrets required |
| `TRACE_SECRET` | demo constant | Master secret (≥ 32 chars) from which encryption, HMAC and session keys are derived. **Mandatory in production** |
| `DATABASE_URL` | — | PostgreSQL connection string. If unset, PGlite is used (file-backed locally, in-memory on serverless) |
| `TRACE_DB` | — | `memory` forces an in-memory database |
| `TRACE_SEED` | on | `off` skips demo data in demo mode |

See [`.env.example`](.env.example).

## Deploy

**Demo on Vercel (free tier):** import the repository; no settings are needed. Without `DATABASE_URL` the demo runs on an in-memory database, so data resets whenever the serverless instance restarts and is not shared between instances. That is fine for a demonstration and wrong for anything else.

**Persistent deployment:** create a PostgreSQL database (in-region for your users), set `DATABASE_URL`, `TRACE_SECRET` and `TRACE_MODE=production`, and create staff accounts directly in `staff_users` (there is deliberately no self-registration). Before any real use, complete the items under "Known gaps" in [docs/05-security-privacy.md](docs/05-security-privacy.md): message delivery, staff MFA, shared rate-limit store, security review, legal review.

## Project layout

```
src/app/                 pages and API route handlers (Next.js App Router)
src/lib/services/        owner, vault and staff business logic
src/lib/                 crypto, imei, rbac, ownership, audit, ratelimit, playbook, adapters, schema
src/components/          i18n provider, shell, shared UI
tests/                   unit, owner, staff and HTTP tests (Vitest + in-memory PostgreSQL)
docs/                    research, feasibility, blueprint, security, launch plan, test report
scripts/                 feasibility doc generator, mutation check
```

## Principles

1. **Never fabricate capability.** If TRACE cannot do something, the interface says so and points to who can.
2. **Location is for police, under law.** Owners get coarse status; the data model has no coordinates.
3. **Typing is not proof.** Nothing a claimant can merely enter unlocks disclosure.
4. **Every access leaves a mark** — in a hash chain, and on the owner's own timeline.
5. **Collect little, keep it briefly, delete on request.**

## Contributing

Issues and pull requests are welcome — especially native-speaker corrections to the Hindi and Nepali text, state-specific police portal links, and accessibility fixes. Please do not submit anything that looks up, infers or tracks a device or person without their verified consent; it will be declined. Security reports: see [SECURITY.md](SECURITY.md).

## Licence

[MIT](LICENSE). Third-party components: Next.js and React (MIT), PGlite (Apache-2.0), node-postgres (MIT), jose (MIT), Vitest (MIT).
