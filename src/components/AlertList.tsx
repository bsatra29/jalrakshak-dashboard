"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/context/AuthProvider";
import { useData } from "@/context/DataProvider";
import { useLang } from "@/context/LangProvider";
import { acknowledgeAlert } from "@/lib/actions";
import { escalationOf } from "@/lib/analysis";
import { ago, countdown, fmtDateTime } from "@/lib/format";
import type { Alert } from "@/lib/types";
import { Empty } from "./ui";

const SEV_GLYPH = { critical: "✕", warning: "!", info: "i" } as const;

const TYPE_LABEL: Record<string, string> = {
  "turbidity-spike": "Turbidity spike",
  "neutral-ph-leachate": "Neutral-pH leachate",
  "post-monsoon-leaching": "Post-monsoon leaching",
  "chemical-exceedance": "Chemical exceedance",
  "cartridge-exhausted": "Cartridge exhausted",
  "beyond-local-treatment": "Beyond local treatment",
  "unit-offline": "Unit offline",
  "lab-overdue": "Lab overdue",
  "microbial-risk": "Microbial risk",
};

export default function AlertList({ alerts, showUnit = true }: { alerts: Alert[]; showUnit?: boolean }) {
  const { t, lang } = useLang();
  const { officer } = useAuth();
  const { now, unitStates } = useData();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function ack(a: Alert) {
    if (!officer) return;
    setBusy(a.id);
    setErr(null);
    try {
      await acknowledgeAlert(officer, a);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!alerts.length) return <Empty>{t("No alerts.")}</Empty>;

  return (
    <>
      {err && <p className="err pad">{err}</p>}
      <ul className="alerts">
        {alerts.map((a) => {
          const esc = escalationOf(a, now);
          const u = unitStates[a.unitId]?.unit;
          return (
            <li key={a.id} className={`alert sev-${a.severity}`}>
              <span className={`sev sev-${a.severity}`} aria-hidden>{SEV_GLYPH[a.severity]}</span>
              <div className="alert-body">
                <div className="alert-top">
                  <b>{t(TYPE_LABEL[a.type] ?? a.type)}</b>
                  <span className={`tag ${a.pattern}`}>{a.pattern === "event" ? t("Event") : t("Trend")}</span>
                  {showUnit && (
                    <Link href={`/units/${a.unitId}`}>{u?.name ?? a.unitId}</Link>
                  )}
                </div>
                <p>{lang === "hi" && a.messageHi ? a.messageHi : a.message}</p>
                <small className="muted">{fmtDateTime(a.raisedAt, lang)} · {ago(a.raisedAt, now)} {t("ago")}</small>
              </div>
              <div className="alert-side">
                {esc.state === "acknowledged" && (
                  <span className="ok-text">✓ {a.acknowledgedBy}<br /><small>{t("in")} {countdown((a.acknowledgedAt ?? 0) - a.raisedAt)}</small></span>
                )}
                {esc.state === "counting" && (
                  <>
                    <span className={`timer ${esc.msLeft < 4 * 3600000 ? "hot" : ""}`} title={t("Auto-broadcasts to citizens if not acknowledged")}>
                      ⏱ {countdown(esc.msLeft)} {t("to broadcast")}
                    </span>
                    <button type="button" className="btn sm primary" disabled={busy === a.id} onClick={() => ack(a)}>{t("Acknowledge")}</button>
                  </>
                )}
                {esc.state === "broadcast" && (
                  <>
                    <span className="timer hot">📢 {t("Broadcast to citizens")}</span>
                    <button type="button" className="btn sm" disabled={busy === a.id} onClick={() => ack(a)}>{t("Acknowledge")}</button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
