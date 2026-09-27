import { ESCALATION_MS, PARAMS, isOutOfLimit } from "./thresholds";
import type { Alert, CitizenReport, ParamId, Unit } from "./types";
import type { Verification } from "./analysis";

/**
 * Who to contact when a unit detects a problem, in Jharkhand.
 *
 * Contact fields are intentionally empty: fill them with verified numbers,
 * emails and office addresses for each district before relying on them.
 * The panel shows "not added yet" for anything left blank.
 */

export type AuthorityId =
  | "dwsd-je"
  | "dwsd-ee"
  | "district-lab"
  | "accredited-lab"
  | "jspcb"
  | "dmo"
  | "health"
  | "phc"
  | "vwsc"
  | "dc";

export type Authority = {
  id: AuthorityId;
  name: string;
  office: string;
  contact: { phone: string; email: string; address: string };
};

const blank = { phone: "", email: "", address: "" };

export const AUTHORITIES: Record<AuthorityId, Authority> = {
  "dwsd-je": { id: "dwsd-je", name: "Junior Engineer, Drinking Water & Sanitation Dept.", office: "DWSD block office (Jal Jeevan Mission)", contact: blank },
  "dwsd-ee": { id: "dwsd-ee", name: "Executive Engineer, Drinking Water & Sanitation Dept.", office: "DWSD division office", contact: blank },
  "district-lab": { id: "district-lab", name: "District Water Testing Laboratory", office: "DWSD, district headquarters", contact: blank },
  "accredited-lab": { id: "accredited-lab", name: "NABL-accredited referral laboratory", office: "State referral lab", contact: blank },
  jspcb: { id: "jspcb", name: "Jharkhand State Pollution Control Board", office: "JSPCB regional office", contact: blank },
  dmo: { id: "dmo", name: "District Mining Officer", office: "Department of Mines & Geology, district office", contact: blank },
  health: { id: "health", name: "Civil Surgeon / District Surveillance Unit (IDSP)", office: "District health office", contact: blank },
  phc: { id: "phc", name: "Primary Health Centre and ASHA worker", office: "Local PHC", contact: blank },
  vwsc: { id: "vwsc", name: "Gram Panchayat / Village Water & Sanitation Committee", office: "Gram Panchayat", contact: blank },
  dc: { id: "dc", name: "Deputy Commissioner (DMF Trust chair)", office: "District Collectorate", contact: blank },
};

/** Parameters whose excess is a direct health risk, not only a taste/appearance or treatment issue. */
const HEALTH_PARAMS: ParamId[] = ["nitrate", "fluoride", "chromium6"];
const CHECKED: ParamId[] = ["iron", "fluoride", "nitrate", "hardness", "sulphate", "chromium6", "turbidity", "tds", "ec", "pH"];

export type Detection = { param: ParamId | "uranium" | "arsenic" | "bacteria" | "microbial"; value: number | null; limit: string; severity: "Precaution" | "Unsafe" };
export type Step = { authority: Authority; why: string };
export type Routing = { detections: Detection[]; steps: Step[]; mining: boolean; escalateAt: number | null; escalateNow: boolean };

function limitText(p: ParamId): string {
  const s = PARAMS[p];
  if (s.min !== undefined && s.max !== undefined) return `${s.min}–${s.max}${s.unit ? " " + s.unit : ""}`;
  return s.max !== undefined ? `${s.max} ${s.unit}` : "—";
}

export function routeContacts(unit: Unit, ver: Verification, alerts: Alert[], reports: CitizenReport[], now: number): Routing {
  const detections: Detection[] = [];
  for (const p of CHECKED) {
    const v = unit.latest?.[p]?.value;
    if (v === undefined || v === null || !isOutOfLimit(p, v)) continue;
    detections.push({ param: p, value: v, limit: limitText(p), severity: HEALTH_PARAMS.includes(p) ? "Unsafe" : "Precaution" });
  }
  for (const f of ver.failed) {
    detections.push({ param: f.type === "bacterial" ? "bacteria" : f.type, value: f.value, limit: "lab fail", severity: "Unsafe" });
  }
  const micro = unit.estimates?.microbialRisk?.p ?? 0;
  if (micro >= 0.4) detections.push({ param: "microbial", value: Math.round(micro * 100), limit: "risk ≥ 40 %", severity: "Unsafe" });

  const unitAlerts = alerts.filter((a) => a.unitId === unit.id);
  const openAlerts = unitAlerts.filter((a) => !a.acknowledgedAt);
  const illness = reports.some((r) => r.unitId === unit.id && r.type === "illness" && !r.acknowledgedAt);
  const has = (p: Detection["param"]) => detections.some((d) => d.param === p);
  const lowPH = (unit.latest?.pH?.value ?? 7) < 6.5;

  const mining =
    has("chromium6") ||
    (has("sulphate") && (lowPH || unit.mineProfile.position === "downstream")) ||
    ((has("ec") || has("turbidity")) && unit.mineProfile.position === "downstream") ||
    openAlerts.some((a) => a.type === "turbidity-spike" || a.type === "neutral-ph-leachate");
  const health = illness || has("nitrate") || has("fluoride") || has("chromium6") || has("bacteria") || has("microbial");
  const labOnly = has("uranium") || has("arsenic");

  const steps: Step[] = [];
  const add = (id: AuthorityId, why: string) => {
    if (!steps.some((s) => s.authority.id === id)) steps.push({ authority: AUTHORITIES[id], why });
  };

  if (detections.length || openAlerts.length) {
    const names = detections.map((d) => (d.param in PARAMS ? PARAMS[d.param as ParamId].label.en : d.param)).join(", ");
    add("dwsd-je", `First responder for drinking-water quality${names ? `: ${names}` : ""}. Inspect the source and the treatment unit.`);
    add("dwsd-ee", "Escalation within DWSD if the Junior Engineer cannot resolve it or treatment changes are needed.");
    add("district-lab", "Confirmatory re-test of a fresh sample, so the result is on record.");
  }
  if (labOnly) add("accredited-lab", "Uranium and arsenic must be confirmed by an accredited lab; the unit cannot show green until then.");
  if (mining) {
    add("jspcb", "The pattern points to mining or industrial discharge. JSPCB can inspect and act on the discharger.");
    add("dmo", "Links the event to a specific mine or dump using the timestamped record.");
  }
  if (health) {
    add("health", illness ? "Illness has been reported from this supply." : "Health-relevant contaminant (infants/children at risk) or microbial risk.");
    add("phc", "Local follow-up with affected households, ORS and advice.");
  }
  if (steps.length) add("vwsc", "Inform the village so households use a safe alternative source until cleared.");

  const oldestOpen = openAlerts.reduce<number | null>((m, a) => (m === null || a.raisedAt < m ? a.raisedAt : m), null);
  const escalateAt = oldestOpen === null ? null : oldestOpen + ESCALATION_MS;
  const escalateNow = escalateAt !== null && now >= escalateAt;
  if (steps.length) add("dc", escalateNow ? "Not acknowledged within 24 hours: escalate to the district administration now." : "Escalate if no one acknowledges within 24 hours.");

  return { detections, steps, mining, escalateAt, escalateNow };
}
