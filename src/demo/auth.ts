/* eslint-disable @typescript-eslint/no-unused-vars -- signatures mirror the Firebase SDK */
/**
 * Demo build replacement for "firebase/auth" (aliased in next.config.ts).
 * The demo officer accounts all use DEMO_PASSWORD.
 */
import { DEMO_PASSWORD, demoUsers } from "./store";

export type Auth = { kind: "local-auth" };
export type User = { uid: string; email: string; displayName: string };

const SESSION_KEY = "jalrakshak-session";
const AUTH: Auth = { kind: "local-auth" };
const subs = new Set<(u: User | null) => void>();
let current: User | null | undefined;

function readSession(): User | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null") as User | null;
  } catch {
    return null;
  }
}

function setUser(u: User | null) {
  current = u;
  try {
    if (u) localStorage.setItem(SESSION_KEY, JSON.stringify(u));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage unavailable: the session lasts until reload.
  }
  subs.forEach((fn) => fn(u));
}

export const getAuth = (..._args: unknown[]): Auth => AUTH;
export const connectAuthEmulator = (..._args: unknown[]) => {};

export function onAuthStateChanged(_auth: Auth, fn: (u: User | null) => void): () => void {
  subs.add(fn);
  if (current === undefined) current = readSession();
  const u = current;
  queueMicrotask(() => subs.has(fn) && fn(u));
  return () => subs.delete(fn);
}

export async function signInWithEmailAndPassword(_auth: Auth, email: string, password: string) {
  const found = (await demoUsers()).find((o) => o.email.toLowerCase() === email.toLowerCase());
  if (!found || password !== DEMO_PASSWORD) throw Object.assign(new Error("Invalid credentials"), { code: "auth/invalid-credential" });
  const user: User = { uid: found.uid, email: found.email, displayName: found.name };
  setUser(user);
  return { user };
}

export async function signOut(_auth: Auth) {
  setUser(null);
}
