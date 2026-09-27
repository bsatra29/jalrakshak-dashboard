import type { ChemParam, ParamId, SensorParam, Tier } from "./types";

export type ParamSpec = {
  id: ParamId;
  kind: "sensor" | "chem";
  unit: string;
  decimals: number;
  label: { en: string; hi: string };
  /** Acceptable range under IS 10500 unless noted. */
  min?: number;
  max?: number;
  /** Chemistry a mining signature shows up in. */
  mineSignal?: boolean;
};

export const PARAMS: Record<ParamId, ParamSpec> = {
  pH: { id: "pH", kind: "sensor", unit: "", decimals: 2, min: 6.5, max: 8.5, label: { en: "pH", hi: "पीएच" } },
  turbidity: { id: "turbidity", kind: "sensor", unit: "NTU", decimals: 1, max: 5, label: { en: "Turbidity", hi: "गंदलापन" } },
  tds: { id: "tds", kind: "sensor", unit: "mg/L", decimals: 0, max: 500, label: { en: "TDS", hi: "कुल घुलित ठोस" } },
  ec: { id: "ec", kind: "sensor", unit: "µS/cm", decimals: 0, max: 1000, mineSignal: true, label: { en: "Conductivity (EC)", hi: "विद्युत चालकता" } },
  temperature: { id: "temperature", kind: "sensor", unit: "°C", decimals: 1, label: { en: "Temperature", hi: "तापमान" } },
  orp: { id: "orp", kind: "sensor", unit: "mV", decimals: 0, label: { en: "ORP", hi: "ओआरपी" } },
  flow: { id: "flow", kind: "sensor", unit: "L/min", decimals: 1, label: { en: "Flow", hi: "प्रवाह" } },
  waterLevel: { id: "waterLevel", kind: "sensor", unit: "%", decimals: 0, label: { en: "Tank level", hi: "टंकी स्तर" } },
  pressureDrop: { id: "pressureDrop", kind: "sensor", unit: "kPa", decimals: 1, label: { en: "Differential pressure", hi: "दाब अंतर" } },
  iron: { id: "iron", kind: "chem", unit: "mg/L", decimals: 2, max: 0.3, mineSignal: true, label: { en: "Iron", hi: "आयरन" } },
  fluoride: { id: "fluoride", kind: "chem", unit: "mg/L", decimals: 2, max: 1.0, label: { en: "Fluoride", hi: "फ्लोराइड" } },
  nitrate: { id: "nitrate", kind: "chem", unit: "mg/L", decimals: 1, max: 45, label: { en: "Nitrate", hi: "नाइट्रेट" } },
  hardness: { id: "hardness", kind: "chem", unit: "mg/L", decimals: 0, max: 200, mineSignal: true, label: { en: "Hardness", hi: "कठोरता" } },
  sulphate: { id: "sulphate", kind: "chem", unit: "mg/L", decimals: 0, max: 200, mineSignal: true, label: { en: "Sulphate", hi: "सल्फेट" } },
  chromium6: { id: "chromium6", kind: "chem", unit: "mg/L", decimals: 3, max: 0.05, label: { en: "Chromium (VI)", hi: "क्रोमियम (VI)" } },
  freeChlorine: { id: "freeChlorine", kind: "chem", unit: "mg/L", decimals: 2, min: 0.2, max: 1.0, label: { en: "Free chlorine", hi: "मुक्त क्लोरीन" } },
};

export const SENSOR_PARAMS: SensorParam[] = ["pH", "turbidity", "tds", "ec", "temperature", "orp", "flow", "waterLevel", "pressureDrop"];
export const CHEM_PARAMS: ChemParam[] = ["iron", "fluoride", "nitrate", "hardness", "sulphate", "chromium6", "freeChlorine"];

/** Parameters compared in the before/after table and used for scoring. */
export const SCORED_PARAMS: ParamId[] = ["pH", "turbidity", "tds", "ec", "iron", "fluoride", "nitrate", "hardness", "sulphate", "chromium6"];

/** Options for the map's contaminant filter. */
export const CONTAMINANT_FILTERS: ParamId[] = ["turbidity", "tds", "ec", "iron", "fluoride", "nitrate", "hardness", "sulphate", "chromium6", "pH"];

/** Parameters that cannot be established on-site. Never rendered as a measured value. */
export const BLIND_SPOTS = ["uranium", "arsenic", "bacteria"] as const;

export function paramLabel(id: ParamId, lang: "en" | "hi"): string {
  return PARAMS[id].label[lang];
}

/** How far over its limit a value is: <1 within limit, 1 at the limit, 2 at twice the limit. */
export function exceedance(id: ParamId, value: number): number {
  const p = PARAMS[id];
  if (id === "pH") {
    if (value < 6.5) return 1 + (6.5 - value);
    if (value > 8.5) return 1 + (value - 8.5);
    return 0.4;
  }
  if (p.max === undefined) return 0;
  return value / p.max;
}

export function isOutOfLimit(id: ParamId, value: number): boolean {
  const p = PARAMS[id];
  if (p.min !== undefined && value < p.min) return true;
  if (p.max !== undefined && value > p.max) return true;
  return false;
}

export function fmtValue(id: ParamId, value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toFixed(PARAMS[id].decimals);
}

export const TIER_OF_PARAM: Record<"sensor" | "chem", Tier> = { sensor: "MEASURED", chem: "MEASURED" };

/** Days, thresholds from the product brief: amber at 30 days, red at 60. */
export const VERIFY_AMBER_DAYS = 30;
export const VERIFY_RED_DAYS = 60;
/** A sample pending longer than this at the district lab is overdue. */
export const LAB_OVERDUE_DAYS = 14;
/** Unacknowledged for this long and the alert auto-broadcasts to citizens. */
export const ESCALATION_MS = 24 * 3600 * 1000;
/** No contact for this long and the unit is shown grey. Units sync when the network returns. */
export const OFFLINE_AFTER_MS = 24 * 3600 * 1000;
export const MAX_CYCLES = 3;
