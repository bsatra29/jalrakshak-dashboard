"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { collection, getDocs, limit, onSnapshot, orderBy, query, type Query } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { effectiveStatus, verificationOf, type StatusReason, type Verification } from "@/lib/analysis";
import type {
  Alert,
  Cartridge,
  ChemTest,
  CitizenReport,
  FieldTest,
  MineEvent,
  MineFeature,
  Officer,
  Reading,
  Status,
  Unit,
} from "@/lib/types";

export type UnitState = { unit: Unit; status: Status; reason: StatusReason; ver: Verification };

type History = {
  state: "idle" | "loading" | "ready" | "error";
  readings: Record<string, Reading[]>;
  chem: Record<string, ChemTest[]>;
};

type Ctx = {
  now: number;
  loading: boolean;
  error: string | null;
  units: Unit[];
  unitStates: Record<string, UnitState>;
  alerts: Alert[];
  fieldTests: FieldTest[];
  reports: CitizenReport[];
  cartridges: Cartridge[];
  mines: MineFeature[];
  mineEvents: MineEvent[];
  officers: Officer[];
  history: History;
  /** Loads per-unit reading and chem-test history once; safe to call from any page. */
  loadHistory: () => void;
};

const DataContext = createContext<Ctx | null>(null);

function useLive<T>(
  build: () => Query,
  map: (id: string, data: Record<string, unknown>) => T,
  onError: (msg: string) => void,
): { rows: T[]; ready: boolean } {
  const [rows, setRows] = useState<T[]>([]);
  const [ready, setReady] = useState(false);
  const mapRef = useRef(map);
  const errRef = useRef(onError);
  useEffect(() => {
    mapRef.current = map;
    errRef.current = onError;
  });
  useEffect(() => {
    return onSnapshot(
      build(),
      (snap) => {
        setRows(snap.docs.map((d) => mapRef.current(d.id, d.data())));
        setReady(true);
      },
      (err) => {
        errRef.current(err.message);
        setReady(true);
      },
    );
    // build() closes over stable module-level helpers only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { rows, ready };
}

const withId = <T,>(id: string, d: Record<string, unknown>) => ({ ...d, id }) as T;

export function DataProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<History>({ state: "idle", readings: {}, chem: {} });
  const historyStarted = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const onError = useCallback((m: string) => setError(m), []);

  const u = useLive<Unit>(() => query(collection(getDb(), "units")), (id, d) => withId<Unit>(id, d), onError);
  const a = useLive<Alert>(() => query(collection(getDb(), "alerts"), orderBy("raisedAt", "desc"), limit(500)), (id, d) => withId<Alert>(id, d), onError);
  const f = useLive<FieldTest>(() => query(collection(getDb(), "fieldTests"), orderBy("collectedDate", "desc"), limit(1000)), (id, d) => withId<FieldTest>(id, d), onError);
  const r = useLive<CitizenReport>(() => query(collection(getDb(), "citizenReports"), orderBy("reportedAt", "desc"), limit(1000)), (id, d) => withId<CitizenReport>(id, d), onError);
  const c = useLive<Cartridge>(() => query(collection(getDb(), "cartridges")), (id, d) => withId<Cartridge>(id, d), onError);
  const m = useLive<MineFeature>(() => query(collection(getDb(), "mineFeatures")), (id, d) => withId<MineFeature>(id, d), onError);
  const e = useLive<MineEvent>(() => query(collection(getDb(), "mineEvents"), orderBy("timestamp", "desc"), limit(500)), (id, d) => withId<MineEvent>(id, d), onError);
  const o = useLive<Officer>(() => query(collection(getDb(), "officers")), (id, d) => ({ ...(d as Omit<Officer, "uid">), uid: id }), onError);

  const unitStates = useMemo(() => {
    const out: Record<string, UnitState> = {};
    for (const unit of u.rows) {
      const ver = verificationOf(unit.id, f.rows, now);
      const { status, reason } = effectiveStatus(unit, ver, now);
      out[unit.id] = { unit, status, reason, ver };
    }
    return out;
  }, [u.rows, f.rows, now]);

  const unitIds = useMemo(() => u.rows.map((x) => x.id).join(","), [u.rows]);

  const loadHistory = useCallback(() => {
    if (historyStarted.current || !unitIds) return;
    historyStarted.current = true;
    setHistory((h) => ({ ...h, state: "loading" }));
    const db = getDb();
    Promise.all(
      unitIds.split(",").map(async (id) => {
        const [rs, cs] = await Promise.all([
          getDocs(query(collection(db, "units", id, "readings"), orderBy("timestamp", "desc"), limit(300))),
          getDocs(query(collection(db, "units", id, "chemTests"), orderBy("timestamp", "desc"), limit(200))),
        ]);
        return {
          id,
          readings: rs.docs.map((d) => ({ ...(d.data() as Reading), id: d.id })).reverse(),
          chem: cs.docs.map((d) => ({ ...(d.data() as ChemTest), id: d.id })).reverse(),
        };
      }),
    )
      .then((all) => {
        const readings: Record<string, Reading[]> = {};
        const chem: Record<string, ChemTest[]> = {};
        for (const x of all) {
          readings[x.id] = x.readings;
          chem[x.id] = x.chem;
        }
        setHistory({ state: "ready", readings, chem });
      })
      .catch((err: Error) => {
        historyStarted.current = false;
        setError(err.message);
        setHistory((h) => ({ ...h, state: "error" }));
      });
  }, [unitIds]);

  const loading = !(u.ready && a.ready && f.ready && r.ready && c.ready && m.ready && e.ready && o.ready);

  const value = useMemo<Ctx>(
    () => ({
      now,
      loading,
      error,
      units: u.rows,
      unitStates,
      alerts: a.rows,
      fieldTests: f.rows,
      reports: r.rows,
      cartridges: c.rows,
      mines: m.rows,
      mineEvents: e.rows,
      officers: o.rows,
      history,
      loadHistory,
    }),
    [now, loading, error, u.rows, unitStates, a.rows, f.rows, r.rows, c.rows, m.rows, e.rows, o.rows, history, loadHistory],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): Ctx {
  const c = useContext(DataContext);
  if (!c) throw new Error("useData outside DataProvider");
  return c;
}

/** Page hook: ensures fleet history is loading and returns it. */
export function useFleetHistory() {
  const { history, loadHistory } = useData();
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);
  return history;
}
