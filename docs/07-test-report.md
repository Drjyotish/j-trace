# Phase 6 — Test report

*Run on 13 November 2026 · Windows 11 · Node 24.20 · Next.js 16.4.6 · Vitest 5.1 · PGlite 0.5.16 (in-memory PostgreSQL per test file).*

These are results from actually running the suite, not expected results.

## Summary

| Suite | File | Tests | Passed | Failed |
|---|---|---|---|---|
| Unit: IMEI, crypto, phone, rate limits, ownership scoring, RBAC, playbook, adapters | `tests/unit.test.ts` | 32 | 32 | 0 |
| Owner workflow against the database | `tests/owner.test.ts` | 35 | 35 | 0 |
| Staff, jurisdiction, audit, retention | `tests/staff.test.ts` | 24 | 24 | 0 |
| HTTP route handlers + demo seed | `tests/api.test.ts` | 17 | 17 | 0 |
| **Total** | | **108** | **108** | **0** |

Duration ≈ 18 s. Also clean: `tsc --noEmit` (strict) and `next build` (22 routes).

Reproduce:

```bash
npm test
```

## Do the tests actually bite? (mutation check)

`scripts/mutation-check.mjs` breaks one security rule at a time, re-runs the relevant tests and restores the file.

| Deliberate defect | Result |
|---|---|
| Foreign officers get full access to any case | **Caught** — 6 tests failed |
| Self-declared evidence counts in full | **Caught** — 2 tests failed |
| Network notices shown to unverified owners | **Caught** — 1 test failed |
| Audit-chain verification always passes | **Caught** — 1 test failed |
| Vault lookup reveals whether a number is registered | **Caught** — 1 test failed |
| PII reveal works without a legal basis | **Caught** — 2 tests failed |

6 of 6 caught. This is a spot check of six rules, not full mutation coverage.

## What is covered

**Ownership verification** — one-time code: correct code, wrong code, expiry, lock after 5 attempts (even for the right code), single-use, new code invalidates old, per-contact rate limit, hash-only storage. Scoring: typed evidence alone never reaches level 2; mature vault record does; a fresh one does not; officer acceptance reaches level 3; a client cannot assert system evidence.

**Security** — identifiers encrypted and pseudonymised at rest (row dumps contain no plaintext); GCM tamper detection; uniform answers for wrong key vs. unknown case, known vs. unknown vault number, and all four sign-in failure modes; brute-force lockouts; forged, `alg=none` and cross-audience session tokens rejected; cross-origin POST rejected; SQL-injection strings handled as data; 20 kB body limit; 429 with `Retry-After`.

**Access control** — per-role permissions; an officer's queue contains only their country; out-of-scope cases return 404; admin and auditor never receive detail or PII; telecom never learns the owner's identity; PII reveal needs a legal basis, is audited, rate-limited and shown to the owner; a disabled officer is locked out on the next request.

**Recovery workflows** — case creation in three languages; checklist completeness for 3 countries × 3 platforms × 3 languages; all links HTTPS and first-party; complaint drafts in English, Hindi and Nepali; vault registration and IMEI recovery; competing claims freeze both cases; officer dispute resolution; India → Nepal referral life-cycle including pending/accepted/declined visibility and the ban on onward referral; simulated network events reach officers in full and owners only as coarse notices.

**Integrity and retention** — audit chain detects an edited row and a deleted row, stays gap-free under 12 concurrent writers, and contains no raw identifiers; retention purges due cases, spares disputed/referred ones, and leaves an audit entry; owner erasure cascades to every table.

**Error handling** — invalid country, IMEI (wrong length, bad check digit, placeholder), phone, contact, future date, missing consent, malformed JSON, non-object JSON, oversized body, unknown actions, invalid status transitions.

## Manual verification in a browser (local dev server)

Driven through the rendered pages on `http://localhost:3000`:

| Flow | Observed |
|---|---|
| Start wizard (Nepal, lost, iPhone) | Bad IMEI blocked with the localised hint; contact equal to the lost number rejected with the correct message; case `JT-NP-…` created; reference and key shown |
| Case page | 10 steps; first link → `icloud.com/find` for iPhone; step marked done; code flow rejected a wrong code then accepted the right one; status moved Open → Active, "Contact confirmed" |
| Complaint | Generated in Nepali from case data |
| Language switch | Page and checklist re-rendered in Hindi, `<html lang="hi">` |
| Vault | Registered an IMEI, confirmed, recovered it by phone number |
| Dashboard (India officer) | Queue showed only Indian cases, seeded stolen case first at priority 95; identity masked until a legal basis was entered; simulator not offered to police |
| Dashboard (Nepal officer) | Referred case shown as summary only; after accepting, detail and audited reveal available; no onward referral |
| Auditor | Hash chain verified |
| Mobile width (375 px) | No horizontal overflow on `/` or `/feasibility` |

Official links: 12 of 15 answered HTTP 200 to an automated check; `www.cybercrime.gov.in` and `cyberbureau.nepalpolice.gov.np` answered 200 on retry with a browser user-agent; `sancharsaathi.gov.in` returns 403 to automated clients (it serves browsers normally).

## Defects found and fixed during testing

| Found by | Defect | Fix |
|---|---|---|
| Browser run | Nepali complaint read "हराएको भएको" (duplicated auxiliary) | Template and word list corrected |
| Link check | `cybercrime.gov.in` without `www` timed out | Link changed to `www.cybercrime.gov.in` |
| Build | Named exports in a page file are not allowed by Next.js | Shared staff header moved to its own component |

## Not tested

- Real SMS/e-mail delivery (none is wired).
- A real PostgreSQL server: the `pg` code path shares all SQL with PGlite but was not run against a server in this session.
- Load and concurrency beyond the 12-writer audit test.
- Real integrations: none exist.
- Screen-reader and low-end-device usability; native-speaker review of Hindi and Nepali text.
- Independent penetration testing.
