/**
 * Firestore data model for JalRakshak. All timestamps are epoch milliseconds
 * (numbers), never Firestore Timestamp objects, so a document reads the same
 * on the dashboard, in the seed script and in an audit export.
 */

export type Status = "green" | "amber" | "red" | "blue" | "grey";
export type Tier = "MEASURED" | "ESTIMATED" | "UNVERIFIABLE";
export type MineType = "coal" | "uranium" | "chromite" | "iron ore" | "quarry" | "none";
export type WaterClass = "A" | "B" | "C" | "D" | "E";
export type TapPoint = "raw" | "sediment" | "carbon" | "media" | "final";

export type SensorParam =
  | "pH"
  | "turbidity"
  | "tds"
  | "ec"
  | "temperature"
  | "orp"
  | "flow"
  | "waterLevel"
  | "pressureDrop";
export type ChemParam =
  | "iron"
  | "fluoride"
  | "nitrate"
  | "hardness"
  | "sulphate"
  | "chromium6"
  | "freeChlorine";
export type ParamId = SensorParam | ChemParam;

export type LatestValue = { value: number; tier: Tier; at: number };

export type MineProfile = {
  type: MineType;
  /** Distance to the nearest pit or tailing pond, metres. */
  distanceM: number;
  position: "upstream" | "downstream" | "none";
  sourceType: "groundwater" | "surface";
};

export type Unit = {
  id: string;
  name: string;
  village: string;
  block: string;
  district: string;
  lat: number;
  lng: number;
  /** Status the unit itself reported. The dashboard may downgrade it, never upgrade it. */
  status: Status;
  mineProfile: MineProfile;
  currentClass: WaterClass | null;
  fittedCartridge: string | null;
  cycleCount: number;
  lastSeen: number;

  // Additions beyond the CONTEXT.md sketch, all written by the unit's sync job.
  populationServed: number;
  infantsUnder2: number;
  childrenUnder12: number;
  /** Litres delivered per day, for consumables forecasting. */
  dailyLitres: number;
  /** Units on one stream share a streamId; the downstream unit names the mine between them. */
  streamId?: string | null;
  mineBetweenId?: string | null;
  nearestMineId?: string | null;
  /** Fault codes the unit reports about itself, e.g. "turbidity-probe". */
  openFaults?: string[];
  /** Latest raw-source values, denormalised so the map never has to page readings. */
  latest: Partial<Record<ParamId, LatestValue>>;
  estimates?: {
    microbialRisk?: { p: number; lo: number; hi: number; at: number };
  };
};

export type Reading = {
  id?: string;
  unitId: string;
  timestamp: number;
  tapPoint: TapPoint;
  pH: number | null;
  turbidity: number | null;
  tds: number | null;
  ec: number | null;
  temperature: number | null;
  orp: number | null;
  flow: number | null;
  /** Monitoring-tank level, % of capacity. */
  waterLevel?: number | null;
  pressureDrop: number | null;
  rainfallMm?: number | null;
  confidenceTier: Tier;
};

export type ChemTest = {
  id?: string;
  unitId: string;
  timestamp: number;
  parameter: ChemParam;
  value: number;
  method: string;
  /** Defaults to "raw" when absent. */
  tapPoint?: TapPoint;
  confidenceTier: Tier;
};

export type FieldTestType = "uranium" | "arsenic" | "bacterial";

export type FieldTest = {
  id: string;
  unitId: string;
  sampleId: string;
  type: FieldTestType;
  gps: { lat: number; lng: number };
  collectedDate: number;
  status: "pending" | "resulted";
  result: "pass" | "fail" | null;
  /** Numeric lab value where one exists (µg/L for uranium/arsenic, CFU/100 mL for bacteria). */
  value: number | null;
  resultDate: number | null;
  enteredBy?: string | null;
  notes?: string;
};

export type AlertType =
  | "turbidity-spike"
  | "neutral-ph-leachate"
  | "post-monsoon-leaching"
  | "chemical-exceedance"
  | "cartridge-exhausted"
  | "beyond-local-treatment"
  | "unit-offline"
  | "lab-overdue"
  | "microbial-risk";

export type Alert = {
  id: string;
  unitId: string;
  type: AlertType;
  severity: "info" | "warning" | "critical";
  /** A sudden spike is an event; slow drift is a trend. They are handled differently. */
  pattern: "event" | "trend";
  message: string;
  messageHi?: string;
  raisedAt: number;
  acknowledgedBy: string | null;
  acknowledgedByUid: string | null;
  acknowledgedAt: number | null;
  escalatedAt: number | null;
  autoBroadcast: boolean;
};

export type ReportType = "smell" | "taste" | "colour" | "illness";

export type CitizenReport = {
  id: string;
  unitId: string;
  type: ReportType;
  reportedAt: number;
  acknowledgedAt: number | null;
  acknowledgedBy: string | null;
  acknowledgedByUid: string | null;
  location: { lat: number; lng: number };
  note?: string;
};

export type Cartridge = {
  id: string;
  unitId: string;
  slot: number;
  mediaType: string;
  installedDate: number;
  litresProcessed: number;
  predictedLifeLitres: number;
  dpStartKpa: number;
  dpNowKpa: number;
  dpLimitKpa: number;
  status: "active" | "spent" | "replaced";
  removedDate?: number | null;
  /** Spent media can hold uranium or chromium and must not go in an ordinary skip. */
  hazardous?: boolean;
  disposal?: "awaiting-collection" | "collected" | "disposed" | null;
};

export type MineFeatureType = "colliery" | "tailingPond" | "washery" | "dump";

export type MineFeature = {
  id: string;
  name: string;
  type: MineFeatureType;
  operator: string;
  lat: number;
  lng: number;
};

export type MineEvent = {
  id: string;
  mineId: string;
  type: "blasting" | "discharge" | "overflow" | "dump-slide";
  timestamp: number;
  note?: string;
};

export type MaintenanceEntry = {
  id: string;
  unitId: string;
  timestamp: number;
  kind: "cartridge-swap" | "sensor-service" | "cleaning" | "repair" | "inspection";
  note: string;
  officerName: string;
};

export type Officer = {
  uid: string;
  name: string;
  role: "district" | "block" | "spcb" | "admin";
  district?: string | null;
  block?: string | null;
};

export type AuditEntry = {
  seq: number;
  at: number;
  officerUid: string;
  officerName: string;
  action: string;
  target: string;
  details: Record<string, unknown>;
  prevHash: string;
  hash: string;
};
