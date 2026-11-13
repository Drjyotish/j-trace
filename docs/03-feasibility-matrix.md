# Phase 3 — Feasibility matrix

*Generated from `src/lib/feasibility.ts` by `scripts/gen-feasibility.mjs`. The same data drives the in-app page at `/feasibility`.*

Every capability requested in the brief, classified. "Difficulty" is the effort to make it **real**, including the legal and partnership work — not the effort to write code.

| Classification | Count |
|---|---|
| Available now | 5 |
| Requires user permission | 2 |
| Requires telecom partnership | 2 |
| Requires government authorisation | 7 |
| Not technically feasible | 2 |

## A. Phone number → IMEI

| Capability | Classification | In J TRACE today | Why | Closest legitimate alternative | Difficulty |
|---|---|---|---|---|---|
| Look up a phone's IMEI from its mobile number via operator records | **Requires government authorisation** | Not built | Operators do log which IMEI each SIM (IMSI) was used in, but that is subscriber data released only to law enforcement under legal process. No operator in India, Nepal or the UAE offers a public or commercial API for it. | TRACE device vault (saved before the loss), Google/Apple account device list, the box, the invoice. | Very high |
| Recover the IMEI from the owner's Google or Apple account | **Requires user permission** | Guided hand-off to the official page | Google Find Hub and the Apple Account device list both show the IMEI to the signed-in owner. Neither offers a third-party API, so the owner reads it on the vendor's page. | — | Low |
| Recover the IMEI from a record the owner saved in advance (TRACE vault) | **Available now** | Built & tested | Owner stores IMEI + number + a recovery contact before any loss. Returned only after a one-time code sent to that recovery contact. Responses do not reveal whether a number is registered. | — | Low |

## B. IMEI → recovery

| Capability | Classification | In J TRACE today | Why | Closest legitimate alternative | Difficulty |
|---|---|---|---|---|---|
| Last known location of the handset from its IMEI | **Requires government authorisation** | Not built | Only the serving network knows which cell a handset is on, and it discloses that to police under lawful authority — never to the owner. An independent platform cannot and must not obtain it. | Owner-side tools enabled before the loss: Google Find Hub, Apple Find My, Samsung Find. | Very high |
| Check whether an IMEI is reported stolen / blocked | **Requires government authorisation** | Simulated only (labelled) | India lets citizens check one IMEI at a time through Sanchar Saathi's Know-Your-Mobile service, and blocked-request status through CEIR, but neither has a public API. The global GSMA Device Check is a paid service for qualifying businesses and agencies. | Owner checks on the official page; TRACE links to it and records the request number. | High |
| Know that the handset appeared on a mobile network | **Requires telecom partnership** | Simulated only (labelled) | Network attach events exist inside each operator. In India CEIR turns them into 'traceability' for blocked IMEIs and delivers it to police. A platform would need both operator agreements and legal authority, and the result would still go to police. | Officer dashboard is built to receive such events; today they are simulated and labelled. | Very high |
| Know that a different SIM was inserted | **Requires telecom partnership** | Simulated only (labelled) | A new IMSI paired with a known IMEI is visible only to the network/CEIR. It is the main way Indian police trace blocked phones. | Vendor anti-theft features (remote lock, offline lock, theft detection) that the owner enabled beforehand. | Very high |

## C. Cross-border

| Capability | Classification | In J TRACE today | Why | Closest legitimate alternative | Difficulty |
|---|---|---|---|---|---|
| Detect a handset stolen in India when it is used in Nepal (or the reverse) | **Requires government authorisation** | Simulated only (labelled) | An IMEI blocked in India's CEIR is not blocked in Nepal: the registers are national and not linked. Detection needs either a bilateral agreement between DoT and NTA or both sides exchanging block lists through the GSMA Device Registry. | TRACE's cross-border referral workflow lets one country's police formally hand a case to the other, with a legal basis and audit trail. | Very high |
| Detect the handset on a UAE network | **Requires government authorisation** | Not built | UAE blacklisting is done by e& and du under TDRA rules and applies inside the UAE. There is no public feed and no link to Indian or Nepali registers. | Police-to-police request (Interpol / bilateral channels) recorded as a referral. | Very high |
| Detect that a phone was factory-reset or resold | **Not technically feasible** | Not built | A reset or a sale produces no network signal; the IMEI stays the same. Only the device vendor sees activation, and Google and Apple do not share it. IMEI rewriting defeats IMEI-based systems altogether (and is a crime). | Factory Reset Protection / Activation Lock make a reset phone unusable without the owner's account — tell owners never to remove the device from their account. | — |

## D. Vendor recovery tools

| Capability | Classification | In J TRACE today | Why | Closest legitimate alternative | Difficulty |
|---|---|---|---|---|---|
| Locate, ring, lock or erase through Google Find Hub, Apple Find My, Samsung Find | **Requires user permission** | Guided hand-off to the official page | These work only for the signed-in account owner and only if enabled before the loss. None exposes a location API to third parties, by design. | TRACE opens the right official page for the platform and explains each button in plain language. | Low |
| Find the owner's e-mail, account or activity from a phone number or IMEI | **Not technically feasible** | Not built | There is no lawful way to do this and TRACE will not attempt it. It would be a stalking tool. | The owner signs in to their own account on the vendor's site. | — |

## E. Paperwork and process

| Capability | Classification | In J TRACE today | Why | Closest legitimate alternative | Difficulty |
|---|---|---|---|---|---|
| Create a case, a tailored checklist and official hand-offs | **Available now** | Built & tested | Pure guidance and record-keeping; needs no external permission. | — | Low |
| Prepare the police complaint in English, Hindi or Nepali | **Available now** | Built & tested | Generated from the owner's own case data; the owner files it. | — | Low |
| File the police complaint or the IMEI block request on the owner's behalf | **Requires government authorisation** | Guided hand-off to the official page | CEIR needs the owner's own OTP and documents; police portals are state-specific. No submission API exists. | TRACE prepares everything, opens the official form and records the request number afterwards. | High |
| Verify ownership before anything sensitive is shown | **Available now** | Built & tested | Contact one-time code, pre-loss vault match, document fingerprints, officer review, dispute freeze. | — | Medium |

## F. Authorised dashboard

| Capability | Classification | In J TRACE today | Why | Closest legitimate alternative | Difficulty |
|---|---|---|---|---|---|
| Case management with roles, jurisdiction limits, audited PII access, cross-border referrals | **Available now** | Built & tested | The software is built and tested. It becomes real only when a police unit agrees to use it — that adoption needs government authorisation. | Pilot with one district cyber cell. | Medium |
| Automatic notifications when an official system reports a change | **Requires government authorisation** | Simulated only (labelled) | TRACE can notify instantly, but only about events it is given. Without official feeds there is nothing real to notify about. | Reminders to check official status pages; officer-entered updates. | High |

## Reading the matrix

- **Available now** means it runs in this repository today with no one's permission.
- **Requires user permission** means only the account owner can do it, on the vendor's own page; TRACE takes them there.
- **Requires telecom partnership / government authorisation** means the data exists but is not ours to obtain. Where the product flow depends on it, the prototype uses a *simulated* event that is labelled as such everywhere it appears, and that is disabled when `TRACE_MODE=production`.
- **Not technically feasible** means no agreement would make it work.
