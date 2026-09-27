"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import MapView, { type MapMarker, type MapRing } from "@/components/MapView";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { useAuth } from "@/context/AuthProvider";
import { useData } from "@/context/DataProvider";
import { useLang } from "@/context/LangProvider";
import { acknowledgeReport } from "@/lib/actions";
import { clusterPoints } from "@/lib/analysis";
import { HOUR, countdown, fmtDateTime, median } from "@/lib/format";
import { ESCALATION_MS } from "@/lib/thresholds";
import type { ReportType } from "@/lib/types";

const TYPES: ReportType[] = ["smell", "taste", "colour", "illness"];
const GLYPH: Record<ReportType, string> = { smell: "S", taste: "T", colour: "C", illness: "!" };

export default function ReportsPage() {
  const { t, lang } = useLang();
  const { officer } = useAuth();
  const { reports, alerts, officers, unitStates, now } = useData();
  const [type, setType] = useState<"" | ReportType>("");
  const [state, setState] = useState<"" | "open" | "escalated" | "acknowledged">("");
  const [unitId, setUnitId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const stateOf = (r: (typeof reports)[number]) => (r.acknowledgedAt ? "acknowledged" : now - r.reportedAt > ESCALATION_MS ? "escalated" : "open");

  const filtered = useMemo(
    () => reports.filter((r) => (!type || r.type === type) && (!unitId || r.unitId === unitId) && (!state || stateOf(r) === state)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reports, type, unitId, state, now],
  );

  const clusters = useMemo(() => clusterPoints(filtered, 0.02), [filtered]);
  const hot = clusters.filter((c) => c.items.length >= 3);

  const markers: MapMarker[] = useMemo(() => {
    const out: MapMarker[] = [];
    for (const [i, c] of clusters.entries()) {
      if (c.items.length >= 3) {
        out.push({ id: `c${i}`, lat: c.lat, lng: c.lng, glyph: String(c.items.length), cls: "rep-cluster", size: 34, label: `${c.items.length} ${t("reports within ~2 km")}` });
      } else {
        for (const r of c.items) out.push({ id: r.id, lat: r.location.lat, lng: r.location.lng, glyph: GLYPH[r.type], cls: "rep", size: 24, label: `${t(r.type)} · ${fmtDateTime(r.reportedAt, lang)}` });
      }
    }
    return out;
  }, [clusters, t, lang]);

  const rings: MapRing[] = hot.map((c) => ({ lat: c.lat, lng: c.lng, radiusM: 2000, color: "#7e1a14", dashed: true }));

  const perOfficer = useMemo(() => {
    const rows = officers.map((o) => {
      const samples: number[] = [];
      for (const r of reports) if (r.acknowledgedByUid === o.uid && r.acknowledgedAt) samples.push(r.acknowledgedAt - r.reportedAt);
      for (const a of alerts) if (a.acknowledgedByUid === o.uid && a.acknowledgedAt) samples.push(a.acknowledgedAt - a.raisedAt);
      const worst = samples.length ? Math.max(...samples) : null;
      return { o, n: samples.length, med: median(samples), worst };
    });
    return rows.sort((a, b) => (b.med ?? 0) - (a.med ?? 0));
  }, [officers, reports, alerts]);

  const openCount = reports.filter((r) => stateOf(r) === "open").length;
  const escCount = reports.filter((r) => stateOf(r) === "escalated").length;
  const illness = reports.filter((r) => r.type === "illness" && !r.acknowledgedAt).length;

  async function ack(id: string) {
    const r = reports.find((x) => x.id === id);
    if (!r || !officer) return;
    setBusy(id);
    setErr(null);
    try {
      await acknowledgeReport(officer, r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader title={t("Citizen Reports")} sub={t("What villagers report from the mobile app, and how quickly anyone answers.")} />
      <div className="stats">
        <Stat label={t("Reports")} value={reports.length} />
        <Stat label={t("Open, within 24 h")} value={openCount} tone="amber" />
        <Stat label={t("Escalated, no answer in 24 h")} value={escCount} tone="red" />
        <Stat label={t("Unanswered illness reports")} value={illness} tone="red" />
      </div>

      <div className="filters">
        <label>{t("Type")}<select value={type} onChange={(e) => setType(e.target.value as ReportType | "")}><option value="">{t("All")}</option>{TYPES.map((x) => <option key={x} value={x}>{GLYPH[x]} {t(x)}</option>)}</select></label>
        <label>{t("Escalation")}<select value={state} onChange={(e) => setState(e.target.value as typeof state)}><option value="">{t("All")}</option><option value="open">{t("Open")}</option><option value="escalated">{t("Escalated")}</option><option value="acknowledged">{t("Acknowledged")}</option></select></label>
        <label>{t("Unit")}<select value={unitId} onChange={(e) => setUnitId(e.target.value)}><option value="">{t("All")}</option>{Object.values(unitStates).map((s) => <option key={s.unit.id} value={s.unit.id}>{s.unit.name}</option>)}</select></label>
      </div>

      <div className="split">
        <div>
          <MapView markers={markers} rings={rings} height={420} fitKey={`${type}|${state}|${unitId}|${reports.length}`} />
          <div className="legend-box">
            {TYPES.map((x) => <span key={x}><b>{GLYPH[x]}</b> {t(x)}</span>)}
            <span><b>●</b> {t("Cluster of 3 or more reports within about 2 km")}</span>
          </div>
        </div>
        <Card title={`${t("Geographic clusters")} (${hot.length})`}>
          {hot.length ? (
            <ul className="alerts">
              {hot.sort((a, b) => b.items.length - a.items.length).map((c, i) => {
                const counts = TYPES.map((x) => [x, c.items.filter((r) => r.type === x).length] as const).filter(([, n]) => n);
                return (
                  <li key={i} className="alert">
                    <span className="sev sev-critical" aria-hidden>{c.items.length}</span>
                    <div className="alert-body">
                      <b>{unitStates[c.items[0].unitId]?.unit.village ?? c.items[0].unitId}</b>
                      <p>{counts.map(([x, n]) => `${n} ${t(x)}`).join(", ")}</p>
                      <small className="muted">{c.lat.toFixed(3)}, {c.lng.toFixed(3)}</small>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : <Empty>{t("No clusters in this selection.")}</Empty>}
        </Card>
      </div>

      <Card title={`${t("Complaint log")} (${filtered.length})`}>
        {err && <p className="err pad">{err}</p>}
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>{t("Type")}</th><th>{t("Unit")}</th><th>{t("Reported")}</th><th>{t("Escalation")}</th><th>{t("Answered by")}</th><th></th></tr></thead>
            <tbody>
              {filtered.slice(0, 200).map((r) => {
                const s = stateOf(r);
                return (
                  <tr key={r.id}>
                    <td><b>{GLYPH[r.type]}</b> {t(r.type)}{r.note && <div className="muted">{r.note}</div>}</td>
                    <td><Link href={`/units/${r.unitId}`}>{unitStates[r.unitId]?.unit.name ?? r.unitId}</Link></td>
                    <td>{fmtDateTime(r.reportedAt, lang)}</td>
                    <td>
                      {s === "acknowledged" && <span className="ok-text">✓ {t("Acknowledged")}</span>}
                      {s === "open" && <span className="timer">⏱ {countdown(r.reportedAt + ESCALATION_MS - now)} {t("left")}</span>}
                      {s === "escalated" && <span className="timer hot">▲ {t("Escalated")} · {Math.floor((now - r.reportedAt) / HOUR)} h {t("unanswered")}</span>}
                    </td>
                    <td>{r.acknowledgedBy ? `${r.acknowledgedBy} (${countdown((r.acknowledgedAt ?? 0) - r.reportedAt)})` : "—"}</td>
                    <td>{!r.acknowledgedAt && <button className="btn sm primary" disabled={busy === r.id} onClick={() => ack(r.id)}>{t("Acknowledge")}</button>}</td>
                  </tr>
                );
              })}
              {!filtered.length && <tr><td colSpan={6}><Empty>{t("No reports match.")}</Empty></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={t("Response time per officer")}>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>{t("Officer")}</th><th>{t("Role")}</th><th className="r">{t("Answered")}</th><th className="r">{t("Median response")}</th><th className="r">{t("Slowest")}</th></tr></thead>
            <tbody>
              {perOfficer.map(({ o, n, med, worst }) => (
                <tr key={o.uid}>
                  <td>{o.name}<div className="muted">{[o.district, o.block].filter(Boolean).join(" · ")}</div></td>
                  <td>{o.role}</td>
                  <td className="num">{n}</td>
                  <td className={`num ${med !== null && med > ESCALATION_MS ? "bad" : ""}`}>{med === null ? "—" : countdown(med)}</td>
                  <td className={`num ${worst !== null && worst > ESCALATION_MS ? "bad" : ""}`}>{worst === null ? "—" : countdown(worst)}</td>
                </tr>
              ))}
              {!perOfficer.length && <tr><td colSpan={5}><Empty>{t("No officers on record.")}</Empty></td></tr>}
            </tbody>
          </table>
        </div>
        <p className="muted pad">{t("Counts citizen reports and alerts an officer acknowledged. Over 24 h is shown in red: past that point alerts auto-broadcast to citizens.")}</p>
      </Card>
    </>
  );
}
