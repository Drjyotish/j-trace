# Phase 7 — Launch strategy

Assumption throughout: an independent team with **no** government or telecom agreements, and no guarantee of ever getting them.

## 1. What can be built and run legally today

| Feature | Needs anyone's permission? |
|---|---|
| Multilingual first-hour checklist with official links and helplines | No |
| Police complaint draft generator | No |
| Pre-loss device vault and IMEI recovery | No (consent + privacy compliance) |
| Ownership verification, dispute handling | No |
| Case tracker with owner-entered request numbers | No |
| Officer dashboard, referrals, audit trail (as software) | No — but it is only *useful* once a police unit adopts it |
| Public feasibility page and open data on what works where | No |

What requires official integration: IMEI block status at scale (GSMA or regulator), any network sighting, any SIM-change signal, any cross-border match, automatic filing with police or CEIR.

## 2. Who to approach, in order

| # | Organisation | Ask | Why first / what we offer |
|---|---|---|---|
| 1 | **One district or city cyber cell** (India: a state with strong CEIR results such as Telangana or Karnataka; Nepal: Nepal Police Cyber Bureau) | A 90-day pilot using the dashboard for intake and referral | Lowest barrier: no data leaves police; we save them intake time and deliver complete, verified complaints |
| 2 | **GSMA** (Device Check) | Commercial subscription | The only lawful API for stolen-status; gives officers a real signal in place of a simulated one |
| 3 | **Digital-rights and consumer groups** (e.g. Internet Freedom Foundation in India; consumer forums in Nepal) | Review of the privacy model | The Sanchar Saathi pre-install reversal (Dec 2025) shows trust is the scarce resource; an early independent review is worth more than a feature |
| 4 | **NTA (Nepal)** | MoU for a read-only MDMS status check; feedback on the lost/stolen flow | MDMS availability is inconsistent; a working public front end is something we can offer |
| 5 | **DoT (India)** — Sanchar Saathi / CEIR team | Permission to deep-link with pre-filled data; later a status callback for police | We reduce malformed requests; we ask for nothing owner-facing that they do not already expose |
| 6 | **Operators** (Jio, Airtel, Vi, BSNL; NTC, Ncell; e&, du) | Listing of their SIM-block channel; later, nodal-officer accounts | Starts as a referral relationship, not a data request |
| 7 | **Insurers and large employers** | Paid channel: verified loss reports with IMEI and request numbers | Revenue that does not depend on end-users paying |
| 8 | **TDRA / UAE police** | Only after an India–Nepal pilot has results | Highest compliance bar; needs a UAE-hosted instance |

Never ask for: subscriber data, IMSI↔IMEI records, location, or anything that would be delivered to owners rather than police.

## 3. Pilot design (India or Nepal, 90 days)

| | |
|---|---|
| Scope | One police district, one language pair, phones lost/stolen within that district |
| Owner side | Public portal as built, with a real SMS/e-mail gateway and in-country hosting |
| Police side | 5–10 officers with MFA; they review evidence, record official updates by hand, and use referrals for out-of-district cases |
| Data agreement | Short written arrangement: TRACE is processor for case data; police are independent controller for anything they copy into their own systems |
| Control group | The district's own previous quarter (time-to-complaint, time-to-block, recovery rate) |
| Exit criteria | See metrics below; publish the results whatever they are |

### Success metrics

| Metric | Target for the pilot | How measured |
|---|---|---|
| Median time from case start to "SIM blocked" marked | ≤ 15 min | `case_steps` timestamps |
| Median time from case start to IMEI block request recorded | ≤ 24 h (vs. multi-day baseline) | `block_request_recorded` event |
| Cases with a valid IMEI at intake | ≥ 85 % (vault + guided recovery) | `cases.imei_hmac` not null |
| Complaints accepted by police without rework | ≥ 90 % | Officer evidence decisions |
| Ownership disputes resolved | 100 % within 7 days | Dispute events |
| Officer PII accesses without a recorded legal basis | 0 (enforced) | Audit chain |
| Physical recovery rate vs. district baseline | Report honestly; expect a modest lift | Police outcome |
| Substantiated misuse reports | 0 | Grievance channel |

## 4. Operating model

| Option | Fit | Notes |
|---|---|---|
| **Non-profit / Section 8 company (India), NGO (Nepal)** — *recommended for the public portal* | High | Free to citizens, credible to police and regulators, eligible for grants (digital public goods, consumer protection, CSR) |
| Public–private partnership | Medium-term goal | Once a pilot works, propose it as a front end that states or NTA can adopt; the code is MIT so adoption carries no lock-in |
| Commercial | For B2B only | Insurer/employer verified-loss API; device-retailer vault enrolment at point of sale; never sell consumer data, never charge victims |

Free-to-citizen is affordable because the marginal cost per case is tiny (see below); the expensive parts are compliance and people, not compute.

## 5. Budget

Estimates in USD; ranges reflect India/Nepal cost levels. **These are planning assumptions, not quotes.**

### MVP → pilot-ready (about 3 months)

| Item | Estimate |
|---|---|
| 2 engineers (full-stack + security-minded backend) | 18,000 – 30,000 |
| Part-time product/field lead with police liaison experience | 6,000 – 10,000 |
| Privacy/telecom legal review in two jurisdictions | 5,000 – 12,000 |
| Independent security assessment before real data | 4,000 – 10,000 |
| Translation review by native speakers (hi, ne) | 500 – 1,500 |
| Infrastructure, SMS/e-mail, domains | 500 – 1,500 |
| **Total** | **≈ 34,000 – 65,000** |

### Monthly operating cost at pilot scale (≈ 5,000 cases/month)

| Item | Estimate |
|---|---|
| Hosting + managed PostgreSQL in-region, backups | 80 – 250 |
| SMS (≈ 3 messages/case; India DLT-registered routes) and e-mail | 60 – 200 |
| Monitoring, error tracking, uptime | 0 – 100 |
| GSMA Device Check | Commercial quote required — **not estimated** |
| Support / grievance officer (part-time) | 500 – 1,200 |
| **Total excluding GSMA and salaries** | **≈ 650 – 1,750** → roughly **$0.15 – $0.35 per case** |

## 6. Performance targets (service-level objectives)

### What TRACE controls

| Step | SLO | Status in the prototype |
|---|---|---|
| Create a case | p50 ≤ 2 min of user time; API p95 ≤ 1 s | Form is 3 short screens; verified locally |
| Reach official locate/lock tools | ≤ 1 tap from the checklist | Built |
| Verify the contact | ≤ 60 s after code delivery | Built (delivery simulated) |
| Generate the complaint | ≤ 5 s, 3 languages | Built |
| Hand-off to blocking channel with document checklist | ≤ 1 tap | Built |
| Notify owner of a recorded event | ≤ 60 s from event insert | Outbox built; delivery not wired |
| Availability | 99.5 % monthly | Not measured yet |
| Purge after retention date | ≤ 24 h late | `runRetention()`; cron not scheduled |

### What depends on others (reported, never promised)

| Step | Typical today | Who controls it |
|---|---|---|
| SIM block | Minutes on a call | Operator |
| Police complaint accepted | Minutes (online lost report) to days (FIR) | Police |
| IMEI block active | About 24 h (India CEIR; UAE operators) | Regulator / operators |
| Network trace | Only if the handset is used again | Operators → police |
| Ownership review by an officer | Pilot target ≤ 48 h | Police |
| Cross-border action | Weeks to months, case by case | Two police forces / governments |
| Physical recovery | India: about 1 in 3 traced phones; Nepal: about 1 in 5 reported | Police |

## 7. 30 / 60 / 90-day roadmap

**Days 1–30 — make it safe to use with real people**
- Wire an SMS/e-mail provider; remove on-screen codes outside demo mode.
- Staff MFA (TOTP), Redis-backed rate limits, scheduled retention job, error monitoring.
- In-country hosting with managed PostgreSQL; secrets in a KMS.
- Native-speaker review of Hindi and Nepali text; accessibility pass on low-end Android.
- Privacy notice, grievance contact, DPDP/Privacy-Act review; independent security test.
- Start conversations 1–3 in the outreach table.

**Days 31–60 — pilot**
- Sign a pilot with one police unit; onboard 5–10 officers.
- Replace simulated events with officer-entered updates on the pilot instance.
- Apply for GSMA Device Check; build the adapter behind the existing interface.
- State-specific police-portal links for the pilot state; operator store locators.
- Android companion (consented, pre-loss): vault enrolment by reading the IMEI on device.

**Days 61–90 — evidence and next partners**
- Publish pilot metrics, including what did not improve.
- Second pilot across the border (India ↔ Nepal) to exercise referrals with real officers.
- Approach NTA and DoT with data, not a pitch.
- Decide the legal entity and funding path; open the B2B verified-loss API to one insurer.

## 8. Biggest barriers

| Barrier | Type | Mitigation |
|---|---|---|
| No access to network or registry data | Regulatory | Design so the product is useful without it; pursue GSMA first |
| Registers stop at borders | Policy | Supply the referral workflow and the evidence that it is needed |
| Public distrust of "tracking" tools | Trust | Open source, no location data, owner-visible access log, early civil-society review |
| Police adoption and continuity (transfers) | Institutional | Train units, not individuals; keep the dashboard usable in 10 minutes |
| IMEI rewriting and parts-stripping | Technical | Outside any IMEI-based system; be honest about it |
| Sustaining a free service | Financial | Grants + B2B revenue; very low marginal cost |
| Being mistaken for a government service | Legal | Persistent disclaimer in every language and on every generated document |
