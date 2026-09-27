import { sha256Hex } from "./format";
import type { AuditEntry } from "./types";

/** Hashing for the audit chain. Kept free of Firestore imports so any data layer can build a valid chain. */

export const GENESIS = "GENESIS";

/** JSON with sorted keys. Firestore does not preserve map key order, so hashes must not depend on it. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(",")}}`;
}

export function entryHash(e: Omit<AuditEntry, "hash">): Promise<string> {
  return sha256Hex(canonical([e.prevHash, e.seq, e.at, e.officerUid, e.action, e.target, e.details]));
}
