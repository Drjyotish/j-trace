# Security, privacy and misuse prevention

The governing rule: **J TRACE must never be usable to find or follow another person's phone.** Every control below serves that rule. Each one names the code that enforces it and the test that proves it.

## Threat model and controls

| Threat | Control | Code | Tested in |
|---|---|---|---|
| **Unauthorised IMEI lookup** | There is no IMEI lookup endpoint. `/api/imei/check` is arithmetic only and reveals nothing about a handset. IMEIs are stored encrypted, looked up by keyed pseudonym, and shown back masked | `lib/imei.ts`, `lib/crypto.ts` | `unit.test.ts`, `owner.test.ts` "stores identifiers encrypted…" |
| **Phone-number enumeration** | Vault recovery returns the same response for known and unknown numbers (including a dummy code in demo mode); 3 lookups per number per day, 5 per IP per hour | `services/vault.ts` | `owner.test.ts` "answers identically…", `api.test.ts` "vault lookups look the same…" |
| **Case enumeration** | Wrong key and unknown reference return the same error after the same work; 5 attempts per reference per 15 min | `services/owner.ts#openCase` | `owner.test.ts` "gives the same answer…", "locks out key guessing" |
| **Fraudulent ownership claim** | Self-declared evidence can never reach the disclosure threshold; system evidence cannot be asserted by a client; vault records younger than 7 days count little | `lib/ownership.ts` | `unit.test.ts` "nothing a claimant can merely type…", `owner.test.ts` "a client cannot assert system evidence" |
| **Thief or stalker files first** | Two claimants on one IMEI → both cases frozen, nothing disclosed, officer must decide; a claim that contradicts a vault record is flagged to officers | `services/common.ts#checkDispute`, `services/owner.ts#matchVault` | `owner.test.ts` "freezes both cases…", "claiming someone else's vaulted handset…" |
| **Stalking / domestic abuse** | Owners never receive location, operator, cell or new-SIM identity — only coarse notices, and only at level 2+. Codes are never sent to the missing phone. Recovery contact cannot be the device's own number | `services/staff.ts#submitNetworkEvent`, `services/owner.ts` | `staff.test.ts` "a verified owner gets a coarse notice — never the operator, a location, or the new SIM" |
| **Unauthorised location disclosure** | TRACE stores no location data at all. The event model has no coordinate fields | `lib/schema.ts` | `staff.test.ts` rejects `gps_fix` event kind |
| **SIM-swap fraud** | TRACE never asks for, stores or acts on SIM credentials; it sends owners to the operator's own channel and advises blocking first. OTPs: 6 digits, 10-minute expiry, 5 attempts, hashed at rest, single-use, new code invalidates old | `services/owner.ts`, `services/vault.ts` | `owner.test.ts` contact-verification suite (6 tests) |
| **Insider abuse** | Personal data is hidden from the case view by default. Revealing it requires the police role, in-jurisdiction scope and a typed legal basis; it is rate-limited (30/hour), written to the audit chain, and **disclosed to the owner** on their timeline. Telecom never sees identity. Admin and auditor see metadata only | `services/staff.ts#revealPii`, `lib/rbac.ts` | `staff.test.ts` "PII access (break-glass)" suite |
| **Tampering with records** | Audit log is an append-only SHA-256 hash chain, serialised with a database advisory lock; any edit or deletion is detected and located | `lib/audit.ts` | `staff.test.ts` "detects an edited entry, a deleted entry, and survives concurrent writers" |
| **Data leak** | Field-level AES-256-GCM with HKDF-derived, purpose-separated keys; audit rows and event payloads contain no raw identifiers; documents are never uploaded (SHA-256 fingerprint only); short retention | `lib/crypto.ts`, `lib/schema.ts` | `owner.test.ts`, `staff.test.ts` "contains no raw identifiers" |
| **Fake police / government accounts** | No self-registration. Accounts are created by an admin and are inert until `verified`. Sign-in failure is identical for unknown, wrong-password, unverified and disabled accounts. A disabled account loses access on the next request even with a valid session | `services/staff.ts#login`, `lib/http.ts#requireStaff` | `staff.test.ts` sign-in suite, `api.test.ts` "a disabled officer loses access immediately" |
| **Jurisdiction overreach** | An officer sees only their country's cases plus cases formally referred to it (summary while pending). Out-of-scope cases return `404`, indistinguishable from non-existent. A receiving country cannot forward a case onward. A telecom partner can report only its own country's networks | `lib/rbac.ts#caseScope`, `services/staff.ts` | `staff.test.ts` "jurisdiction" and "cross-border referral" suites |
| **Session theft / CSRF** | HttpOnly, SameSite=Strict, Secure cookies; separate signing keys per audience; `alg` pinned to HS256; Origin check on state-changing requests | `lib/http.ts` | `api.test.ts` "refuses requests without a session, with a forged session, or from another origin", "a staff cookie is not an owner cookie" |
| **Injection / malformed input** | Parameterised SQL only; 20 kB body limit; control characters stripped; typed errors, no stack traces | `lib/db.ts`, `lib/http.ts` | `api.test.ts` "returns clean 4xx errors…" |
| **Abuse at volume** | Named rate-limit policies per IP, per subject and per staff member | `lib/ratelimit.ts` | `unit.test.ts`, `owner.test.ts`, `api.test.ts` |
| **Simulated data mistaken for real** | Simulated events are stamped in the database, badged in both interfaces, and the simulator refuses to run in production mode | `lib/adapters`, `services/staff.ts` | `unit.test.ts`, `staff.test.ts` "is switched off entirely outside demo mode", `api.test.ts` seed check |

## Consent, retention and data-subject rights

| Topic | Rule |
|---|---|
| Lawful basis | Explicit consent at case creation and at vault registration, stored with a timestamp. No consent → no record |
| Purpose | Recovering the named handset. No advertising, analytics or profiling. No third-party scripts in the app |
| Minimisation | Name, place, phone, brand and model are optional. Documents are fingerprinted on the device and never uploaded |
| Retention | Closed/recovered cases: deleted 180 days after closure. Untouched open cases: 365 days. Expired codes and unconfirmed vault records: 1 day. `runRetention()` is idempotent and intended for a daily cron |
| Erasure | The owner can delete the case at any time; all case rows cascade. Restricted only while the case is evidence in a dispute or an active cross-border referral, and the owner is told why |
| Access & transparency | The owner sees every officer access to their personal data, and every status change, on their own timeline |
| Audit vs. erasure | Audit rows are kept (they reference a case id and contain no identifiers) so that oversight survives deletion |
| Children / third parties | The consent text requires the claimant to be the owner or lawful user |

## Disputed ownership procedure

1. A second, different claimant registers the same IMEI → both cases move to `disputed`.
2. Both claimants see the same neutral message telling them to take invoice and ID to the police. Neither learns anything about the other.
3. Disclosure is capped at level 1 for both; neither can delete or close the case.
4. An officer whose jurisdiction covers **every** competing claim reviews the evidence and upholds one claim with a written basis (≥ 10 characters, audited). Competing claims are closed and start their retention clock.
5. If claims span countries, a referral must be accepted first; the system refuses a one-sided decision.

## Legal mapping (summary, not legal advice)

| | India | Nepal | UAE |
|---|---|---|---|
| Data-protection law | DPDP Act 2023; Rules 2025, phased to May 2027 | Individual Privacy Act 2075 (2018) | Federal Decree-Law 45/2021 (PDPL) |
| Telecom law | Telecommunications Act 2023; Telecom Cyber Security Rules 2024 | Telecommunications Act 2053 (1997) | TDRA regulatory framework |
| What it means here | Consent notice, purpose limitation, erasure, breach handling, a grievance contact; expect to register as a Data Fiduciary | Consent for collection; police tracing reportedly needs court permission | Consent, in-country processing expectations for telecom-related data |
| Before a real pilot | Privacy counsel review; data-residency decision; DPO/grievance officer named | Local counsel; written arrangement with Nepal Police | Local counsel; likely a UAE-hosted instance |

## Known gaps in this prototype (honest list)

- **No SMS/e-mail delivery.** Codes are shown on screen in demo mode. A provider must be wired before real use.
- **No MFA for staff.** Required before a pilot (TOTP or WebAuthn).
- **Rate limits are in-process.** Correct for a single instance; a multi-instance deployment needs Redis.
- **Demo secrets.** In demo mode keys derive from a public constant; `TRACE_MODE=production` refuses to start without `TRACE_SECRET`.
- **Key rotation and HSM/KMS** are not implemented; ciphertexts are versioned (`v1.`) to allow it.
- **Vault squatting.** Someone who knows an IMEI could register it first. Mitigations: maturity rule, mismatch flag to officers, dispute process. It cannot yield disclosure, but it can delay the true owner.
- **No independent security review** has been done. Do not put real personal data into this prototype.
