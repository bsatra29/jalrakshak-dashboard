"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { firebaseConfigured, getDb, getFirebaseAuth } from "@/lib/firebase";
import type { Officer } from "@/lib/types";

type Status = "loading" | "signedOut" | "noProfile" | "ready" | "unconfigured";

type Ctx = {
  status: Status;
  officer: Officer | null;
  email: string | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(firebaseConfigured ? "loading" : "unconfigured");
  const [officer, setOfficer] = useState<Officer | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseConfigured) return;
    return onAuthStateChanged(getFirebaseAuth(), async (user) => {
      if (!user) {
        setOfficer(null);
        setEmail(null);
        setStatus("signedOut");
        return;
      }
      setEmail(user.email);
      try {
        // Being able to sign in is not enough: only accounts with an
        // officers/{uid} profile are government users.
        const snap = await getDoc(doc(getDb(), "officers", user.uid));
        if (snap.exists()) {
          setOfficer({ ...(snap.data() as Omit<Officer, "uid">), uid: user.uid });
          setStatus("ready");
        } else {
          setOfficer(null);
          setStatus("noProfile");
        }
      } catch {
        setOfficer(null);
        setStatus("noProfile");
      }
    });
  }, []);

  const signIn = useCallback(async (mail: string, password: string) => {
    try {
      await signInWithEmailAndPassword(getFirebaseAuth(), mail.trim(), password);
      return null;
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      if (code === "auth/network-request-failed") return "No network. Check your connection and try again.";
      if (code === "auth/too-many-requests") return "Too many attempts. Wait a few minutes and try again.";
      return "Email or password is incorrect.";
    }
  }, []);

  const signOut = useCallback(async () => {
    await fbSignOut(getFirebaseAuth());
  }, []);

  const value = useMemo(() => ({ status, officer, email, signIn, signOut }), [status, officer, email, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Ctx {
  const c = useContext(AuthContext);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}

/** The signed-in officer. Only callable below AuthGate, where one is guaranteed. */
export function useOfficer(): Officer {
  const { officer } = useAuth();
  if (!officer) throw new Error("useOfficer outside AuthGate");
  return officer;
}
