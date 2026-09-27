"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Lang } from "@/lib/format";
import { HI } from "@/lib/i18n";

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (text: string, vars?: Record<string, string | number>) => string };

const LangContext = createContext<Ctx>({ lang: "en", setLang: () => {}, t: (s) => s });

const KEY = "jalrakshak.lang";

/**
 * Translation is keyed by the English string itself, so an untranslated
 * string simply shows in English instead of a missing-key marker. `{name}`
 * placeholders are filled from `vars`.
 */
export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      // Read after hydration on purpose: reading it during render would mismatch the server HTML.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === "hi" || saved === "en") setLangState(saved);
    } catch {
      /* storage blocked */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (text: string, vars?: Record<string, string | number>) => {
      let s = lang === "hi" ? (HI[text] ?? text) : text;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
      return s;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);
export const useT = () => useContext(LangContext).t;
