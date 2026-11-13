# Phase 2 — Global research

*Research performed 13 November 2026. Each claim is tied to a source. Where sources conflict or could not be confirmed against an official page, that is stated.*

Confidence labels: **Official** = government, regulator or vendor page · **Press** = reputable news reporting of official statements · **Blog** = commercial or personal site, treat with caution · **Unverified** = could not be confirmed.

---

## India

### Sanchar Saathi and CEIR (Department of Telecommunications)

| | |
|---|---|
| What it does | A citizen submits a "Block Stolen/Lost Mobile" request. The IMEI is blocked on all Indian networks. If the blocked handset is used again, "traceability" is generated. Separate request to unblock after recovery. |
| What the owner needs | Police complaint (FIR / lost report) copy and identity proof; purchase invoice is optional. — **Official** (CEIR user manual) |
| Time to block | Reported as within 24 hours (some sources say 24–48). — **Press/Blog** |
| Who gets the trace | Police. Sources describe the request being registered with DoT and the police; none describes location being given to the owner. A specific "alert to the police station on SIM insertion" mechanism is **Unverified**. |
| Scale | Dec 2025: 42 lakh+ devices blocked, 26 lakh traced, 7.23 lakh returned (**Official**, PIB document). Feb 2026: 8.5 lakh returned (**Press**). Sept 2026: 36.7 lakh traced, 13.39 lakh recovered as of 6 Sept 2026 (**Press**). July 2026: 77,692 recovered in the month (**Press**, IANS, 28 Aug 2026). |
| Key limit | Recovery lags tracing: roughly one in three traced phones is physically returned. The block is national only. No public API. |
| Pre-install controversy | A 28 Nov 2025 direction to pre-install the app on all phones was withdrawn on 3 Dec 2025 after privacy objections. Relevant to TRACE: public tolerance for anything resembling device surveillance is low. — **Press** |
| Integration opportunity | Deep link to the official form (done). A real feed would require DoT approval and would serve police, not owners. |

Sources
- CEIR portal and user manual — https://ceir.sancharsaathi.gov.in/Home/index.jsp · https://ceir.sancharsaathi.gov.in/HelpDocuments/English/CEIR_Mobile_User_Manual_English_v02.pdf (Official; accessed 13 Nov 2026)
- PIB, "Sanchar Saathi" factsheet, Dec 2025 — https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/dec/doc2025122715201.pdf (Official)
- IANS, 28 Aug 2026, "Sanchar Saathi helps recover over 77,000 stolen handsets in July" — https://ianslive.in/sanchar-saathi-helps-recover-over-77000-stolen-handsets-in-july--20260828185403
- NewsBytes, Sept 2026, "36.7L missing phones traced in India; recovery rate just 33%" — https://www.newsbytesapp.com/news/business/36-7l-missing-phones-traced-in-india-recovery-rate-just-33/story
- TechCrunch, 3 Dec 2025, India pulls pre-install mandate — https://techcrunch.com/2025/12/03/after-intense-backlash-india-pulls-mandate-to-pre-install-government-app-on-smartphones/
- Free Press Journal, IMEI tampering penalties — https://www.freepressjournal.in/tech/imei-tampering-can-lead-to-3-years-jail-50-lakh-fine-govt-advises-sanchar-saathi-use
- BOOM, "CEIR: tracking lost mobiles made easy, but privacy concerns linger" — https://www.boomlive.in/explainers/ceir-tracking-lost-mobile-easy-but-privacy-concerns-linger-22024

### Police workflow

Lost-article reports and e-FIRs are filed on **state** police portals or at a station; there is no national API. Financial fraud goes to the national helpline 1930 / https://www.cybercrime.gov.in. State performance varies widely: reporting puts Telangana and Karnataka at the top for CEIR-based recovery. — **Press** (The South First: https://thesouthfirst.com/telangana/lost-your-phone-in-telangana-fret-not-state-police-best-in-india-recovering-7-of-10-lost-stolen-mobiles/)

### Cross-border leakage

Delhi Police cases in 2025–26 describe syndicates buying snatched phones and routing them to Nepal and Bangladesh because the CEIR block does not apply there; some also alter IMEIs. — **Press**
- The Week / PTI, 3 Sept 2025 — https://www.theweek.in/wire-updates/national/2025/09/03/des44-dl-mobile-theft-arrest.html
- The Statesman — https://www.thestatesman.com/cities/delhi-police-smashes-cross-border-mobile-smuggling-racket-arrest-three-1503481046.html
- Business Today, 9 Aug 2026 — https://www.businesstoday.in/india/story/delhis-stolen-phone-racket-how-snatched-mobiles-become-high-margin-assets-in-grey-markets-548125-2026-08-09

### Law

Digital Personal Data Protection Act 2023; DPDP Rules notified 13–14 Nov 2025 with phased commencement: Board provisions immediately, Consent Manager registration from Nov 2026, full compliance by May 2027. — **Press/legal commentary** (The Week, 14 Nov 2025: https://www.theweek.in/wire-updates/business/2025/11/14/del148-biz-dpdp-rules-ld-govt.html)

---

## Nepal

### MDMS (Nepal Telecommunications Authority)

| | |
|---|---|
| What it does | Registers IMEIs of handsets used in Nepal (primarily to stop grey imports) and offers lost/stolen registration and status check. — **Official** portal |
| Owner flow | Block the SIM with the operator first, then register the handset as lost/stolen on the portal (IMEI, date, place, contact). Free. — **Official** portal text / **Blog** guides |
| Status in 2026 | **Conflicting.** The official portal lists the lost/stolen pages. One 2026 guide says MDMS is "not operational", another "partially active" citing procurement and corruption investigations, a third says the lost/stolen service works. We could not confirm from an NTA notice. Treat as *available but unreliable*. |
| Start date | Sources disagree: brought into operation 15 Sept 2022 (**Press**) vs. implemented 7 Nov 2023 (**Blog**). |
| Key limit | Operator synchronisation described as partly manual. No API. Not linked to India's CEIR. |

Sources
- NTA MDMS portal — https://mdms.nta.gov.np/public?lang=en (Official; accessed 13 Nov 2026)
- Nepal Live Today, 15 Sept 2022 — https://www.nepallivetoday.com/2022/09/15/govt-implements-mobile-device-management-system-phones-brought-illegally-to-be-blocked
- Kathmandu Post, 21 June 2019 (contract award) — https://kathmandupost.com/news/2019-06-21/telecom-regulator-to-award-mobile-device-management-system-contract-to-nuemera.html
- Gadgetbyte, "Has MDMS gone offline?" — https://www.gadgetbytenepal.com/mobile-device-management-system-nepal/ (Blog)
- NepaliTelecom, MDMS explainer — https://www.nepalitelecom.com/nta-mobile-device-management-mdms (Blog)

### Police workflow

Complaint at a police office with IMEI, bill and citizenship certificate. Police reportedly need **court permission** before tracing by IMEI (reported 2020; a 2026 guide repeats it — current status **Unverified**). Recovery rates are low: about 170,000 phones reported lost over four years with roughly one in five recovered. — **Press**
- Kathmandu Post, 3 Feb 2020 — https://kathmandupost.com/national/2020/02/03/complaints-about-stolen-and-lost-mobile-phones-are-rising-but-police-are-hardly-helpful
- Techpana, 2025 — https://www.techpana.com/2025/151923/170000-phones-lost-in-last-four-years-how-to-find-yours
- Nepal Police Cyber Bureau — https://cyberbureau.nepalpolice.gov.np (Official)

### Law

Individual Privacy Act, 2075 (2018) and Telecommunications Act, 2053 (1997). *(General knowledge; not re-verified against the gazette for this report.)*

---

## United Arab Emirates

| | |
|---|---|
| What it does | The subscriber reports the loss to e& (101) or du (155). The operator blacklists the IMEI; the device is blocked on UAE networks within about 24 hours, and unblocked in about the same time if found. — **Press**, quoting TDRA (Nov 2023) |
| Police | Loss reported through the emirate's police app/site/station (Dubai Police "Lost Certificate"); needed for insurance and employers. |
| Key limit | Block applies inside the UAE. No public feed, no cross-border link. Older TRA-era coverage cites 48 hours. |

Sources
- Gulf News, Nov 2023, "How TDRA and your service provider can help find lost or stolen mobile devices" — https://gulfnews.com/business/markets/uae-how-tdra-and-your-service-provider-can-help-find-lost-or-stolen-mobile-devices-1.1700290936629
- Khaleej Times — https://khaleejtimes.com/uae/uae-residents-asked-to-report-stolen-lost-mobile-phones-to-service-providers
- Gulf News 2024 guide — https://gulfnews.com/living-in-uae/telephone-internet/lost-your-phone-in-uae-dont-panic-essential-steps-to-recover-and-secure-data-2024-guide-1.1707145545843
- TDRA — https://tdra.gov.ae (Official)

Law: Federal Decree-Law No. 45 of 2021 on the Protection of Personal Data. *(General knowledge; not re-verified for this report.)*

---

## Global

### GSMA Device Registry and Device Check

- **Device Registry**: operators exchange block-list records so a handset stolen in one country can be denied service in another. GSMA cites 130+ participating operators; trade reporting notes that is out of roughly 800 operators, and that many do not contribute or do not act on others' entries. National systems can exchange data if they meet GSMA requirements. — **Official** (GSMA Mobile Policy Handbook) / **Press**
- **Device Check**: API and web lookup against the block list, for approved third parties (insurers, recyclers, dealers, repairers, law enforcement, regulators). Access is governed by FS.44 *Mobile Device Crime Data User Access Policy* v1.0 (June 2026) and SG.18. — **Official**
- **Relevance**: the only lawful, API-based stolen-status source a startup could obtain. Whether India's CEIR or Nepal's MDMS currently exchange data with the registry is **Unverified**.

Sources
- GSMA, Mobile Policy Handbook — device theft — https://www.gsma.com/solutions-and-impact/connectivity-for-good/public-policy/mobile-policy-handbook/consumer-protection/mobile-device-theft/
- GSMA FS.44 v1.0 (June 2026) — https://www.gsma.com/solutions-and-impact/technologies/security/wp-content/uploads/2026/06/FS.44-v1.0.pdf
- GSMA SG.18 — https://www.gsma.com/solutions-and-impact/technologies/security/gsma_resources/sg-18-device-registry-specification-and-access-policy/
- GSMA Device Check — https://devicecheck.gsma.com/deviceregistryservices
- 3GPP TS 23.003 (IMEI structure), TS 22.016 (IMEI), TS 29.272 / 29.511 (EIR check interfaces S13 / N5g-eir) — https://www.3gpp.org/specifications

### Google, Apple, Samsung

| Vendor | Owner-facing tool | Third-party API to locate/lock? |
|---|---|---|
| Google | Find Hub (renamed from Find My Device in 2025): locate, ring, secure, erase | **No.** The published partner programme is for accessory/tag makers via Fast Pair, with certification. — **Official** https://developers.google.com/nearby/fast-pair/landing-page-find-hub |
| Apple | Find My / iCloud Find Devices; Mark As Lost; Activation Lock | **No.** Find My Network Accessory Program is for hardware. Apple's public Activation Lock status page was removed in Jan 2017. — **Official** https://support.apple.com/en-gb/ht201365 · **Press** https://www.macrumors.com/2017/01/29/apple-removes-activation-lock-status-checker/ |
| Samsung | Samsung Find | No public API found. — **Unverified** absence |

Conclusion: user-directed official flows are the only supported option, which is what TRACE implements.

### Commercial and open-source projects

| Project | What it is | Licence · status (GitHub, 13 Nov 2026) | Use for TRACE |
|---|---|---|---|
| Prey (`prey/prey-node-client`) | Commercial anti-theft agent installed before loss | GPL-3.0 · active (pushed 12 Nov 2026) | Model for a consented companion app; GPL prevents direct reuse in an MIT codebase |
| OpenHaystack (`seemoo-lab/openhaystack`) | Research framework for Apple's Find My network | AGPL-3.0 · active (pushed Aug 2026) | Research reference only; not a recovery path for phones |
| DIRBS (Qualcomm) | Open-source national IMEI registry/blocking platform, used as the basis of at least one national system | Upstream repository could not be located; only stale forks remain (e.g. `nealmadhu/DIRBS-Core`, last push Oct 2018, custom licence) | **Not reusable** as a dependency. Useful as an architecture reference for regulators |
| PGlite (`electric-sql/pglite`) | Embedded PostgreSQL (WASM) | Apache-2.0 · active | **Reused** — local/demo database |
| node-postgres (`brianc/node-postgres`) | PostgreSQL driver | MIT · active | **Reused** — production database |
| jose (`panva/jose`) | JWT/JOSE | MIT · active | **Reused** — session tokens |
| Next.js / React | Web framework | MIT · active | **Reused** |
| Vitest | Test runner | MIT · active | **Reused** |

Cryptography uses Node's built-in `node:crypto` (AES-256-GCM, HKDF, HMAC-SHA-256, scrypt) rather than a third-party library.

---

## Gap analysis: what the existing systems leave undone

| Gap | Evidence | Can TRACE close it alone? |
|---|---|---|
| People lose hours working out what to do, in what order, in which language | Steps spread across CEIR, state police portals, operator helplines, Google/Apple | **Yes** — built |
| IMEI not known at the moment of loss | Every official flow needs it | **Yes** — vault + guided recovery |
| Complaint rejected or delayed for missing details | CEIR requires the complaint copy first | **Yes** — draft generator |
| Blocks stop at national borders | Delhi Police cases; unlinked registers | **No** — needs governments; TRACE supplies the referral rail |
| Tracing outpaces physical recovery (~1 in 3 in India, ~1 in 5 in Nepal) | DoT and Nepal figures | **Partly** — better triage and case hand-off for police |
| No abuse-resistant ownership check outside government portals | — | **Yes** — built |
| Owners get no status updates | CEIR status must be polled by hand | **Partly** — reminders now; real updates need a feed |
