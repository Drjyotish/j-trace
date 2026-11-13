# Phase 1 — Reality check

*Written 13 November 2026. Sources and dates are in [02-global-research.md](02-global-research.md).*

The brief asks whether a person who loses a phone can open TRACE, prove ownership and "immediately receive every recovery option and lawful tracking signal available to them". The first half is achievable today. The second half rests on several assumptions that are wrong, restricted, or dependent on agreements nobody has given us. This page lists them plainly.

## The one-paragraph answer

An independent startup **can** build something useful: it can cut the time from "my phone is gone" to "SIM blocked, device locked, complaint drafted, IMEI block submitted" from hours or days to about 15 minutes, in the owner's language, and it can give police a case-handling and cross-border referral tool that does not exist today. It **cannot** track phones, and it should not try. Every real tracking signal — which cell a handset is on, which SIM is now inside it, which country it has surfaced in — lives inside telecom networks and national registers, is released only to police under legal authority, and in none of the three countries is offered through an API to third parties. That is not a gap a clever engineer closes; it is the law working as intended.

## Assumptions that do not hold

| # | Assumption in the brief | Reality | Consequence for TRACE |
|---|---|---|---|
| 1 | "Enter the phone number → retrieve the IMEI" | Operators do hold the IMSI↔IMEI pairing, but it is subscriber data. It is disclosed to law enforcement under legal process, not to the subscriber on request and not to third parties. No operator in India, Nepal or the UAE exposes an API. | Not buildable. Replaced with (a) a pre-loss **device vault** that TRACE controls, and (b) guided recovery of the IMEI from the owner's Google/Apple account, box or invoice. |
| 2 | "Enter the IMEI → last known location" | An IMEI is not addressable from outside the network. Only the serving operator sees which cell a handset is attached to. In India, CEIR "traceability" for blocked IMEIs is delivered to **police**, not to the owner. | Not buildable, and deliberately not simulated for owners. Owners are sent to Google Find Hub / Apple Find My / Samsung Find, which are the only lawful owner-side location tools. |
| 3 | "See whether a different SIM was inserted" | Visible only to the operator/CEIR (new IMSI + known IMEI). Same disclosure rule as above. | Built as an officer-side event type; **simulated** until an operator or DoT feed exists. Owners get a coarse notice only after ownership is established. |
| 4 | "Detect when it crosses from India into Nepal" | The registers are national and unlinked. A phone blocked in India's CEIR works normally on Nepali networks. Reporting from Delhi Police cases describes syndicates exporting phones to Nepal and Bangladesh precisely because the Indian block stops at the border. | The largest real gap — and one software alone cannot close. It needs a DoT–NTA agreement or both exchanging block lists via the GSMA Device Registry. TRACE builds the *referral workflow* police would need on the day that exists. |
| 5 | "Check whether the device is reported stolen" | India lets a citizen check one IMEI at a time (Sanchar Saathi "Know Your Mobile") and a blocking request's status. Neither has a public API. The GSMA Device Check does, but it is a paid service for qualifying businesses/agencies. | User-directed hand-off today; GSMA Device Check is the most realistic first *real* integration (see launch plan). |
| 6 | "Integrate with Google / Apple / Samsung recovery" | None offers a third-party API to locate, ring, lock or erase a user's device. Google's Find Hub partner programme is for accessory makers. Apple removed even its public Activation Lock status checker in 2017. | Deep links plus plain-language guidance. That is the only supported pattern, and it is fast. |
| 7 | "Detect that it was reset or resold" | A factory reset or a sale emits no network signal. The IMEI is unchanged. Only the vendor sees activations and does not share them. | Not technically feasible. The useful advice is the opposite of intuition: do **not** remove the phone from your account, so Activation Lock / FRP keeps it unsellable. |
| 8 | "Submit the police complaint and the blocking request for the user" | CEIR's form needs the owner's own OTP and uploaded documents; police e-FIR portals are per-state. No submission API. | TRACE prepares the text and the document checklist, opens the official page, then records the request number. |
| 9 | "Instant" recovery | TRACE controls minutes of the timeline. Physical recovery depends on police. India's own figures show roughly a third of traced phones are physically recovered. | Publish SLOs for what we control; report external steps honestly as dependent on agencies. |
| 10 | "Verify ownership, then disclose" | Ownership of a phone cannot be proven by typing its IMEI — the thief has the phone and can read it. | Scoring model in which self-declared evidence can never cross the threshold; disputes freeze disclosure. |

## What is legally restricted (not merely hard)

- **Subscriber and location data** — India: disclosure is to authorised agencies under the Telecommunications Act 2023 and criminal-procedure powers; Nepal: reporting indicates police need a court order before operators trace by IMEI; UAE: operators act under TDRA regulation. A platform that obtained this data without that authority would be committing an offence, and so would its source.
- **IMEI manipulation** — tampering with an IMEI is a criminal offence in India (reported penalty: up to 3 years' imprisonment and ₹50 lakh). TRACE never writes to, or asks anyone to alter, device identifiers.
- **Personal data** — consent, purpose limitation, retention and erasure duties apply under India's DPDP Act 2023 and Rules 2025 (phased in through May 2027), Nepal's Individual Privacy Act 2075 (2018) and the UAE's Federal Decree-Law 45/2021. TRACE's data model is built around these (see [05-security-privacy.md](05-security-privacy.md)).

## What needs a partnership (possible, but not ours to grant)

| Capability | Who must agree | Realistic? |
|---|---|---|
| IMEI status lookup at scale | GSMA (Device Check subscription) | Yes — commercial, weeks to months, subject to eligibility |
| Receiving CEIR traceability / block status | DoT, India | Only as a tool *for police*, not for owners |
| MDMS status feed | NTA, Nepal | Possible via MoU; MDMS availability itself has been inconsistent |
| India↔Nepal block-list exchange | DoT + NTA (government-to-government) | Policy decision; TRACE can advocate, not deliver |
| Police adoption of the dashboard | A state/district police unit | Yes — a district pilot is the practical first step |

## What is genuinely missing in the world (and worth building)

1. **A single, multilingual, correct first-hour checklist.** The steps are scattered over a dozen official pages in two or three languages. People do them in the wrong order, or not at all.
2. **IMEI readiness.** Most people do not know their IMEI when the phone is gone, and it blocks every later step. A pre-loss vault fixes that.
3. **Paperwork.** A complaint draft with the right fields, in the right language, removes a visit and a rejection.
4. **Ownership verification that resists abuse**, so that anything shared later is shared with the right person.
5. **A cross-border referral rail for police** with jurisdiction limits, legal-basis capture and a tamper-evident audit trail — the missing administrative layer between two national systems that do not talk.

Everything in that list is built in this repository. Everything in the earlier tables is either a guided hand-off or a clearly-labelled simulation.
