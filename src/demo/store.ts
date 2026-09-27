/**
 * In-memory stand-in for Firestore, used only by the demo build (see
 * next.config.ts). Data comes from public/data/fleet.json, produced by
 * `npm run demo-data` from the same generator as `npm run seed`.
 *
 * Timestamps in the dump are shifted so the newest data is always "now",
 * whenever the page is opened. Writes made in the dashboard are kept in this
 * browser's localStorage so they survive a reload; nothing leaves the browser.
 */

import { GENESIS, entryHash } from "@/lib/auditHash";
import type { AuditEntry } from "@/lib/types";

export type Doc = Record<string, unknown>;
type Listener = () => void;

type DemoOfficer = { uid: string; email: string; name: string; role: string; district: string | null; block: string | null };
type Dump = {
  generatedAt: number;
  units: Doc[];
  readings: Doc[];
  chem: Doc[];
  maintenance: Doc[];
  fieldTests: Doc[];
  alerts: Doc[];
  reports: Doc[];
  cartridges: Doc[];
  mineEvents: Doc[];
  mineFeatures: Doc[];
  officers: DemoOfficer[];
};

export type WriteOp = { path: string; mode: "set" | "update"; data: Doc };

export const DEMO_PASSWORD = "Jal@2026";

const TIME_KEYS = new Set([
  "lastSeen", "at", "timestamp", "collectedDate", "resultDate", "raisedAt",
  "escalatedAt", "acknowledgedAt", "reportedAt", "installedDate", "removedDate",
]);
const JOURNAL_KEY = "jalrakshak-writes";

/** collection path → (doc id → data) */
const collections = new Map<string, Map<string, Doc>>();
const listeners = new Map<string, Set<Listener>>();
let users: DemoOfficer[] = [];
let ready: Promise<void> | null = null;

function shift(value: unknown, delta: number, key = ""): unknown {
  if (typeof value === "number") return TIME_KEYS.has(key) ? value + delta : value;
  if (Array.isArray(value)) return value.map((v) => shift(v, delta, key));
  if (value && typeof value === "object") {
    const out: Doc = {};
    for (const [k, v] of Object.entries(value)) out[k] = shift(v, delta, k);
    return out;
  }
  return value;
}

function coll(path: string): Map<string, Doc> {
  let c = collections.get(path);
  if (!c) collections.set(path, (c = new Map()));
  return c;
}

function put(path: string, id: string, data: Doc) {
  const { id: _drop, ...rest } = data;
  void _drop;
  coll(path).set(id, rest);
}

function applyOp(op: WriteOp) {
  const i = op.path.lastIndexOf("/");
  const c = coll(op.path.slice(0, i));
  const id = op.path.slice(i + 1);
  c.set(id, op.mode === "update" ? { ...(c.get(id) ?? {}), ...op.data } : { ...op.data });
}

function readJournal(): WriteOp[] {
  try {
    return JSON.parse(localStorage.getItem(JOURNAL_KEY) ?? "[]") as WriteOp[];
  } catch {
    return [];
  }
}

export function load(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    const res = await fetch("/data/fleet.json");
    if (!res.ok) throw new Error(`Could not load demo data (${res.status})`);
    const raw = (await res.json()) as Dump;
    const d = shift(raw, Date.now() - raw.generatedAt) as Dump;

    for (const u of d.units) put("units", u.id as string, u);
    for (const r of d.readings) put(`units/${r.unitId}/readings`, r.id as string, r);
    for (const c of d.chem) put(`units/${c.unitId}/chemTests`, c.id as string, c);
    for (const m of d.maintenance) put(`units/${m.unitId}/maintenance`, m.id as string, m);
    for (const f of d.fieldTests) put("fieldTests", f.id as string, f);
    for (const a of d.alerts) put("alerts", a.id as string, a);
    for (const r of d.reports) put("citizenReports", r.id as string, r);
    for (const c of d.cartridges) put("cartridges", c.id as string, c);
    for (const e of d.mineEvents) put("mineEvents", e.id as string, e);
    for (const m of d.mineFeatures) put("mineFeatures", m.id as string, m);
    for (const o of d.officers) put("officers", o.uid, { name: o.name, role: o.role, district: o.district, block: o.block });
    users = d.officers;

    // Past officer actions, then this browser's own actions re-linked on top,
    // so the chain always verifies even though timestamps move with "now".
    const journal = readJournal();
    const isAudit = (op: WriteOp) => op.path.startsWith("auditLog/") || op.path === "auditMeta/head";
    for (const op of journal) if (!isAudit(op)) applyOp(op);
    const own = journal.filter((op) => op.path.startsWith("auditLog/")).map((op) => op.data as unknown as AuditEntry);
    let head = { seq: 0, hash: GENESIS };
    for (const e of [...history(d), ...own]) {
      const base = { seq: head.seq + 1, at: e.at, officerUid: e.officerUid, officerName: e.officerName, action: e.action, target: e.target, details: e.details, prevHash: head.hash };
      const entry: AuditEntry = { ...base, hash: await entryHash(base) };
      coll("auditLog").set(String(entry.seq).padStart(10, "0"), entry);
      head = { seq: entry.seq, hash: entry.hash };
    }
    coll("auditMeta").set("head", head);
  })();
  return ready;
}

type Past = Pick<AuditEntry, "at" | "officerUid" | "officerName" | "action" | "target" | "details">;

/** A short audit trail of recent officer actions, consistent with the records they touched. */
function history(d: Dump): Past[] {
  const now = Date.now();
  const as = (uid: string) => ({ officerUid: uid, officerName: (d.officers.find((o) => o.uid === uid) ?? d.officers[0]).name });
  const out: Past[] = [];

  const maint = d.maintenance.find((m) => m.unitId === "DHN-04");
  if (maint) out.push({ at: maint.timestamp as number, ...as("u2"), action: "maintenance.log", target: `units/DHN-04/maintenance/${maint.id}`, details: { unitId: "DHN-04", kind: maint.kind, note: maint.note } });

  const lab = d.fieldTests.find((f) => f.id === "DHN-04-U1");
  if (lab) out.push({ at: lab.resultDate as number, ...as("u3"), action: "fieldTest.result", target: `fieldTests/${lab.id}`, details: { unitId: "DHN-04", sampleId: lab.sampleId, type: lab.type, result: lab.result, value: lab.value } });

  const alert = d.alerts.find((a) => a.id === "a06");
  if (alert?.acknowledgedAt) out.push({ at: alert.acknowledgedAt as number, ...as(alert.acknowledgedByUid as string), action: "alert.acknowledge", target: "alerts/a06", details: { unitId: alert.unitId, type: alert.type, raisedAt: alert.raisedAt, responseMs: (alert.acknowledgedAt as number) - (alert.raisedAt as number) } });

  out.push({ at: now - 2 * 86400000, ...as("u4"), action: "export.audit-json", target: "export", details: { format: "json" } });

  return out.filter((e) => e.at <= now).sort((a, b) => a.at - b.at);
}

export async function demoUsers(): Promise<DemoOfficer[]> {
  await load();
  return users;
}

export function getCollection(path: string): [string, Doc][] {
  return [...coll(path).entries()];
}

export function getDocument(path: string): Doc | undefined {
  const i = path.lastIndexOf("/");
  return collections.get(path.slice(0, i))?.get(path.slice(i + 1));
}

/** Applies writes atomically, records them for reloads, and notifies listeners. */
export function commit(ops: WriteOp[]) {
  for (const op of ops) applyOp(op);
  try {
    localStorage.setItem(JOURNAL_KEY, JSON.stringify([...readJournal(), ...ops]));
  } catch {
    // Private mode or storage full: the change still holds until reload.
  }
  const touched = new Set(ops.map((op) => op.path.slice(0, op.path.lastIndexOf("/"))));
  for (const path of touched) listeners.get(path)?.forEach((l) => l());
}

export function listen(path: string, fn: Listener): () => void {
  let set = listeners.get(path);
  if (!set) listeners.set(path, (set = new Set()));
  set.add(fn);
  return () => set.delete(fn);
}
