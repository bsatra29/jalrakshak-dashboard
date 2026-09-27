import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  type DocumentReference,
} from "firebase/firestore";
import { GENESIS, canonical, entryHash } from "./auditHash";
import { getDb } from "./firebase";
import type { AuditEntry, Officer } from "./types";

/**
 * The audit log is a hash chain. Every entry carries the hash of the one
 * before it, so removing or editing any past entry breaks every hash after
 * it, and the Audit screen can prove the chain is intact. Firestore rules
 * additionally refuse update and delete on `auditLog`.
 *
 * The audit entry is written in the SAME transaction as the action it
 * records, so an acknowledgement cannot exist without its log line.
 */

export { GENESIS, canonical, entryHash };

export type Write = { ref: DocumentReference; data: Record<string, unknown>; mode: "set" | "update" };

const pad = (n: number) => String(n).padStart(10, "0");

export async function audited(
  officer: Officer,
  action: string,
  target: string,
  details: Record<string, unknown>,
  writes: Write[] = [],
): Promise<AuditEntry> {
  const db = getDb();
  const headRef = doc(db, "auditMeta", "head");
  const clean = JSON.parse(JSON.stringify(details)) as Record<string, unknown>;

  return runTransaction(db, async (tx) => {
    const head = await tx.get(headRef);
    const prev = head.exists() ? (head.data() as { seq: number; hash: string }) : { seq: 0, hash: GENESIS };
    const base = {
      seq: prev.seq + 1,
      at: Date.now(),
      officerUid: officer.uid,
      officerName: officer.name,
      action,
      target,
      details: clean,
      prevHash: prev.hash,
    };
    const entry: AuditEntry = { ...base, hash: await entryHash(base) };

    for (const w of writes) {
      if (w.mode === "update") tx.update(w.ref, w.data);
      else tx.set(w.ref, w.data);
    }
    tx.set(doc(db, "auditLog", pad(entry.seq)), entry);
    tx.set(headRef, { seq: entry.seq, hash: entry.hash });
    return entry;
  });
}

export type ChainCheck = { ok: boolean; checked: number; brokenAtSeq: number | null; reason?: string; headHash: string };

export function verifyChain(entries: AuditEntry[]): Promise<ChainCheck> {
  return (async () => {
    let prevHash = GENESIS;
    let prevSeq = 0;
    for (const e of entries) {
      if (e.seq !== prevSeq + 1) return { ok: false, checked: prevSeq, brokenAtSeq: e.seq, reason: "Missing entry before this one", headHash: prevHash };
      if (e.prevHash !== prevHash) return { ok: false, checked: prevSeq, brokenAtSeq: e.seq, reason: "Link to previous entry does not match", headHash: prevHash };
      const { hash, ...rest } = e;
      if ((await entryHash(rest)) !== hash) return { ok: false, checked: prevSeq, brokenAtSeq: e.seq, reason: "Entry contents do not match its hash", headHash: prevHash };
      prevHash = hash;
      prevSeq = e.seq;
    }
    return { ok: true, checked: prevSeq, brokenAtSeq: null, headHash: prevHash };
  })();
}

export async function loadFullChain(): Promise<AuditEntry[]> {
  const snap = await getDocs(query(collection(getDb(), "auditLog"), orderBy("seq", "asc")));
  return snap.docs.map((d) => d.data() as AuditEntry);
}
