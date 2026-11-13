import type { Capability } from "./playbook";

export interface FeasibilityRow {
  group: string;
  capability: string;
  status: Capability;
  /** What J TRACE does about it today. */
  inTrace: "built" | "handoff" | "simulated" | "not_built";
  why: string;
  alternative: string;
  difficulty: "Low" | "Medium" | "High" | "Very high" | "—";
}

/**
 * The feasibility matrix. This is the honest core of the project: it is shown
 * in the app (/feasibility) and mirrored in docs/03-feasibility-matrix.md.
 */
export const FEASIBILITY: FeasibilityRow[] = [
  {
    group: "A. Phone number → IMEI",
    capability: "Look up a phone's IMEI from its mobile number via operator records",
    status: "REQUIRES_GOVERNMENT_AUTHORIZATION",
    inTrace: "not_built",
    why: "Operators do log which IMEI each SIM (IMSI) was used in, but that is subscriber data released only to law enforcement under legal process. No operator in India, Nepal or the UAE offers a public or commercial API for it.",
    alternative: "TRACE device vault (saved before the loss), Google/Apple account device list, the box, the invoice.",
    difficulty: "Very high",
  },
  {
    group: "A. Phone number → IMEI",
    capability: "Recover the IMEI from the owner's Google or Apple account",
    status: "REQUIRES_USER_PERMISSION",
    inTrace: "handoff",
    why: "Google Find Hub and the Apple Account device list both show the IMEI to the signed-in owner. Neither offers a third-party API, so the owner reads it on the vendor's page.",
    alternative: "—",
    difficulty: "Low",
  },
  {
    group: "A. Phone number → IMEI",
    capability: "Recover the IMEI from a record the owner saved in advance (TRACE vault)",
    status: "AVAILABLE_NOW",
    inTrace: "built",
    why: "Owner stores IMEI + number + a recovery contact before any loss. Returned only after a one-time code sent to that recovery contact. Responses do not reveal whether a number is registered.",
    alternative: "—",
    difficulty: "Low",
  },
  {
    group: "B. IMEI → recovery",
    capability: "Last known location of the handset from its IMEI",
    status: "REQUIRES_GOVERNMENT_AUTHORIZATION",
    inTrace: "not_built",
    why: "Only the serving network knows which cell a handset is on, and it discloses that to police under lawful authority — never to the owner. An independent platform cannot and must not obtain it.",
    alternative: "Owner-side tools enabled before the loss: Google Find Hub, Apple Find My, Samsung Find.",
    difficulty: "Very high",
  },
  {
    group: "B. IMEI → recovery",
    capability: "Check whether an IMEI is reported stolen / blocked",
    status: "REQUIRES_GOVERNMENT_AUTHORIZATION",
    inTrace: "simulated",
    why: "India lets citizens check one IMEI at a time through Sanchar Saathi's Know-Your-Mobile service, and blocked-request status through CEIR, but neither has a public API. The global GSMA Device Check is a paid service for qualifying businesses and agencies.",
    alternative: "Owner checks on the official page; TRACE links to it and records the request number.",
    difficulty: "High",
  },
  {
    group: "B. IMEI → recovery",
    capability: "Know that the handset appeared on a mobile network",
    status: "REQUIRES_TELECOM_PARTNERSHIP",
    inTrace: "simulated",
    why: "Network attach events exist inside each operator. In India CEIR turns them into 'traceability' for blocked IMEIs and delivers it to police. A platform would need both operator agreements and legal authority, and the result would still go to police.",
    alternative: "Officer dashboard is built to receive such events; today they are simulated and labelled.",
    difficulty: "Very high",
  },
  {
    group: "B. IMEI → recovery",
    capability: "Know that a different SIM was inserted",
    status: "REQUIRES_TELECOM_PARTNERSHIP",
    inTrace: "simulated",
    why: "A new IMSI paired with a known IMEI is visible only to the network/CEIR. It is the main way Indian police trace blocked phones.",
    alternative: "Vendor anti-theft features (remote lock, offline lock, theft detection) that the owner enabled beforehand.",
    difficulty: "Very high",
  },
  {
    group: "C. Cross-border",
    capability: "Detect a handset stolen in India when it is used in Nepal (or the reverse)",
    status: "REQUIRES_GOVERNMENT_AUTHORIZATION",
    inTrace: "simulated",
    why: "An IMEI blocked in India's CEIR is not blocked in Nepal: the registers are national and not linked. Detection needs either a bilateral agreement between DoT and NTA or both sides exchanging block lists through the GSMA Device Registry.",
    alternative: "TRACE's cross-border referral workflow lets one country's police formally hand a case to the other, with a legal basis and audit trail.",
    difficulty: "Very high",
  },
  {
    group: "C. Cross-border",
    capability: "Detect the handset on a UAE network",
    status: "REQUIRES_GOVERNMENT_AUTHORIZATION",
    inTrace: "not_built",
    why: "UAE blacklisting is done by e& and du under TDRA rules and applies inside the UAE. There is no public feed and no link to Indian or Nepali registers.",
    alternative: "Police-to-police request (Interpol / bilateral channels) recorded as a referral.",
    difficulty: "Very high",
  },
  {
    group: "C. Cross-border",
    capability: "Detect that a phone was factory-reset or resold",
    status: "NOT_TECHNICALLY_FEASIBLE",
    inTrace: "not_built",
    why: "A reset or a sale produces no network signal; the IMEI stays the same. Only the device vendor sees activation, and Google and Apple do not share it. IMEI rewriting defeats IMEI-based systems altogether (and is a crime).",
    alternative: "Factory Reset Protection / Activation Lock make a reset phone unusable without the owner's account — tell owners never to remove the device from their account.",
    difficulty: "—",
  },
  {
    group: "D. Vendor recovery tools",
    capability: "Locate, ring, lock or erase through Google Find Hub, Apple Find My, Samsung Find",
    status: "REQUIRES_USER_PERMISSION",
    inTrace: "handoff",
    why: "These work only for the signed-in account owner and only if enabled before the loss. None exposes a location API to third parties, by design.",
    alternative: "TRACE opens the right official page for the platform and explains each button in plain language.",
    difficulty: "Low",
  },
  {
    group: "D. Vendor recovery tools",
    capability: "Find the owner's e-mail, account or activity from a phone number or IMEI",
    status: "NOT_TECHNICALLY_FEASIBLE",
    inTrace: "not_built",
    why: "There is no lawful way to do this and TRACE will not attempt it. It would be a stalking tool.",
    alternative: "The owner signs in to their own account on the vendor's site.",
    difficulty: "—",
  },
  {
    group: "E. Paperwork and process",
    capability: "Create a case, a tailored checklist and official hand-offs",
    status: "AVAILABLE_NOW",
    inTrace: "built",
    why: "Pure guidance and record-keeping; needs no external permission.",
    alternative: "—",
    difficulty: "Low",
  },
  {
    group: "E. Paperwork and process",
    capability: "Prepare the police complaint in English, Hindi or Nepali",
    status: "AVAILABLE_NOW",
    inTrace: "built",
    why: "Generated from the owner's own case data; the owner files it.",
    alternative: "—",
    difficulty: "Low",
  },
  {
    group: "E. Paperwork and process",
    capability: "File the police complaint or the IMEI block request on the owner's behalf",
    status: "REQUIRES_GOVERNMENT_AUTHORIZATION",
    inTrace: "handoff",
    why: "CEIR needs the owner's own OTP and documents; police portals are state-specific. No submission API exists.",
    alternative: "TRACE prepares everything, opens the official form and records the request number afterwards.",
    difficulty: "High",
  },
  {
    group: "E. Paperwork and process",
    capability: "Verify ownership before anything sensitive is shown",
    status: "AVAILABLE_NOW",
    inTrace: "built",
    why: "Contact one-time code, pre-loss vault match, document fingerprints, officer review, dispute freeze.",
    alternative: "—",
    difficulty: "Medium",
  },
  {
    group: "F. Authorised dashboard",
    capability: "Case management with roles, jurisdiction limits, audited PII access, cross-border referrals",
    status: "AVAILABLE_NOW",
    inTrace: "built",
    why: "The software is built and tested. It becomes real only when a police unit agrees to use it — that adoption needs government authorisation.",
    alternative: "Pilot with one district cyber cell.",
    difficulty: "Medium",
  },
  {
    group: "F. Authorised dashboard",
    capability: "Automatic notifications when an official system reports a change",
    status: "REQUIRES_GOVERNMENT_AUTHORIZATION",
    inTrace: "simulated",
    why: "TRACE can notify instantly, but only about events it is given. Without official feeds there is nothing real to notify about.",
    alternative: "Reminders to check official status pages; officer-entered updates.",
    difficulty: "High",
  },
];

export const CAPABILITY_LABEL: Record<Capability, string> = {
  AVAILABLE_NOW: "Available now",
  REQUIRES_USER_PERMISSION: "Requires user permission",
  REQUIRES_TELECOM_PARTNERSHIP: "Requires telecom partnership",
  REQUIRES_GOVERNMENT_AUTHORIZATION: "Requires government authorisation",
  NOT_TECHNICALLY_FEASIBLE: "Not technically feasible",
};
