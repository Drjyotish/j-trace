import type { Country } from "../config";
import { isDemo } from "../config";
import { OFFICIAL, type Capability } from "../playbook";

/**
 * Integration adapters.
 *
 * TRACE has NO privileged access to any telecom, regulator or vendor system.
 * Each adapter states honestly how it works today:
 *
 *   user_directed  TRACE prepares the data and hands the user to the official
 *                  page; the user submits it themselves. This is real and live.
 *   simulated      Returns clearly-labelled sample data so the product flow can
 *                  be demonstrated. Never presented as real.
 *   unavailable    Needs a signed agreement that does not exist yet.
 */
export type AdapterMode = "user_directed" | "simulated" | "unavailable";

export interface IntegrationInfo {
  id: string;
  name: string;
  country: Country | "GLOBAL";
  mode: AdapterMode;
  capability: Capability;
  /** What a real integration would need. */
  needs: string;
  url?: string;
}

export const INTEGRATIONS: IntegrationInfo[] = [
  { id: "in.ceir.block", name: "Sanchar Saathi / CEIR — block & unblock request", country: "IN", mode: "user_directed", capability: "AVAILABLE_NOW", needs: "Nothing: citizen-facing form. No public API exists; the user submits it.", url: OFFICIAL.IN.ceirBlock },
  { id: "in.ceir.trace", name: "CEIR traceability feed (handset seen with a new SIM)", country: "IN", mode: "simulated", capability: "REQUIRES_GOVERNMENT_AUTHORIZATION", needs: "DoT approval; today traceability is delivered only to police." },
  { id: "np.mdms.report", name: "NTA MDMS — lost/stolen registration", country: "NP", mode: "user_directed", capability: "AVAILABLE_NOW", needs: "Nothing: citizen-facing form (availability has been inconsistent).", url: OFFICIAL.NP.mdms },
  { id: "np.mdms.status", name: "NTA MDMS status feed", country: "NP", mode: "simulated", capability: "REQUIRES_GOVERNMENT_AUTHORIZATION", needs: "MoU with Nepal Telecommunications Authority." },
  { id: "ae.operator.block", name: "e& / du — IMEI blacklist request", country: "AE", mode: "user_directed", capability: "AVAILABLE_NOW", needs: "Nothing: the subscriber calls 101 / 155 or visits a store." },
  { id: "ae.tdra.status", name: "TDRA / operator blacklist status", country: "AE", mode: "unavailable", capability: "REQUIRES_GOVERNMENT_AUTHORIZATION", needs: "TDRA licence or operator agreement." },
  { id: "global.gsma.devicecheck", name: "GSMA Device Check (global block-list lookup)", country: "GLOBAL", mode: "unavailable", capability: "REQUIRES_TELECOM_PARTNERSHIP", needs: "Paid GSMA Device Check subscription; applicants must qualify under GSMA access policy." },
  { id: "global.network.events", name: "Operator network events (SIM change, attach in another country)", country: "GLOBAL", mode: "simulated", capability: "REQUIRES_TELECOM_PARTNERSHIP", needs: "Per-operator agreement plus lawful authority; data would go to police, not to owners." },
  { id: "global.google.findhub", name: "Google Find Hub", country: "GLOBAL", mode: "user_directed", capability: "REQUIRES_USER_PERMISSION", needs: "No third-party location API. The owner signs in on Google's own page.", url: OFFICIAL.googleFind },
  { id: "global.apple.findmy", name: "Apple Find My", country: "GLOBAL", mode: "user_directed", capability: "REQUIRES_USER_PERMISSION", needs: "No third-party location API. The owner signs in on Apple's own page.", url: OFFICIAL.appleFind },
  { id: "global.samsung.find", name: "Samsung Find", country: "GLOBAL", mode: "user_directed", capability: "REQUIRES_USER_PERMISSION", needs: "No third-party location API. The owner signs in on Samsung's own page.", url: OFFICIAL.samsungFind },
];

export function integrationsFor(country: Country): IntegrationInfo[] {
  return INTEGRATIONS.filter((i) => i.country === country || i.country === "GLOBAL");
}

export interface BlockHandoff {
  url: string | null;
  documents: string[];
  expected: string;
}

/** What the user must take to the official blocking channel. */
export function blockHandoff(country: Country): BlockHandoff {
  switch (country) {
    case "IN":
      return {
        url: OFFICIAL.IN.ceirBlock,
        documents: ["Police complaint / FIR copy", "Identity proof", "Purchase invoice (optional)", "An alternate mobile number for OTP"],
        expected: "Request ID issued immediately; block is usually active on all Indian networks within 24 hours.",
      };
    case "NP":
      return {
        url: OFFICIAL.NP.mdms,
        documents: ["IMEI", "Date and place of loss", "Your contact details", "SIM already blocked with the operator"],
        expected: "Registration reference from NTA. Service availability has been inconsistent.",
      };
    case "AE":
      return {
        url: null,
        documents: ["Emirates ID / passport", "IMEI or the mobile number used in the phone", "Time and place of loss"],
        expected: "Operator blacklists the IMEI on UAE networks within about 24 hours (TDRA).",
      };
  }
}

export type NetworkEventKind = "sim_change" | "network_attach" | "registry_blocked";

export interface NetworkEvent {
  kind: NetworkEventKind;
  country: Country;
  operator: string;
  simulated: true;
  source: string;
}

export const SIM_OPERATORS: Record<Country, string[]> = {
  IN: ["Jio", "Airtel", "Vi", "BSNL"],
  NP: ["Nepal Telecom", "Ncell"],
  AE: ["e&", "du"],
};

/**
 * The only "network feed" in this prototype. It fabricates nothing on its own:
 * an authorised demo user has to trigger it from the simulation console, and
 * every event it produces is stamped simulated = true.
 */
export function simulateNetworkEvent(kind: NetworkEventKind, country: Country, operator?: string): NetworkEvent {
  if (!isDemo()) throw new Error("Simulated network events are disabled outside demo mode");
  const op = operator && SIM_OPERATORS[country].includes(operator) ? operator : SIM_OPERATORS[country][0];
  return { kind, country, operator: op, simulated: true, source: `SIMULATED:${kind === "registry_blocked" ? "registry" : "network"}-feed` };
}
