#!/usr/bin/env node
/**
 * Seeds Firestore with DEMO data so every dashboard screen has something to
 * show before real units are reporting. All mines, operators, villages'
 * readings and people below are invented for demonstration.
 *
 *   npm run seed -- --confirm            write to the project in .env.local
 *   npm run seed -- --dry                build everything, print counts, write nothing
 *
 * Against the local emulator (no credentials needed):
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099  *   SEED_PASSWORD=demo-password-1 npm run seed -- --confirm
 *
 * Needs a Firebase service account: set GOOGLE_APPLICATION_CREDENTIALS to its
 * JSON file, and SEED_PASSWORD to the password the demo officer accounts get.
 * Re-running is safe: document ids are deterministic, so it overwrites rather
 * than duplicating. It never touches auditLog.
 */
import fs from "node:fs";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const DAY = 86400000;
const HOUR = 3600000;
const NOW = Date.now();

/* ── env ── */
function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    const p = path.join(process.cwd(), f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

/* ── deterministic randomness, so re-runs give the same shapes ── */
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = mulberry32(20260921);
const jitter = (s) => 1 + (R() - 0.5) * 2 * s;
const pick = (xs) => xs[Math.floor(R() * xs.length)];
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ── season model (Jharkhand): monsoon peaks ~1 Aug, leaching peaks ~1 Nov ── */
const doy = (ts) => {
  const d = new Date(ts);
  return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / DAY);
};
const monsoon = (ts) => Math.exp(-(((doy(ts) - 213) / 45) ** 2));
const postMonsoon = (ts) => Math.exp(-(((doy(ts) - 305) / 25) ** 2));

/* ── mine features (fictional operators) ── */
const MINES = [
  { id: "M-JHR", name: "Jharia Block-II open-cast", type: "colliery", operator: "Damodar Coalfields Ltd", lat: 23.762, lng: 86.398 },
  { id: "M-JHR-T", name: "Jharia tailing pond", type: "tailingPond", operator: "Damodar Coalfields Ltd", lat: 23.738, lng: 86.44 },
  { id: "M-KTH", name: "Kathara washery", type: "washery", operator: "Konar Coal Co.", lat: 23.77, lng: 85.965 },
  { id: "M-RMG", name: "Sayal colliery", type: "colliery", operator: "Ramgarh Coal Ltd", lat: 23.625, lng: 85.55 },
  { id: "M-GRD", name: "Giridih colliery", type: "colliery", operator: "Giridih Coal Co.", lat: 24.19, lng: 86.27 },
  { id: "M-CHT", name: "Tandwa overburden dump", type: "dump", operator: "Chatra Coal Ltd", lat: 24.18, lng: 84.86 },
  { id: "M-JDG", name: "Jadu tailing pond", type: "tailingPond", operator: "Subarna Uranium Corp.", lat: 22.655, lng: 86.352 },
  { id: "M-NMD", name: "Noa iron-ore overburden dump", type: "dump", operator: "Noa Iron & Steel", lat: 22.16, lng: 85.5 },
  { id: "M-CHR", name: "Kharsawa chromite dump", type: "dump", operator: "Subarna Minerals", lat: 22.72, lng: 85.95 },
  { id: "M-HZB", name: "Barkagaon stone quarry", type: "dump", operator: "Hazari Stone Works", lat: 23.885, lng: 85.43 },
  { id: "M-PKR", name: "Pakur stone quarry", type: "dump", operator: "Pakur Stone Works", lat: 24.63, lng: 87.84 },
];

/* ── units ── */
const CLEAN = { ph: 7.4, turb: 2, ec: 420, hard: 140, so4: 30, fe: 0.1, f: 0.4, no3: 12, cr: 0.005 };
const U = (id, o) => ({
  leachF: 0.03, ramp: false, spikeWeeks: [], stream: null, between: null, ...o, id, base: { ...CLEAN, ...o.base },
});

const UNITS = [
  U("DHN-01", { name: "Bhaga (upstream)", village: "Bhaga", block: "Jharia", district: "Dhanbad", lat: 23.792, lng: 86.372, mine: "coal", dist: 5200, pos: "upstream", src: "surface", base: { ec: 620, hard: 190, so4: 90, fe: 0.25, turb: 6, ph: 7.5 }, leachF: 0.5, status: "green", cls: "B", cart: "Slot 2 · Sand + activated carbon", cycles: 0, seenH: 1, pop: 1450, stream: "damodar-jharia", nearest: "M-JHR", verified: 12, media: ["Sand + activated carbon", 2, 0.42, 200] }),
  U("DHN-02", { name: "Lodna (downstream)", village: "Lodna", block: "Jharia", district: "Dhanbad", lat: 23.722, lng: 86.418, mine: "coal", dist: 900, pos: "downstream", src: "surface", base: { ec: 1450, hard: 420, so4: 430, fe: 1.2, turb: 18, ph: 6.9 }, leachF: 0.7, spikeWeeks: [3, 14, 31], status: "red", cls: "C", cart: "Slot 4 · Ion-exchange (sulphate)", cycles: 2, seenH: 0.5, pop: 2100, stream: "damodar-jharia", between: "M-JHR", nearest: "M-JHR", verified: 34, pendingBact: 6, media: ["Ion-exchange (sulphate)", 4, 0.78, 120], micro: 0.31 }),
  U("DHN-03", { name: "Kusunda (groundwater)", village: "Kusunda", block: "Jharia", district: "Dhanbad", lat: 23.775, lng: 86.43, mine: "coal", dist: 1600, pos: "none", src: "groundwater", base: { ec: 900, hard: 300, so4: 210, fe: 0.3, turb: 2, ph: 7.5 }, leachF: 0.7, ramp: true, status: "amber", cls: "C", cart: "Slot 4 · Ion-exchange (sulphate)", cycles: 1, seenH: 2, pop: 1800, nearest: "M-JHR", verified: 22, media: ["Ion-exchange (sulphate)", 4, 0.66, 120] }),
  U("BKR-01", { name: "Kathara (upstream)", village: "Kathara", block: "Gomia", district: "Bokaro", lat: 23.805, lng: 85.93, mine: "coal", dist: 4300, pos: "upstream", src: "surface", base: { ec: 700, hard: 220, so4: 100, fe: 0.3, turb: 7 }, leachF: 0.6, status: "green", cls: "B", cart: "Slot 2 · Sand + activated carbon", cycles: 0, seenH: 1, pop: 980, stream: "konar-kathara", nearest: "M-KTH", verified: 9, media: ["Sand + activated carbon", 2, 0.3, 200] }),
  U("BKR-02", { name: "Ghutiatand (downstream)", village: "Ghutiatand", block: "Gomia", district: "Bokaro", lat: 23.742, lng: 86.0, mine: "coal", dist: 700, pos: "downstream", src: "surface", base: { ec: 1250, hard: 380, so4: 360, fe: 0.9, turb: 15 }, leachF: 0.7, spikeWeeks: [7, 20], status: "amber", cls: "C", cart: "Slot 4 · Ion-exchange (sulphate)", cycles: 1, seenH: 1, pop: 1320, stream: "konar-kathara", between: "M-KTH", nearest: "M-KTH", verified: 18, media: ["Ion-exchange (sulphate)", 4, 0.55, 120] }),
  U("RMG-01", { name: "Sayal village", village: "Sayal", block: "Patratu", district: "Ramgarh", lat: 23.632, lng: 85.545, mine: "coal", dist: 800, pos: "none", src: "surface", base: { ec: 1100, hard: 330, so4: 300, fe: 0.8, turb: 12, f: 0.9, no3: 20 }, leachF: 0.7, status: "red", cls: "E", cart: null, cycles: 3, seenH: 2, pop: 1650, nearest: "M-RMG", verified: 40, arsenicFail: 12, faults: ["pump-pressure-high"], micro: 0.55 }),
  U("HZB-01", { name: "Barkagaon", village: "Barkagaon", block: "Barkagaon", district: "Hazaribagh", lat: 23.895, lng: 85.42, mine: "quarry", dist: 1200, pos: "none", src: "groundwater", base: { ec: 500, hard: 220, turb: 30 }, leachF: 0.25, status: "amber", cls: "A", cart: "Slot 1 · Sand filter", cycles: 1, seenH: 3, pop: 720, nearest: "M-HZB", verified: null, faults: ["turbidity-probe"], micro: 0.62, media: ["Sand filter", 1, 0.7, 240] }),
  U("GRD-01", { name: "Dumri", village: "Dumri", block: "Dumri", district: "Giridih", lat: 24.155, lng: 86.29, mine: "coal", dist: 2100, pos: "none", src: "groundwater", base: { ec: 800, hard: 260, so4: 200, fe: 0.6, turb: 4, f: 1.3 }, leachF: 0.7, status: "green", cls: "D", cart: "Slot 3 · Activated alumina (fluoride)", cycles: 0, seenH: 2, pop: 1100, nearest: "M-GRD", verified: 26, pendingBact: 3, media: ["Activated alumina (fluoride)", 3, 0.5, 180] }),
  U("GRD-02", { name: "Bengabad", village: "Bengabad", block: "Bengabad", district: "Giridih", lat: 24.2, lng: 86.16, mine: "coal", dist: 3400, pos: "none", src: "groundwater", base: { ec: 950, hard: 290, so4: 230, fe: 0.5 }, leachF: 0.7, status: "green", cls: "B", cart: "Slot 2 · Sand + activated carbon", cycles: 0, seenH: 76, pop: 640, nearest: "M-GRD", verified: 47, faults: ["no-uplink", "power"], media: ["Sand + activated carbon", 2, 0.9, 200] }),
  U("CHT-01", { name: "Tandwa", village: "Tandwa", block: "Tandwa", district: "Chatra", lat: 24.2, lng: 84.9, mine: "coal", dist: 1500, pos: "none", src: "groundwater", base: { ec: 850, hard: 280, so4: 240, fe: 0.5, no3: 52 }, leachF: 0.6, status: "amber", cls: "D", cart: "Slot 3 · Ion-exchange (nitrate)", cycles: 2, seenH: 3, pop: 900, nearest: "M-CHT", verified: 28, media: ["Ion-exchange (nitrate)", 3, 1.08, 120] }),
  U("ESB-01", { name: "Jaduguda (upstream)", village: "Jaduguda", block: "Musabani", district: "East Singhbhum", lat: 22.7, lng: 86.328, mine: "uranium", dist: 3800, pos: "upstream", src: "surface", base: { ec: 520, hard: 150, so4: 60, fe: 0.15, turb: 3 }, leachF: 0.5, status: "green", cls: "A", cart: "Slot 5 · Uranium-selective resin", cycles: 0, seenH: 1, pop: 1250, stream: "subarnarekha-jaduguda", nearest: "M-JDG", uraniumDaysAgo: 75, media: ["Uranium-selective resin", 5, 0.4, 240], hazard: true }),
  U("ESB-02", { name: "Turamdih (downstream)", village: "Turamdih", block: "Musabani", district: "East Singhbhum", lat: 22.62, lng: 86.37, mine: "uranium", dist: 600, pos: "downstream", src: "surface", base: { ec: 640, hard: 170, so4: 90, fe: 0.2, turb: 4 }, leachF: 0.5, status: "blue", cls: "E", cart: "Slot 5 · Uranium-selective resin", cycles: 1, seenH: 2, pop: 1400, stream: "subarnarekha-jaduguda", between: "M-JDG", nearest: "M-JDG", uraniumDaysAgo: 88, pendingUranium: 19, media: ["Uranium-selective resin", 5, 0.65, 240], hazard: true }),
  U("ESB-03", { name: "Narwapahar", village: "Narwapahar", block: "Musabani", district: "East Singhbhum", lat: 22.66, lng: 86.29, mine: "uranium", dist: 2600, pos: "none", src: "groundwater", base: { ec: 480, hard: 140, so4: 40, fe: 0.1 }, leachF: 0.5, status: "green", cls: "A", cart: "Slot 5 · Uranium-selective resin", cycles: 0, seenH: 1, pop: 870, nearest: "M-JDG", uraniumDaysAgo: 20, media: ["Uranium-selective resin", 5, 0.2, 240], hazard: true }),
  U("WSB-01", { name: "Noamundi (surface)", village: "Noamundi", block: "Noamundi", district: "West Singhbhum", lat: 22.155, lng: 85.485, mine: "iron ore", dist: 700, pos: "none", src: "surface", base: { ec: 480, hard: 160, so4: 70, fe: 1.8, turb: 35 }, leachF: 0.6, status: "amber", cls: "B", cart: "Slot 2 · Bio-media (mango seed)", cycles: 1, seenH: 2, pop: 1900, nearest: "M-NMD", verified: 31, media: ["Bio-media (mango seed)", 2, 0.82, 70] }),
  U("WSB-02", { name: "Gua (groundwater)", village: "Gua", block: "Noamundi", district: "West Singhbhum", lat: 22.2, lng: 85.4, mine: "iron ore", dist: 2400, pos: "none", src: "groundwater", base: { ec: 430, hard: 150, fe: 0.9 }, leachF: 0.6, status: "green", cls: "B", cart: "Slot 2 · Bio-media (jackfruit seed)", cycles: 0, seenH: 1, pop: 760, nearest: "M-NMD", verified: 15, media: ["Bio-media (jackfruit seed)", 2, 0.35, 70] }),
  U("SRK-01", { name: "Kharsawa", village: "Kharsawa", block: "Kharsawan", district: "Saraikela-Kharsawan", lat: 22.745, lng: 85.93, mine: "chromite", dist: 900, pos: "none", src: "groundwater", base: { ec: 700, hard: 240, so4: 60, fe: 0.3, ph: 7.8, cr: 0.14 }, leachF: 0.5, status: "red", cls: "D", cart: "Slot 4 · Iron-oxide (chromium)", cycles: 2, seenH: 1, pop: 1050, nearest: "M-CHR", verified: 44, pendingArsenic: 16, media: ["Iron-oxide (chromium)", 4, 0.88, 150], hazard: true }),
  U("PKR-01", { name: "Pakur (quarry belt)", village: "Maheshpur", block: "Pakur", district: "Pakur", lat: 24.62, lng: 87.85, mine: "quarry", dist: 800, pos: "none", src: "groundwater", base: { ec: 600, hard: 250, turb: 3, f: 1.6 }, leachF: 0.25, status: "green", cls: "D", cart: "Slot 3 · Activated alumina (fluoride)", cycles: 0, seenH: 2, pop: 830, nearest: "M-PKR", verified: 8, media: ["Activated alumina (fluoride)", 3, 0.45, 180] }),
  U("RNC-01", { name: "Namkum", village: "Namkum", block: "Namkum", district: "Ranchi", lat: 23.32, lng: 85.38, mine: "none", dist: 0, pos: "none", src: "groundwater", base: {}, status: "green", cls: "A", cart: "Slot 1 · Sand filter", cycles: 0, seenH: 1, pop: 1500, verified: 5, media: ["Sand filter", 1, 0.25, 240] }),
  U("DEO-01", { name: "Madhupur", village: "Madhupur", block: "Madhupur", district: "Deoghar", lat: 24.27, lng: 86.64, mine: "none", dist: 0, pos: "none", src: "groundwater", base: { no3: 30 }, status: "green", cls: "A", cart: "Slot 1 · Sand filter", cycles: 0, seenH: 1, pop: 1250, verified: 36, media: ["Sand filter", 1, 0.3, 240] }),
];

/* ── generation ── */
const TAPS = ["raw", "sediment", "carbon", "media", "final"];
const TAP = {
  turb: [1, 0.35, 0.2, 0.12, 0.06],
  cond: [1, 1, 0.99, 0.96, 0.92],
  ph: [0, 0.03, 0.05, 0.08, 0.1],
  orp: [0, 10, 40, 60, 90],
  dp: [null, 6, 10, 16, 19],
};

function rampFactor(u, ts) {
  if (!u.ramp) return 1;
  const start = NOW - 75 * DAY;
  return 1 + 0.5 * clamp((ts - start) / (75 * DAY), 0, 1);
}

function rawAt(u, ts, weekIdx) {
  const b = u.base;
  const m = monsoon(ts);
  const p = postMonsoon(ts);
  const leach = 1 + u.leachF * p;
  const ramp = rampFactor(u, ts);
  const spike = weekIdx !== null && u.spikeWeeks.includes(weekIdx);
  const surface = u.src === "surface" ? 1.4 : 1;
  const ec = b.ec * (1 - 0.25 * m) * leach * ramp * jitter(0.05) * (spike ? 2.3 : 1);
  return {
    pH: round(b.ph - 0.1 * m + (R() - 0.5) * 0.1, 2),
    turbidity: round(b.turb * (1 + 2.0 * m * surface) * jitter(0.12) * (spike ? 3 : 1), 1),
    ec: round(ec, 0),
    tds: round(ec * 0.62 * jitter(0.03), 0),
    temperature: round(26 + 5 * Math.cos((2 * Math.PI * (doy(ts) - 150)) / 365) + (R() - 0.5), 1),
    orp: round(230 + (R() - 0.5) * 60, 0),
    rain: spike ? 0 : m > 0.25 ? round(m * 70 * R() * 2, 0) : R() < 0.1 ? round(R() * 12, 0) : 0,
  };
}

function chemAt(u, ts) {
  const b = u.base;
  const m = monsoon(ts);
  const p = postMonsoon(ts);
  const leach = 1 + u.leachF * p;
  const ramp = rampFactor(u, ts);
  return {
    hardness: round(b.hard * (1 - 0.2 * m) * leach * ramp * jitter(0.05), 0),
    sulphate: round(b.so4 * (1 - 0.2 * m) * leach * (u.ramp ? 1 + 0.4 * (ramp - 1) * 2 : 1) * jitter(0.06), 0),
    iron: round(b.fe * (1 - 0.15 * m) * leach * jitter(0.08), 2),
    fluoride: round(b.f * (1 - 0.15 * m) * jitter(0.05), 2),
    nitrate: round(b.no3 * (1 + 0.2 * m) * jitter(0.06), 1),
    chromium6: round(b.cr * (1 + (u.mine === "chromite" ? 0.6 : 0) * p) * jitter(0.08), 3),
  };
}

const METHOD = {
  hardness: "EDTA colorimetry (camera)",
  sulphate: "Turbidimetric (camera)",
  iron: "1,10-phenanthroline (camera)",
  fluoride: "SPADNS colorimetry (camera)",
  nitrate: "Cadmium-reduction colorimetry (camera)",
  chromium6: "Diphenylcarbazide (camera)",
};

const FINAL_FACTOR = (u) => {
  const f = { hardness: 0.9, sulphate: 0.95, iron: 0.3, fluoride: 0.9, nitrate: 0.9, chromium6: 0.85 };
  const media = u.media?.[0] ?? "";
  if (/fluoride/.test(media)) f.fluoride = 0.12;
  if (/nitrate/.test(media)) f.nitrate = 0.14;
  if (/chromium/.test(media)) { f.chromium6 = 0.08; f.iron = 0.2; }
  if (/sulphate/.test(media)) { f.sulphate = 0.35; f.hardness = 0.6; }
  if (/Bio-media/.test(media)) { f.iron = 0.25; f.hardness = 0.85; }
  return f;
};

function build() {
  const out = { units: [], readings: [], chem: [], fieldTests: [], alerts: [], reports: [], cartridges: [], maintenance: [], mineEvents: [], officersMeta: [] };
  const spikeTimes = {};

  for (const u of UNITS) {
    const readings = [];
    const chem = [];
    const finalF = FINAL_FACTOR(u);

    // weekly, 12 months: raw + final
    for (let k = 1; k <= 52; k++) {
      const ts = NOW - k * 7 * DAY - Math.floor(R() * 6 * HOUR);
      const r = rawAt(u, ts, k);
      if (u.spikeWeeks.includes(k)) (spikeTimes[u.id] ??= []).push(ts);
      readings.push({ id: `w${k}_raw`, unitId: u.id, timestamp: ts, tapPoint: "raw", pH: r.pH, turbidity: r.turbidity, tds: r.tds, ec: r.ec, temperature: r.temperature, orp: r.orp, flow: null, pressureDrop: null, rainfallMm: r.rain, confidenceTier: "MEASURED" });
      readings.push({ id: `w${k}_final`, unitId: u.id, timestamp: ts, tapPoint: "final", pH: round(r.pH + 0.1, 2), turbidity: round(r.turbidity * 0.06, 1), tds: round(r.tds * 0.92, 0), ec: round(r.ec * 0.92, 0), temperature: r.temperature, orp: r.orp + 90, flow: round((u.pop * 3) / 1440, 1), pressureDrop: 19, confidenceTier: "MEASURED" });
    }

    // last ~45 h every 3 h: all five tap points
    let latestRaw = null;
    for (let j = 0; j < 16; j++) {
      const ts = NOW - j * 3 * HOUR - Math.floor(R() * 20 * 60000);
      const r = rawAt(u, ts, null);
      if (j === 0) latestRaw = r;
      TAPS.forEach((tap, i) => {
        readings.push({
          id: `h${j}_${tap}`, unitId: u.id, timestamp: ts, tapPoint: tap,
          pH: round(r.pH + TAP.ph[i], 2), turbidity: round(r.turbidity * TAP.turb[i], 1),
          tds: round(r.tds * TAP.cond[i], 0), ec: round(r.ec * TAP.cond[i], 0),
          temperature: r.temperature, orp: r.orp + TAP.orp[i],
          flow: tap === "final" ? round((u.pop * 3) / 1440 * jitter(0.1), 1) : null,
          pressureDrop: TAP.dp[i] === null ? null : round(TAP.dp[i] * (0.8 + 0.5 * (u.media?.[2] ?? 0.3)) * jitter(0.04), 1),
          rainfallMm: tap === "raw" ? 0 : null, confidenceTier: "MEASURED",
        });
      });
    }

    // colorimetric carousel, every 14 days, raw tap
    let latestChem = null;
    for (let k = 0; k < 26; k++) {
      const ts = NOW - k * 14 * DAY - DAY;
      const c = chemAt(u, ts);
      if (k === 0) latestChem = c;
      for (const [param, value] of Object.entries(c)) {
        if (value === 0 && u.base[{ hardness: "hard", sulphate: "so4", iron: "fe", fluoride: "f", nitrate: "no3", chromium6: "cr" }[param]] === 0) continue;
        chem.push({ id: `c${k}_${param}`, unitId: u.id, timestamp: ts, parameter: param, value, method: METHOD[param], tapPoint: "raw", confidenceTier: "MEASURED" });
      }
    }
    for (const [param, value] of Object.entries(latestChem)) {
      chem.push({ id: `cf_${param}`, unitId: u.id, timestamp: NOW - DAY, parameter: param, value: round(value * (finalF[param] ?? 1), param === "chromium6" ? 3 : 2), method: METHOD[param], tapPoint: "final", confidenceTier: "MEASURED" });
    }

    const latest = {};
    const at = NOW - 20 * 60000;
    for (const [k, key] of [["pH", "pH"], ["turbidity", "turbidity"], ["tds", "tds"], ["ec", "ec"], ["temperature", "temperature"], ["orp", "orp"]]) latest[k] = { value: latestRaw[key], tier: "MEASURED", at };
    for (const [param, value] of Object.entries(latestChem)) latest[param] = { value, tier: "MEASURED", at: NOW - DAY };

    const [mediaType, slot, usedFrac, lifeDays] = u.media ?? [];
    const predicted = Math.round(u.pop * 3 * (lifeDays ?? 0));
    const infants = Math.round(u.pop * 0.024);
    const children = Math.round(u.pop * 0.17);
    out.units.push({
      id: u.id, name: u.name, village: u.village, block: u.block, district: u.district, lat: u.lat, lng: u.lng,
      status: u.status,
      mineProfile: { type: u.mine, distanceM: u.dist, position: u.pos, sourceType: u.src },
      currentClass: u.cls, fittedCartridge: u.cart, cycleCount: u.cycles,
      lastSeen: NOW - u.seenH * HOUR,
      populationServed: u.pop, infantsUnder2: infants, childrenUnder12: children,
      dailyLitres: Math.round(u.pop * 3),
      streamId: u.stream ?? null, mineBetweenId: u.between ?? null, nearestMineId: u.nearest ?? null,
      openFaults: u.faults ?? [],
      latest,
      estimates: { microbialRisk: (() => { const p = u.micro ?? round(0.05 + R() * 0.2, 2); return { p, lo: round(Math.max(0, p - 0.12), 2), hi: round(Math.min(1, p + 0.15), 2), at } })() },
    });
    for (const r of readings) out.readings.push({ unitId: u.id, ...r });
    for (const c of chem) out.chem.push({ unitId: u.id, ...c });

    // cartridges
    if (mediaType) {
      const litres = Math.round(predicted * usedFrac * jitter(0.03));
      out.cartridges.push({
        id: `${u.id}-S${slot}`, unitId: u.id, slot, mediaType, installedDate: NOW - Math.round(usedFrac * lifeDays) * DAY,
        litresProcessed: litres, predictedLifeLitres: predicted,
        dpStartKpa: 4, dpNowKpa: round(4 + 14 * Math.min(1.1, usedFrac * (u.id === "RMG-01" || u.id === "HZB-01" ? 1.25 : 1)), 1), dpLimitKpa: 20,
        status: "active", hazardous: Boolean(u.hazard),
      });
    }

    // field tests
    const gps = { lat: u.lat + (R() - 0.5) * 0.002, lng: u.lng + (R() - 0.5) * 0.002 };
    const ft = (id, type, daysAgo, o) => out.fieldTests.push({ id: `${u.id}-${id}`, unitId: u.id, sampleId: `${type.slice(0, 3).toUpperCase()}-${u.id}-${id}`, type, gps, collectedDate: NOW - daysAgo * DAY, status: "resulted", result: "pass", value: null, resultDate: NOW - (daysAgo - 3) * DAY, enteredBy: "District lab", ...o });
    if (u.verified !== undefined && u.verified !== null) ft("B1", "bacterial", u.verified + 3, { value: 0 });
    if (u.uraniumDaysAgo) ft("U1", "uranium", u.uraniumDaysAgo + 3, { value: round(4 + R() * 6, 1) });
    if (u.arsenicFail) ft("A1", "arsenic", u.arsenicFail + 3, { result: "fail", value: 18 });
    if (u.pendingBact) ft("B2", "bacterial", u.pendingBact, { status: "pending", result: null, resultDate: null, enteredBy: null });
    if (u.pendingUranium) ft("U2", "uranium", u.pendingUranium, { status: "pending", result: null, resultDate: null, enteredBy: null });
    if (u.pendingArsenic) ft("A2", "arsenic", u.pendingArsenic, { status: "pending", result: null, resultDate: null, enteredBy: null });

    // maintenance history
    const kinds = ["cleaning", "inspection", "sensor-service", "repair"];
    for (let i = 0; i < 2; i++) out.maintenance.push({ id: `${u.id}-m${i}`, unitId: u.id, timestamp: NOW - (20 + i * 50 + Math.floor(R() * 20)) * DAY, kind: kinds[(i + u.id.length) % 4], note: pick(["Cleaned probes and checked flow", "Routine inspection, no fault", "Recalibrated turbidity sensor", "Replaced worn pump seal"]), officerName: "Block maintenance staff" });
  }

  // spent media (some hazardous)
  const spent = [
    ["ESB-01", 5, "Uranium-selective resin", 300000, 297600, 120, true, "awaiting-collection"],
    ["SRK-01", 4, "Iron-oxide (chromium)", 240000, 243600, 70, true, "collected"],
    ["DHN-02", 4, "Ion-exchange (sulphate)", 480000, 469200, 95, false, "disposed"],
    ["BKR-02", 4, "Ion-exchange (sulphate)", 480000, 489600, 40, false, "awaiting-collection"],
    ["WSB-01", 2, "Bio-media (mango seed)", 240000, 234000, 60, false, "collected"],
    ["GRD-01", 3, "Activated alumina (fluoride)", 360000, 361200, 150, false, "disposed"],
  ];
  for (const [unitId, slot, media, predicted, litres, daysAgo, hazardous, disposal] of spent) {
    out.cartridges.push({ id: `${unitId}-S${slot}-old`, unitId, slot, mediaType: media, installedDate: NOW - (daysAgo + 180) * DAY, litresProcessed: litres, predictedLifeLitres: predicted, dpStartKpa: 4, dpNowKpa: 19, dpLimitKpa: 20, status: "replaced", removedDate: NOW - daysAgo * DAY, hazardous, disposal });
  }

  // mine events, aligned with the downstream spikes
  const between = { "DHN-02": "M-JHR", "BKR-02": "M-KTH" };
  const evTypes = ["discharge", "blasting", "overflow"];
  for (const [unitId, mineId] of Object.entries(between)) {
    (spikeTimes[unitId] ?? []).forEach((ts, i) => out.mineEvents.push({ id: `${mineId}-e${i}`, mineId, type: evTypes[i % 3], timestamp: ts - 6 * HOUR, note: "Logged by inspector" }));
    for (let i = 0; i < 3; i++) out.mineEvents.push({ id: `${mineId}-x${i}`, mineId, type: pick(evTypes), timestamp: NOW - (30 + R() * 300) * DAY, note: "Routine blasting round" });
  }
  for (const mineId of ["M-JDG", "M-CHR", "M-RMG"]) out.mineEvents.push({ id: `${mineId}-e0`, mineId, type: "overflow", timestamp: NOW - (90 + R() * 100) * DAY, note: "Pond level alarm" });

  addKharam(out);

  return out;
}

/* ── Kharam (Baliapur, Dhanbad): iron detected in the carousel test, everything else stable.
   Monitoring tank: raw chamber vs treated chamber. The batch has already passed, so the tank
   is full and flow reads 0 (batch complete, not stagnation). OSM node 9330239014. ── */
const KHARAM = { id: "DHN-04", lat: 23.71475, lng: 86.46702, pop: 940 };
const KH_RAW = { pH: 6.8, turbidity: 4.5, tds: 310, ec: 480, orp: 120, temperature: 26.5 };
const KH_FINAL = { pH: 7.1, turbidity: 0.8, tds: 285, ec: 440, orp: 320, temperature: 26.5 };
const KH_CHEM = { iron: 1.0, freeChlorine: 0.3, fluoride: 0.4, nitrate: 12, hardness: 150, sulphate: 40 };
const KH_CHEM_FINAL = { iron: 0.12, freeChlorine: 0.3, fluoride: 0.38, nitrate: 11.5, hardness: 142, sulphate: 38 };
const KH_METHOD = { ...METHOD, iron: "Black-tea tannin colorimetry (camera)", freeChlorine: "Chlorine strip (camera)" };

function addKharam(out) {
  const u = KHARAM;
  const K = mulberry32(4702);
  const wob = (v, s) => v * (1 + (K() - 0.5) * 2 * s);
  const mix = (a, b, f) => a + (b - a) * f;
  const seasonalTemp = (ts) => round(26 + 4 * Math.cos((2 * Math.PI * (doy(ts) - 150)) / 365), 1);
  const mines = MINES.map((m) => ({ m, d: Math.hypot((m.lat - u.lat) * 111000, (m.lng - u.lng) * 102000) })).sort((a, b) => a.d - b.d);
  const push = (r) => out.readings.push({ unitId: u.id, confidenceTier: "MEASURED", pressureDrop: null, rainfallMm: null, ...r });

  // weekly, 12 months: stable, low iron background
  for (let k = 1; k <= 52; k++) {
    const ts = NOW - k * 7 * DAY - Math.floor(K() * 6 * HOUR);
    push({ id: `w${k}_raw`, timestamp: ts, tapPoint: "raw", pH: round(wob(7.0, 0.01), 2), turbidity: round(wob(2.4, 0.12), 1), tds: round(wob(295, 0.03), 0), ec: round(wob(458, 0.03), 0), temperature: seasonalTemp(ts), orp: round(wob(190, 0.08), 0), flow: null, waterLevel: round(wob(85, 0.1), 0) });
    push({ id: `w${k}_final`, timestamp: ts, tapPoint: "final", pH: round(wob(7.15, 0.01), 2), turbidity: round(wob(0.6, 0.15), 1), tds: round(wob(280, 0.03), 0), ec: round(wob(435, 0.03), 0), temperature: seasonalTemp(ts), orp: round(wob(330, 0.05), 0), flow: round(wob(2.0, 0.1), 1), waterLevel: round(wob(85, 0.1), 0) });
  }

  // last ~45 h every 3 h, all taps. Iron develops in the raw chamber over the last two days;
  // the newest batch has fully passed: tank full, no flow.
  for (let j = 0; j < 16; j++) {
    const ts = NOW - j * 3 * HOUR - (j === 0 ? 20 * 60000 : Math.floor(K() * 20 * 60000));
    const f = j === 0 ? 1 : Math.max(0.35, 1 - j * 0.045);
    const raw = j === 0 ? { ...KH_RAW } : {
      pH: round(mix(7.0, KH_RAW.pH, f) + (K() - 0.5) * 0.04, 2),
      turbidity: round(wob(mix(2.4, KH_RAW.turbidity, f), 0.05), 1),
      tds: round(wob(mix(295, KH_RAW.tds, f), 0.01), 0),
      ec: round(wob(mix(458, KH_RAW.ec, f), 0.01), 0),
      orp: round(wob(mix(190, KH_RAW.orp, f), 0.04), 0),
    };
    const fin = j === 0 ? { ...KH_FINAL } : {
      pH: round(KH_FINAL.pH + (K() - 0.5) * 0.04, 2),
      turbidity: round(wob(KH_FINAL.turbidity, 0.1), 1),
      tds: round(wob(KH_FINAL.tds, 0.01), 0),
      ec: round(wob(KH_FINAL.ec, 0.01), 0),
      orp: round(wob(KH_FINAL.orp, 0.03), 0),
    };
    const flowing = j >= 1 && j <= 4; // the batch ran through 3–12 h ago
    const level = flowing ? 100 - (5 - j) * 12 : 100;
    TAPS.forEach((tap, i) => {
      const x = i / (TAPS.length - 1);
      const dec = { pH: 2, turbidity: 1, tds: 0, ec: 0, orp: 0 };
      const r = Object.fromEntries(Object.keys(dec).map((k) => [k, round(mix(raw[k], fin[k], x), dec[k])]));
      const inTank = tap === "raw" || tap === "final";
      push({
        id: `h${j}_${tap}`, timestamp: ts, tapPoint: tap, ...r, temperature: KH_RAW.temperature,
        flow: inTank ? (flowing ? round(wob(2.1, 0.06), 1) : 0) : null,
        waterLevel: inTank ? level : null,
        pressureDrop: TAP.dp[i] === null ? null : round(TAP.dp[i] * 0.85, 1),
        rainfallMm: tap === "raw" ? 0 : null,
      });
    });
  }

  // carousel chemistry: fortnightly background, then daily over the last week as iron rises
  const chemRow = (id, ts, param, value, tap) => out.chem.push({ id, unitId: u.id, timestamp: ts, parameter: param, value, method: KH_METHOD[param], tapPoint: tap, confidenceTier: "MEASURED" });
  const background = { iron: 0.18, freeChlorine: 0.3, fluoride: 0.4, nitrate: 12, hardness: 148, sulphate: 39 };
  for (let k = 1; k < 26; k++) {
    const ts = NOW - (7 + k * 14) * DAY;
    for (const [p, v] of Object.entries(background)) chemRow(`c${k}_${p}`, ts, p, round(wob(v, 0.06), 2), "raw");
  }
  const ironWeek = [0.22, 0.28, 0.36, 0.48, 0.62, 0.8]; // 6 days ago … yesterday
  ironWeek.forEach((fe, i) => {
    const ts = NOW - (6 - i) * DAY - 2 * HOUR;
    chemRow(`d${i}_iron`, ts, "iron", fe, "raw");
    for (const [p, v] of Object.entries(KH_CHEM)) if (p !== "iron") chemRow(`d${i}_${p}`, ts, p, round(wob(v, 0.04), 2), "raw");
  });
  const tChem = NOW - 3 * HOUR;
  for (const [p, v] of Object.entries(KH_CHEM)) chemRow(`c0_${p}`, tChem, p, v, "raw");
  for (const [p, v] of Object.entries(KH_CHEM_FINAL)) chemRow(`cf_${p}`, tChem + 90 * 60000, p, v, "final");

  const at = NOW - 20 * 60000;
  const latest = {};
  for (const [k, v] of Object.entries(KH_RAW)) latest[k] = { value: v, tier: "MEASURED", at };
  latest.waterLevel = { value: 100, tier: "MEASURED", at };
  latest.flow = { value: 0, tier: "MEASURED", at };
  for (const [k, v] of Object.entries(KH_CHEM)) latest[k] = { value: v, tier: "MEASURED", at: tChem };

  out.units.push({
    id: u.id, name: "Kharam", village: "Kharam", block: "Baliapur", district: "Dhanbad", lat: u.lat, lng: u.lng,
    status: "amber",
    mineProfile: { type: "coal", distanceM: Math.round(mines[0].d), position: "none", sourceType: "groundwater" },
    currentClass: "B", fittedCartridge: "Slot 2 · Aeration + iron-removal sand", cycleCount: 1,
    lastSeen: at,
    populationServed: u.pop, infantsUnder2: Math.round(u.pop * 0.024), childrenUnder12: Math.round(u.pop * 0.17),
    dailyLitres: u.pop * 3, streamId: null, mineBetweenId: null, nearestMineId: mines[0].m.id,
    openFaults: [], latest,
    estimates: { microbialRisk: { p: 0.06, lo: 0.02, hi: 0.12, at } },
  });
  out.cartridges.push({ id: `${u.id}-S2`, unitId: u.id, slot: 2, mediaType: "Aeration + iron-removal sand", installedDate: NOW - 60 * DAY, litresProcessed: Math.round(u.pop * 3 * 60), predictedLifeLitres: Math.round(u.pop * 3 * 200), dpStartKpa: 4, dpNowKpa: 7.5, dpLimitKpa: 20, status: "active", hazardous: false });
  const gps = { lat: u.lat, lng: u.lng };
  for (const [id, type] of [["B1", "bacterial"], ["U1", "uranium"], ["A1", "arsenic"]]) {
    out.fieldTests.push({ id: `${u.id}-${id}`, unitId: u.id, sampleId: `${type.slice(0, 3).toUpperCase()}-${u.id}-${id}`, type, gps, collectedDate: NOW - 13 * DAY, status: "resulted", result: "pass", value: type === "bacterial" ? 0 : null, resultDate: NOW - 10 * DAY, enteredBy: "District lab" });
  }
  out.maintenance.push({ id: `${u.id}-m0`, unitId: u.id, timestamp: NOW - 18 * DAY, kind: "inspection", note: "Routine inspection, no fault", officerName: "Block maintenance staff" });
}

/* officers, alerts and reports need officer uids, so they are built after auth users exist */
const OFFICERS = [
  { key: "anita", email: "anita.kumari@jalrakshak.in", name: "Anita Kumari", role: "district", district: "Dhanbad", block: null },
  { key: "rajesh", email: "rajesh.oraon@jalrakshak.in", name: "Rajesh Oraon", role: "block", district: "Bokaro", block: "Gomia" },
  { key: "mahto", email: "s.mahto@jalrakshak.in", name: "S. Mahto (Pollution Control Board)", role: "spcb", district: null, block: null },
  { key: "admin", email: "admin@jalrakshak.in", name: "Dashboard Admin", role: "admin", district: null, block: null },
];

function buildOfficerDependent(out, uids) {
  const who = (k) => ({ name: OFFICERS.find((o) => o.key === k).name, uid: uids[k] });
  const al = (id, unitId, type, severity, pattern, message, messageHi, hoursAgo, ack) => {
    const raisedAt = NOW - hoursAgo * HOUR;
    const a = ack ? { acknowledgedBy: who(ack[0]).name, acknowledgedByUid: who(ack[0]).uid, acknowledgedAt: raisedAt + ack[1] * HOUR } : { acknowledgedBy: null, acknowledgedByUid: null, acknowledgedAt: null };
    const escalated = !ack && hoursAgo > 24;
    out.alerts.push({ id, unitId, type, severity, pattern, message, messageHi, raisedAt, ...a, escalatedAt: escalated ? raisedAt + 24 * HOUR : null, autoBroadcast: escalated });
  };
  al("a01", "DHN-02", "turbidity-spike", "critical", "event", "Turbidity and conductivity jumped 2–3× within hours, downstream only, no rain recorded.", "गंदलापन और चालकता कुछ घंटों में 2–3 गुना बढ़ी, केवल निचली धारा में, वर्षा दर्ज नहीं।", 5, null);
  al("a02", "DHN-03", "neutral-ph-leachate", "warning", "trend", "Conductivity and hardness up about 35% over 10 weeks while pH is unchanged: coal leachate signature.", "10 सप्ताह में चालकता और कठोरता लगभग 35% बढ़ी जबकि पीएच अपरिवर्तित: कोयला रिसाव का संकेत।", 40, null);
  al("a03", "BKR-02", "chemical-exceedance", "warning", "trend", "Sulphate above 200 mg/L for the third consecutive test.", "सल्फेट लगातार तीसरी जाँच में 200 mg/L से ऊपर।", 20, null);
  al("a04", "ESB-01", "lab-overdue", "info", "trend", "No uranium lab result for 75 days. Unit cannot show green.", "75 दिन से यूरेनियम प्रयोगशाला परिणाम नहीं। यूनिट हरी नहीं दिखा सकती।", 72, ["mahto", 6]);
  al("a05", "SRK-01", "chemical-exceedance", "critical", "event", "Chromium (VI) 0.14 mg/L, nearly three times the 0.05 limit.", "क्रोमियम (VI) 0.14 mg/L, 0.05 सीमा से लगभग तीन गुना।", 30, null);
  al("a06", "GRD-02", "unit-offline", "warning", "event", "No uplink for 3 days.", "3 दिन से कोई अपलिंक नहीं।", 74, ["anita", 10]);
  al("a07", "RMG-01", "beyond-local-treatment", "critical", "event", "Third treatment cycle failed. Water is beyond local treatment; refer out.", "तीसरा उपचार चक्र विफल। जल स्थानीय उपचार से परे है; बाहर भेजें।", 8, null);
  al("a08", "CHT-01", "cartridge-exhausted", "warning", "trend", "Nitrate cartridge is past predicted life; nitrate breakthrough expected.", "नाइट्रेट कार्ट्रिज अनुमानित आयु पार कर चुका; नाइट्रेट ब्रेकथ्रू संभावित।", 26, ["rajesh", 30]);
  al("a09", "HZB-01", "microbial-risk", "warning", "event", "Estimated microbial risk 62% (40–80%). Turbidity probe fault limits confidence.", "अनुमानित सूक्ष्मजीव जोखिम 62% (40–80%)। टर्बिडिटी प्रोब खराबी से विश्वसनीयता घटी।", 2, null);
  al("a11", "DHN-04", "chemical-exceedance", "warning", "event", "Iron 1.00 mg/L in the raw chamber (limit 0.3). All other parameters within limits; treated water 0.12 mg/L passed re-test.", "कच्चे कक्ष में आयरन 1.00 mg/L (सीमा 0.3)। अन्य सभी मानक सीमा में; उपचारित जल 0.12 mg/L, पुनः जाँच में पास।", 3, null);
  al("a10", "WSB-01", "post-monsoon-leaching", "warning", "trend", "Iron and sulphate up after last monsoon; source inspection advised.", "पिछले मानसून के बाद आयरन और सल्फेट बढ़े; स्रोत निरीक्षण की सलाह।", 300, ["anita", 50]);
  // history, so response-time statistics have substance
  const types = ["turbidity-spike", "chemical-exceedance", "cartridge-exhausted", "unit-offline"];
  const units = UNITS.map((u) => u.id);
  const officersKeys = ["anita", "rajesh", "mahto"];
  const speed = { anita: [2, 10], rajesh: [6, 30], mahto: [20, 60] };
  for (let i = 0; i < 24; i++) {
    const k = officersKeys[i % 3];
    const [lo, hi] = speed[k];
    al(`h${i}`, pick(units), pick(types), pick(["warning", "info"]), i % 2 ? "event" : "trend", "Earlier alert, resolved.", "पिछला अलर्ट, निपटाया गया।", 100 + i * 24 * (2 + R() * 3), [k, lo + R() * (hi - lo)]);
  }

  // citizen reports
  const rep = (i, unitId, center, type, hoursAgo, ackBy, ackAfter, note) => {
    const reportedAt = NOW - hoursAgo * HOUR;
    const a = ackBy ? { acknowledgedBy: who(ackBy).name, acknowledgedByUid: who(ackBy).uid, acknowledgedAt: reportedAt + ackAfter * HOUR } : { acknowledgedBy: null, acknowledgedByUid: null, acknowledgedAt: null };
    out.reports.push({ id: `r${String(i).padStart(3, "0")}`, unitId, type, reportedAt, ...a, location: { lat: center.lat + (R() - 0.5) * 0.02, lng: center.lng + (R() - 0.5) * 0.02 }, note: note ?? "" });
  };
  const by = (u) => UNITS.find((x) => x.id === u);
  let n = 0;
  for (let i = 0; i < 12; i++) rep(n++, "DHN-02", by("DHN-02"), pick(["colour", "smell", "taste", "illness", "colour"]), 3 + R() * 400, i < 3 ? null : pick(["anita", "anita", "rajesh"]), 3 + R() * 40, i < 2 ? "Children with stomach pain" : "");
  for (let i = 0; i < 7; i++) rep(n++, "BKR-02", by("BKR-02"), pick(["taste", "colour", "smell"]), 6 + R() * 500, i < 2 ? null : pick(["rajesh", "anita"]), 8 + R() * 50);
  for (let i = 0; i < 5; i++) rep(n++, "SRK-01", by("SRK-01"), pick(["colour", "colour", "taste"]), 10 + R() * 300, i < 3 ? null : "mahto", 30 + R() * 30, "Yellow tint");
  for (let i = 0; i < 4; i++) rep(n++, "HZB-01", by("HZB-01"), pick(["smell", "illness"]), 1 + R() * 100, i === 0 ? null : "anita", 5 + R() * 20);
  for (const uid of ["DHN-03", "GRD-01", "CHT-01", "WSB-01", "ESB-02", "RMG-01", "PKR-01"]) rep(n++, uid, by(uid), pick(["taste", "smell", "colour"]), 5 + R() * 600, pick([null, "anita", "rajesh", "mahto"]), 4 + R() * 50);
  rep(n++, "RMG-01", by("RMG-01"), "illness", 9, null, 0, "Diarrhoea, several households");
}

/* ── write ── */
async function main() {
  const dry = args.has("--dry");
  const out = build();
  const summary = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length]));

  if (dry) {
    // Officer-dependent docs need uids; use placeholders for the dry run.
    const uids = { anita: "u1", rajesh: "u2", mahto: "u3", admin: "u4" };
    buildOfficerDependent(out, uids);
    console.log("Dry run, nothing written:", { ...summary, alerts: out.alerts.length, reports: out.reports.length });
    // The dump also feeds the Firebase-free demo build (src/demo), which needs mines, officers and the base time.
    const officers = OFFICERS.map((o) => ({ uid: uids[o.key], email: o.email, name: o.name, role: o.role, district: o.district, block: o.block }));
    if (args.has("--dump")) fs.writeFileSync(process.argv[process.argv.indexOf("--dump") + 1], JSON.stringify({ generatedAt: NOW, ...out, mineFeatures: MINES, officers }));
    return;
  }

  if (!args.has("--confirm")) {
    console.error("This writes demo data into your Firebase project. Re-run with --confirm (or --dry to preview).");
    process.exit(1);
  }
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 8) {
    console.error("Set SEED_PASSWORD (8+ characters): it becomes the password of the demo officer accounts.");
    process.exit(1);
  }
  const emulated = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  if (!emulated && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error("Set GOOGLE_APPLICATION_CREDENTIALS to the path of a Firebase service-account JSON file.");
    process.exit(1);
  }

  const { initializeApp, applicationDefault } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const { getAuth } = await import("firebase-admin/auth");
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  initializeApp({ ...(emulated ? {} : { credential: applicationDefault() }), ...(projectId ? { projectId } : {}) });
  const db = getFirestore();
  db.settings({ ignoreUndefinedProperties: true });
  const auth = getAuth();
  console.log(emulated ? `Seeding the LOCAL EMULATOR (${process.env.FIRESTORE_EMULATOR_HOST})` : `Seeding project: ${projectId ?? "(from credentials)"}`);

  const uids = {};
  for (const o of OFFICERS) {
    let user;
    try {
      user = await auth.getUserByEmail(o.email);
      await auth.updateUser(user.uid, { password, displayName: o.name });
    } catch {
      user = await auth.createUser({ email: o.email, password, displayName: o.name });
    }
    uids[o.key] = user.uid;
  }
  buildOfficerDependent(out, uids);

  const writer = db.bulkWriter();
  writer.onWriteError((err) => {
    console.error("write failed:", err.documentRef.path, err.message);
    return err.failedAttempts < 3;
  });
  const set = (ref, data) => writer.set(ref, data);
  const strip = ({ id, ...rest }) => rest;

  for (const u of out.units) set(db.collection("units").doc(u.id), strip(u));
  for (const r of out.readings) set(db.collection("units").doc(r.unitId).collection("readings").doc(r.id), strip(r));
  for (const c of out.chem) set(db.collection("units").doc(c.unitId).collection("chemTests").doc(c.id), strip(c));
  for (const m of out.maintenance) set(db.collection("units").doc(m.unitId).collection("maintenance").doc(m.id), strip(m));
  for (const m of MINES) set(db.collection("mineFeatures").doc(m.id), strip(m));
  for (const e of out.mineEvents) set(db.collection("mineEvents").doc(e.id), strip(e));
  for (const f of out.fieldTests) set(db.collection("fieldTests").doc(f.id), strip(f));
  for (const a of out.alerts) set(db.collection("alerts").doc(a.id), strip(a));
  for (const r of out.reports) set(db.collection("citizenReports").doc(r.id), strip(r));
  for (const c of out.cartridges) set(db.collection("cartridges").doc(c.id), strip(c));
  for (const o of OFFICERS) set(db.collection("officers").doc(uids[o.key]), { name: o.name, role: o.role, district: o.district, block: o.block });

  await writer.close();
  console.log("Done.", { ...summary, alerts: out.alerts.length, reports: out.reports.length, mines: MINES.length });
  console.log("Demo officer logins (password = SEED_PASSWORD):");
  for (const o of OFFICERS) console.log(`  ${o.email}  (${o.role})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
