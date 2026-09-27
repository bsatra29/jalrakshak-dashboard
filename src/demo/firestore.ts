/* eslint-disable @typescript-eslint/no-unused-vars -- signatures mirror the Firebase SDK */
/**
 * Demo build replacement for "firebase/firestore" (aliased in next.config.ts).
 * Implements only the calls the dashboard makes, backed by ./store.
 */
import { commit, getCollection, getDocument, listen, load, type Doc, type WriteOp } from "./store";

export type Firestore = { kind: "local-db" };
export type CollectionReference = { type: "collection"; path: string; id: string };
export type DocumentReference = { type: "document"; path: string; id: string };
type Constraint = { kind: "orderBy"; field: string; dir: "asc" | "desc" } | { kind: "limit"; n: number };
export type Query = { type: "query"; path: string; constraints: Constraint[] };

type DocSnap = { id: string; exists: () => boolean; data: () => Doc | undefined };
type QuerySnap = { docs: { id: string; data: () => Doc }[]; size: number; empty: boolean };

const DB: Firestore = { kind: "local-db" };

export const initializeFirestore = (..._args: unknown[]): Firestore => DB;
export const getFirestore = (..._args: unknown[]): Firestore => DB;
export const persistentLocalCache = (..._args: unknown[]) => ({});
export const persistentMultipleTabManager = (..._args: unknown[]) => ({});
export const connectFirestoreEmulator = (..._args: unknown[]) => {};

type Parent = Firestore | CollectionReference | DocumentReference;
const basePath = (p: Parent) => ("path" in p ? p.path : "");
const join = (p: Parent, segs: string[]) => [basePath(p), ...segs].filter(Boolean).join("/");
const lastSeg = (path: string) => path.slice(path.lastIndexOf("/") + 1);

function autoId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 20; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function collection(parent: Parent, ...segs: string[]): CollectionReference {
  const path = join(parent, segs);
  return { type: "collection", path, id: lastSeg(path) };
}

export function doc(parent: Parent, ...segs: string[]): DocumentReference {
  const path = parent && "type" in parent && parent.type === "collection" && segs.length === 0 ? `${parent.path}/${autoId()}` : join(parent, segs);
  return { type: "document", path, id: lastSeg(path) };
}

export const orderBy = (field: string, dir: "asc" | "desc" = "asc"): Constraint => ({ kind: "orderBy", field, dir });
export const limit = (n: number): Constraint => ({ kind: "limit", n });

export function query(ref: CollectionReference | Query, ...constraints: Constraint[]): Query {
  const prev = ref.type === "query" ? ref.constraints : [];
  return { type: "query", path: ref.path, constraints: [...prev, ...constraints] };
}

const clone = <T,>(v: T): T => structuredClone(v);

function run(q: CollectionReference | Query): QuerySnap {
  let rows = getCollection(q.path);
  const cs = q.type === "query" ? q.constraints : [];
  for (const c of cs) {
    if (c.kind === "orderBy") {
      const s = c.dir === "desc" ? -1 : 1;
      rows = [...rows].sort(([, a], [, b]) => {
        const x = a[c.field] as number | string;
        const y = b[c.field] as number | string;
        return x < y ? -s : x > y ? s : 0;
      });
    } else rows = rows.slice(0, c.n);
  }
  const docs = rows.map(([id, d]) => ({ id, data: () => clone(d) }));
  return { docs, size: docs.length, empty: docs.length === 0 };
}

function docSnap(ref: DocumentReference): DocSnap {
  const d = getDocument(ref.path);
  return { id: ref.id, exists: () => d !== undefined, data: () => (d ? clone(d) : undefined) };
}

export async function getDocs(q: CollectionReference | Query): Promise<QuerySnap> {
  await load();
  return run(q);
}

export async function getDoc(ref: DocumentReference): Promise<DocSnap> {
  await load();
  return docSnap(ref);
}

export function onSnapshot(q: CollectionReference | Query, next: (s: QuerySnap) => void, error?: (e: Error) => void): () => void {
  let active = true;
  let off = () => {};
  load().then(
    () => {
      if (!active) return;
      next(run(q));
      off = listen(q.path, () => active && next(run(q)));
    },
    (e: Error) => active && error?.(e),
  );
  return () => {
    active = false;
    off();
  };
}

type Tx = {
  get: (ref: DocumentReference) => Promise<DocSnap>;
  set: (ref: DocumentReference, data: Doc) => Tx;
  update: (ref: DocumentReference, data: Doc) => Tx;
};

export async function runTransaction<T>(_db: Firestore, fn: (tx: Tx) => Promise<T>): Promise<T> {
  await load();
  const ops: WriteOp[] = [];
  const tx: Tx = {
    get: async (ref) => docSnap(ref),
    set: (ref, data) => (ops.push({ path: ref.path, mode: "set", data: clone(data) }), tx),
    update: (ref, data) => (ops.push({ path: ref.path, mode: "update", data: clone(data) }), tx),
  };
  const result = await fn(tx);
  commit(ops);
  return result;
}
