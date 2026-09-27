"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AuthProvider, useAuth } from "@/context/AuthProvider";
import { DataProvider, useData } from "@/context/DataProvider";
import { LangProvider, useLang } from "@/context/LangProvider";
import { Notice } from "./ui";

const NAV: { href: string; label: string; icon: string }[] = [
  { href: "/", label: "Live Map", icon: "M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" },
  { href: "/accountability", label: "Mine Accountability", icon: "M4 20V10l5 3V8l5 3V5l6 4v11zM4 20h16" },
  { href: "/seasonal", label: "Seasonal & Trend", icon: "M3 17l5-6 4 3 5-8 4 5M3 21h18" },
  { href: "/operations", label: "Operations", icon: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" },
  { href: "/lab", label: "Lab Referral Queue", icon: "M9 3h6M10 3v6L5 19a1.5 1.5 0 0 0 1.3 2h11.4A1.5 1.5 0 0 0 19 19l-5-10V3" },
  { href: "/reports", label: "Citizen Reports", icon: "M4 5h16v11H9l-5 4z" },
  { href: "/health", label: "Health & Vulnerability", icon: "M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6-8 11-8 11z" },
  { href: "/audit", label: "Audit", icon: "M6 3h9l4 4v14H6zM9 12h7M9 16h7M9 8h3" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <div className="langtoggle" role="group" aria-label="Language">
      <button type="button" className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>EN</button>
      <button type="button" className={lang === "hi" ? "on" : ""} onClick={() => setLang("hi")}>हिं</button>
    </div>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { t } = useLang();
  const { officer, email, signOut } = useAuth();
  const { error, loading, now } = useData();
  const active = (href: string) => (href === "/" ? path === "/" || path.startsWith("/units") : path.startsWith(href));

  // Below 860px the sidebar becomes a slide-over drawer, off-screen by default.
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Never leave the drawer open across a navigation — the user tapped a link
  // to get somewhere, not to stare at the menu that's now covering the page.
  // Synchronising open-state to the route (an external signal, not React
  // state) is exactly what this effect is for.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDrawerOpen(false);
  }, [path]);

  // Escape closes it, and the page behind it must not scroll while it's open.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [drawerOpen]);

  return (
    <div className="frame">
      <header className="topbar">
        <button type="button" className="hamburger" aria-label={t("Open menu")} aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <span className="topbar-brand">
          <span className="brand-mark" aria-hidden>J</span>
          {t("JalRakshak")}
        </span>
      </header>

      {drawerOpen && <button type="button" className="side-backdrop" aria-label={t("Close menu")} onClick={() => setDrawerOpen(false)} />}

      <aside className={`side${drawerOpen ? " open" : ""}`}>
        <div className="brand">
          <span className="brand-mark" aria-hidden>J</span>
          <div>
            <b>JalRakshak</b>
            <small>{t("Government Dashboard")}</small>
          </div>
          <button type="button" className="side-close" aria-label={t("Close menu")} onClick={() => setDrawerOpen(false)}>✕</button>
        </div>
        <nav aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={active(n.href) ? "on" : ""} aria-current={active(n.href) ? "page" : undefined}>
              <Icon d={n.icon} />
              <span>{t(n.label)}</span>
            </Link>
          ))}
        </nav>
        <div className="side-foot">
          <LangToggle />
          <div className="who">
            <b>{officer?.name}</b>
            <small>{officer?.district ? `${officer.district} · ` : ""}{officer?.role}</small>
            <small className="muted">{email}</small>
          </div>
          <button type="button" className="btn ghost sm" onClick={signOut}>{t("Sign out")}</button>
        </div>
      </aside>
      <main className="main">
        {error && (
          <Notice tone="error">
            {t("Some data could not be loaded")}: {error}
          </Notice>
        )}
        {loading ? <p className="muted pad">{t("Loading…")}</p> : children}
        <footer className="foot muted">
          {t("Data as of")} {new Date(now).toLocaleTimeString()} · {t("Units sync when the network returns; check each unit's last seen time.")}
        </footer>
      </main>
    </div>
  );
}

function Login() {
  const { signIn } = useAuth();
  const { t } = useLang();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(await signIn(email, password));
    setBusy(false);
  }

  return (
    <div className="center">
      <form className="card login" onSubmit={submit}>
        <div className="brand">
          <span className="brand-mark" aria-hidden>J</span>
          <div>
            <b>JalRakshak</b>
            <small>{t("Government Dashboard")}</small>
          </div>
        </div>
        <p className="muted">{t("For district water officers, block staff and the pollution control board.")}</p>
        <label>
          {t("Email")}
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          {t("Password")}
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {err && <Notice tone="error">{t(err)}</Notice>}
        <button className="btn primary" disabled={busy}>{busy ? t("Signing in…") : t("Sign in")}</button>
        <div className="row-end"><LangToggle /></div>
      </form>
    </div>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const { status, signOut, email } = useAuth();
  const { t } = useLang();

  if (status === "unconfigured") {
    return (
      <div className="center">
        <div className="card login">
          <h2>Firebase is not configured</h2>
          <p>
            Copy <code>.env.example</code> to <code>.env.local</code>, fill in the <code>NEXT_PUBLIC_FIREBASE_*</code>{" "}
            values from your Firebase project settings, and restart <code>npm run dev</code>.
          </p>
        </div>
      </div>
    );
  }
  if (status === "loading") return <div className="center"><p className="muted">{t("Loading…")}</p></div>;
  if (status === "signedOut") return <Login />;
  if (status === "noProfile") {
    return (
      <div className="center">
        <div className="card login">
          <h2>{t("Not an authorised officer")}</h2>
          <p>
            {email} {t("can sign in, but has no officer profile. Ask an administrator to add one under officers in Firestore.")}
          </p>
          <button type="button" className="btn" onClick={signOut}>{t("Sign out")}</button>
        </div>
      </div>
    );
  }
  return (
    <DataProvider>
      <Frame>{children}</Frame>
    </DataProvider>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  return (
    <LangProvider>
      <AuthProvider>
        <Gate>{children}</Gate>
      </AuthProvider>
    </LangProvider>
  );
}
