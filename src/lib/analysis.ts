import { DAY, haversineM, mean, median } from "./format";
import {
  ESCALATION_MS,
  LAB_OVERDUE_DAYS,
  MAX_CYCLES,
  OFFLINE_AFTER_MS,
  PARAMS,
  SCORED_PARAMS,
  VERIFY_AMBER_DAYS,
  VERIFY_RED_DAYS,
  exceedance,
} from "./thresholds";
import type {
  Alert,
  Cartridge,
  ChemTest,
  FieldTest,
  MineFeature,
  ParamId,
  Reading,
  SensorParam,
  Status,
  TapPoint,
  Unit,
} from "./types";

/* ───────────────────────── lab verification clock ───────────────────────── */

export type Verification = {
  lastVerifiedAt: number | null;
  daysSince: number | null;
  tone: "green" | "amber" | "red";
  pending: FieldTest[];
  oldestPendingDays: number | null;
  overdue: boolean;
  /** Latest lab result per test type, only where that result is a fail. */
  failed: FieldTest[];
  uraniumVerifiedDays: number | null;
};

export function verificationOf(unitId: string, tests: FieldTest[], now: number): Verification {
  const mine = tests.filter((t) => t.unitId === unitId);
  const resulted = mine.filter((t) => t.status === "resulted" && t.resultDate);
  const pending = mine.filter((t) => t.status === "pending");
  const lastVerifiedAt = resulted.reduce<number | null>(
    (m, t) => (m === null || t.resultDate! > m ? t.resultDate! : m),
    null,
  );
  const daysSince = lastVerifiedAt === null ? null : Math.floor((now - lastVerifiedAt) / DAY);
  const tone: Verification["tone"] =
    daysSince === null || daysSince >= VERIFY_RED_DAYS ? "red" : daysSince >= VERIFY_AMBER_DAYS ? "amber" : "green";
  const oldestPendingDays = pending.length
    ? Math.max(...pending.map((t) => Math.floor((now - t.collectedDate) / DAY)))
    : null;

  const failed: FieldTest[] = [];
  let uraniumAt: number | null = null;
  for (const type of ["uranium", "arsenic", "bacterial"] as const) {
    const latest = resulted
      .filter((t) => t.type === type)
      .sort((a, b) => b.resultDate! - a.resultDate!)[0];
    if (latest?.result === "fail") failed.push(latest);
    if (type === "uranium" && latest) uraniumAt = latest.resultDate;
  }
  return {
    lastVerifiedAt,
    daysSince,
    tone,
    pending,
    oldestPendingDays,
    overdue: tone === "red" || (oldestPendingDays !== null && oldestPendingDays > LAB_OVERDUE_DAYS),
    failed,
    uraniumVerifiedDays: uraniumAt === null ? null : Math.floor((now - uraniumAt) / DAY),
  };
}

/* ─────────────────────────────── status ─────────────────────────────── */

export type StatusReason = "offline" | "lab-fail" | "unverified" | "reported";

/**
 * The dashboard may only downgrade a unit's reported status. In a uranium
 * district a unit can never show green without a lab result under 60 days
 * old — it shows blue: treated, but unverified.
 */
export function effectiveStatus(unit: Unit, ver: Verification, now: number): { status: Status; reason: StatusReason } {
  if (unit.status === "grey" || now - unit.lastSeen > OFFLINE_AFTER_MS) return { status: "grey", reason: "offline" };
  if (ver.failed.length) return { status: "red", reason: "lab-fail" };
  if (
    unit.mineProfile.type === "uranium" &&
    (unit.status === "green" || unit.status === "blue") &&
    (ver.uraniumVerifiedDays === null || ver.uraniumVerifiedDays >= VERIFY_RED_DAYS)
  ) {
    return { status: "blue", reason: "unverified" };
  }
  return { status: unit.status, reason: "reported" };
}

/* ───────────────────────── contamination scoring ───────────────────────── */

/** 0–100, saturating: 39 at the limit, 63 at twice the limit, 86 at four times. */
export function contaminationScore(unit: Unit): number {
  let worst = 0;
  for (const id of SCORED_PARAMS) {
    const v = unit.latest[id]?.value;
    if (v === undefined) continue;
    worst = Math.max(worst, exceedance(id, v));
  }
  return Math.round(100 * (1 - Math.exp(-0.5 * worst)));
}

/** 0–100, 100 when standing on a mining feature, fading over ~3 km. */
export function proximityScore(unit: { lat: number; lng: number }, mines: MineFeature[]): number {
  let s = 0;
  for (const m of mines) s += Math.exp(-haversineM(unit, m) / 3000);
  return Math.round(Math.min(1, s) * 100);
}

export function heatIntensity(unit: Unit, mines: MineFeature[]): number {
  return Math.round(0.65 * contaminationScore(unit) + 0.35 * proximityScore(unit, mines));
}

/* ───────────────────────── series helpers ───────────────────────── */

export type Pt = { t: number; v: number };

export function sensorSeries(readings: Reading[], param: SensorParam, tap: TapPoint = "raw"): Pt[] {
  return readings
    .filter((r) => r.tapPoint === tap && r[param] !== null && r[param] !== undefined)
    .map((r) => ({ t: r.timestamp, v: r[param] as number }))
    .sort((a, b) => a.t - b.t);
}

export function chemSeries(tests: ChemTest[], param: ParamId, tap: TapPoint = "raw"): Pt[] {
  return tests
    .filter((c) => c.parameter === param && (c.tapPoint ?? "raw") === tap)
    .map((c) => ({ t: c.timestamp, v: c.value }))
    .sort((a, b) => a.t - b.t);
}

export function paramSeries(readings: Reading[], tests: ChemTest[], param: ParamId): Pt[] {
  return PARAMS[param].kind === "sensor"
    ? sensorSeries(readings, param as SensorParam)
    : chemSeries(tests, param);
}

const within = (pts: Pt[], from: number, to: number) => pts.filter((p) => p.t >= from && p.t < to).map((p) => p.v);

/* ───────────────── neutral-pH leachate detection ───────────────── */

export type Leachate = {
  flag: boolean;
  ecPct: number | null;
  hardnessPct: number | null;
  phDelta: number | null;
};

/**
 * The coal-mining signature pH-only systems miss: conductivity and hardness
 * climb while pH stays flat and inside the acceptable band.
 */
export function detectNeutralLeachate(readings: Reading[], tests: ChemTest[], now: number): Leachate {
  const ec = sensorSeries(readings, "ec");
  const ph = sensorSeries(readings, "pH");
  const hard = chemSeries(tests, "hardness");

  const rise = (pts: Pt[], minRecent: number, minBase: number) => {
    const recent = within(pts, now - 30 * DAY, now + DAY);
    const base = within(pts, now - 150 * DAY, now - 30 * DAY);
    if (recent.length < minRecent || base.length < minBase) return { pct: null as number | null, a: null as number | null, b: null as number | null };
    const a = mean(base)!;
    const b = mean(recent)!;
    return { pct: ((b - a) / a) * 100, a, b };
  };

  const e = rise(ec, 2, 4);
  const h = rise(hard, 1, 3);
  const p = rise(ph, 2, 4);
  const phDelta = p.a === null || p.b === null ? null : p.b - p.a;
  const phInBand = p.b !== null && p.b >= 6.5 && p.b <= 8.5;

  const flag =
    e.pct !== null &&
    h.pct !== null &&
    e.pct >= 20 &&
    h.pct >= 20 &&
    phDelta !== null &&
    Math.abs(phDelta) <= 0.3 &&
    phInBand;
  return { flag, ecPct: e.pct, hardnessPct: h.pct, phDelta };
}

/* ───────────────── event vs trend separation ───────────────── */

export type SeriesShape = {
  /** Sudden departures: blasting, discharge, overflow. */
  events: Pt[];
  /** Slow drift over the latest window, in % of the window's mean per week. null if too short. */
  trendPctPerWeek: number | null;
};

export function classifySeries(pts: Pt[]): SeriesShape {
  const events: Pt[] = [];
  for (let i = 5; i < pts.length; i++) {
    const base = median(pts.slice(i - 5, i).map((p) => p.v));
    if (base && base > 0 && pts[i].v > 1.8 * base) events.push(pts[i]);
  }
  // Weekly means first, so a burst of closely spaced readings cannot pose as a slope.
  const weeks = new Map<number, number[]>();
  for (const p of pts) {
    const w = Math.floor(p.t / (7 * DAY));
    weeks.set(w, [...(weeks.get(w) ?? []), p.v]);
  }
  const tail = [...weeks.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(-10)
    .map(([w, vs]) => ({ t: w * 7 * DAY, v: mean(vs)! }));
  let trend: number | null = null;
  if (tail.length >= 6) {
    const xs = tail.map((p) => p.t / (7 * DAY));
    const ys = tail.map((p) => p.v);
    const mx = mean(xs)!;
    const my = mean(ys)!;
    let num = 0;
    let den = 0;
    xs.forEach((x, i) => {
      num += (x - mx) * (ys[i] - my);
      den += (x - mx) ** 2;
    });
    trend = den === 0 || my === 0 ? null : ((num / den) / my) * 100;
  }
  return { events, trendPctPerWeek: trend };
}

/* ─────────────────────────── cartridges ─────────────────────────── */

export type CartridgeLife = {
  predictedLitres: number;
  remainingLitres: number;
  usedFraction: number;
  dpFraction: number;
  daysLeft: number | null;
  /** True when pressure is climbing faster than litres alone would predict. */
  pressureLimited: boolean;
};

/**
 * Litres counted, corrected by pressure trend: if the differential pressure
 * has used up 40 % of its budget after 30 % of the predicted litres, the
 * media is clogging early and breakthrough is closer than the litres say.
 */
export function cartridgeLife(c: Cartridge, dailyLitres: number): CartridgeLife {
  const dpBudget = Math.max(0.001, c.dpLimitKpa - c.dpStartKpa);
  const dpFraction = Math.max(0, Math.min(1.2, (c.dpNowKpa - c.dpStartKpa) / dpBudget));
  const pressureLife = dpFraction > 0.25 ? c.litresProcessed / dpFraction : Infinity;
  const predictedLitres = Math.min(c.predictedLifeLitres, pressureLife);
  const remainingLitres = Math.max(0, predictedLitres - c.litresProcessed);
  return {
    predictedLitres,
    remainingLitres,
    usedFraction: Math.min(1, c.litresProcessed / Math.max(1, predictedLitres)),
    dpFraction,
    daysLeft: dailyLitres > 0 ? remainingLitres / dailyLitres : null,
    pressureLimited: pressureLife < c.predictedLifeLitres,
  };
}

/* ─────────────────────────── alerts ─────────────────────────── */

export type Escalation = { state: "acknowledged" | "counting" | "broadcast"; msLeft: number };

export function escalationOf(a: Alert, now: number): Escalation {
  if (a.acknowledgedAt) return { state: "acknowledged", msLeft: 0 };
  const left = a.raisedAt + ESCALATION_MS - now;
  return { state: left <= 0 ? "broadcast" : "counting", msLeft: left };
}

/* ───────────────────── maintenance urgency ───────────────────── */

export function maintenanceUrgency(
  unit: Unit,
  status: Status,
  cartridge: { life: CartridgeLife } | null,
  ver: Verification,
  now: number,
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const offlineDays = Math.floor((now - unit.lastSeen) / DAY);
  if (status === "grey") {
    score += 50 + Math.min(30, offlineDays * 3);
    reasons.push(`Offline ${offlineDays} d`);
  }
  if (status === "red") {
    score += 20;
    reasons.push("Do not drink");
  }
  if (cartridge) {
    const rem = 1 - cartridge.life.usedFraction;
    if (rem < 0.1) {
      score += 30;
      reasons.push("Cartridge near breakthrough");
    } else if (rem < 0.25) {
      score += 15;
      reasons.push("Cartridge under 25 %");
    }
    if (cartridge.life.dpFraction >= 0.9) {
      score += 25;
      reasons.push("Pressure at limit");
    }
  }
  if (unit.cycleCount >= MAX_CYCLES) {
    score += 30;
    reasons.push("Beyond local treatment");
  }
  if (unit.currentClass === "E") {
    score += 20;
    reasons.push("Class E, cannot verify");
  }
  const faults = unit.openFaults ?? [];
  if (faults.length) {
    score += Math.min(30, faults.length * 10);
    reasons.push(`${faults.length} open fault${faults.length > 1 ? "s" : ""}`);
  }
  if (ver.tone === "red") {
    score += 10;
    reasons.push("Lab verification overdue");
  }
  return { score, reasons };
}

/* ─────────────────────── health & vulnerability ─────────────────────── */

export type HealthFlag = {
  key: string;
  label: string;
  group: "infants" | "children" | "everyone";
  atRisk: number;
  /** Source water exceeds the limit but the unit is actively treating it. */
  treated: boolean;
  basis: "measured" | "lab";
};

export function healthFlags(unit: Unit, status: Status, ver: Verification): HealthFlag[] {
  const exposed = status === "red" || status === "grey";
  const out: HealthFlag[] = [];
  const v = (id: ParamId) => unit.latest[id]?.value;
  const nitrate = v("nitrate");
  if (nitrate !== undefined && nitrate > PARAMS.nitrate.max!) {
    out.push({ key: "nitrate", label: "Nitrate", group: "infants", atRisk: unit.infantsUnder2, treated: !exposed, basis: "measured" });
  }
  const fluoride = v("fluoride");
  if (fluoride !== undefined && fluoride > PARAMS.fluoride.max!) {
    out.push({ key: "fluoride", label: "Fluoride", group: "children", atRisk: unit.childrenUnder12, treated: !exposed, basis: "measured" });
  }
  const cr = v("chromium6");
  if (cr !== undefined && cr > PARAMS.chromium6.max!) {
    out.push({ key: "chromium6", label: "Chromium (VI)", group: "children", atRisk: unit.childrenUnder12, treated: !exposed, basis: "measured" });
  }
  for (const f of ver.failed) {
    if (f.type === "arsenic") {
      out.push({ key: "arsenic", label: "Arsenic (lab)", group: "children", atRisk: unit.childrenUnder12, treated: false, basis: "lab" });
    } else if (f.type === "uranium") {
      out.push({ key: "uranium", label: "Uranium (lab)", group: "everyone", atRisk: unit.populationServed, treated: false, basis: "lab" });
    } else {
      out.push({ key: "bacterial", label: "Bacteria (lab)", group: "everyone", atRisk: unit.populationServed, treated: false, basis: "lab" });
    }
  }
  return out;
}

/* ─────────────────────────── clustering ─────────────────────────── */

/** Bins points into ~2 km grid cells; returns cells with their members. */
export function clusterPoints<T extends { location: { lat: number; lng: number } }>(items: T[], cellDeg = 0.02) {
  const cells = new Map<string, { lat: number; lng: number; items: T[] }>();
  for (const it of items) {
    const key = `${Math.round(it.location.lat / cellDeg)}:${Math.round(it.location.lng / cellDeg)}`;
    const cell = cells.get(key) ?? { lat: 0, lng: 0, items: [] };
    cell.items.push(it);
    cells.set(key, cell);
  }
  return [...cells.values()].map((c) => ({
    lat: mean(c.items.map((i) => i.location.lat))!,
    lng: mean(c.items.map((i) => i.location.lng))!,
    items: c.items,
  }));
}

export { VERIFY_AMBER_DAYS, VERIFY_RED_DAYS };
