"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { Card, Empty, Notice, PageHeader } from "@/components/ui";
import { useAuth } from "@/context/AuthProvider";
import { useLang } from "@/context/LangProvider";
import { logExport } from "@/lib/actions";
import { GENESIS, canonical, loadFullChain, verifyChain, type ChainCheck } from "@/lib/audit";
import { getDb } from "@/lib/firebase";
import { csvEscape, download, fmtDateTime, sha256Hex } from "@/lib/format";
import type { AuditEntry } from "@/lib/types";

export default function AuditPage() {
  const { t, lang } = useLang();
  const { officer } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [q, setQ] = useState("");
  const [check, setCheck] = useState<ChainCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(
    () =>
      onSnapshot(query(collection(getDb(), "auditLog"), orderBy("seq", "desc"), limit(500)), (s) => setEntries(s.docs.map((d) => d.data() as AuditEntry))),
    [],
  );

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? entries.filter((e) => `${e.action} ${e.officerName} ${e.target} ${JSON.stringify(e.details)}`.toLowerCase().includes(n)) : entries;
  }, [entries, q]);

  async function verify() {
    setBusy(true);
    setMsg(null);
    try {
      setCheck(await verifyChain(await loadFullChain()));
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function exportChain(format: "json" | "csv") {
    if (!officer) return;
    setBusy(true);
    setMsg(null);
    try {
      const chain = await loadFullChain();
      const result = await verifyChain(chain);
      const stamp = new Date().toISOString().slice(0, 10);
      let body: string;
      if (format === "json") {
        const manifest = { product: "JalRakshak", kind: "audit-log-export", exportedAt: Date.now(), exportedBy: officer.name, entries: chain.length, chainIntact: result.ok, headHash: result.headHash, genesis: GENESIS };
        const digest = await sha256Hex(canonical({ manifest, chain }));
        body = JSON.stringify({ manifest, sha256: digest, chain }, null, 2);
      } else {
        const head = ["seq", "at_iso", "officer", "action", "target", "details", "prev_hash", "hash"];
        body = [head.join(","), ...chain.map((e) => [e.seq, new Date(e.at).toISOString(), e.officerName, e.action, e.target, e.details, e.prevHash, e.hash].map(csvEscape).join(","))].join("\n");
      }
      download(`jalrakshak-audit-${stamp}.${format}`, body, format === "json" ? "application/json" : "text/csv");
      setCheck(result);
      // Logged after the file is built, so the export records itself without being inside its own hash.
      await logExport(officer, "audit", await sha256Hex(body), { entries: chain.length, format });
      setMsg(t("Exported. The export itself is now recorded in the log."));
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={t("Audit")}
        sub={t("Every acknowledgement, lab result and export, in an append-only hash chain. Entries cannot be edited or deleted; any change breaks every later hash.")}
        right={
          <>
            <button type="button" className="btn" disabled={busy} onClick={verify}>{t("Verify chain")}</button>
            <button type="button" className="btn" disabled={busy} onClick={() => exportChain("csv")}>CSV</button>
            <button type="button" className="btn primary" disabled={busy} onClick={() => exportChain("json")}>{t("Export for legal use (JSON)")}</button>
          </>
        }
      />
      {msg && <Notice tone="info">{msg}</Notice>}
      {check && (
        check.ok
          ? <Notice tone="info"><b>✓ {t("Chain intact.")}</b> {check.checked} {t("entries verified. Head hash")}: <code>{check.headHash.slice(0, 24)}…</code></Notice>
          : <Notice tone="error"><b>✕ {t("Chain broken at entry")} #{check.brokenAtSeq}.</b> {check.reason}. {t("Entries before it are still verified.")}</Notice>
      )}
      <div className="filters"><label style={{ flex: 1 }}>{t("Search")}<input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("officer, action, unit, sample…")} /></label></div>

      <Card title={`${t("Log")} (${shown.length}${entries.length === 500 ? "+" : ""})`}>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th className="r">#</th><th>{t("When")}</th><th>{t("Officer")}</th><th>{t("Action")}</th><th>{t("Target")}</th><th>{t("Hash")}</th></tr></thead>
            <tbody>
              {shown.map((e) => (
                <Fragment key={e.seq}>
                  <tr onClick={() => setOpen(open === e.seq ? null : e.seq)} style={{ cursor: "pointer" }}>
                    <td className="num">{e.seq}</td>
                    <td>{fmtDateTime(e.at, lang)}</td>
                    <td>{e.officerName}</td>
                    <td><code>{e.action}</code></td>
                    <td className="mono">{e.target}</td>
                    <td className="mono">{e.hash.slice(0, 10)}…</td>
                  </tr>
                  {open === e.seq && (
                    <tr key={`${e.seq}-d`}>
                      <td colSpan={6}>
                        <pre className="mono" style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify({ details: e.details, officerUid: e.officerUid, prevHash: e.prevHash, hash: e.hash }, null, 2)}</pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {!shown.length && <tr><td colSpan={6}><Empty>{t("No audit entries yet. They appear as officers act.")}</Empty></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
