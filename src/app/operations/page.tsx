"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, ClassBadge, Empty, PageHeader, StatusBadge } from "@/components/ui";
import { useAuth } from "@/context/AuthProvider";
import { useData } from "@/context/DataProvider";
import { useLang } from "@/context/LangProvider";
import { setDisposal } from "@/lib/actions";
import { cartridgeLife, maintenanceUrgency } from "@/lib/analysis";
import { DAY, ago, fmtDate } from "@/lib/format";

/**
 * Indicative availability of seed for bio-media in Jharkhand. Confirm with the
 * block office each year: monsoon timing moves the season by weeks.
 */
const BIO_CALENDAR: { media: string; months: number[] }[] = [
  { media: "Mango-seed bio-media", months: [4, 5, 6, 7] },
  { media: "Jackfruit-seed bio-media", months: [3, 4, 5, 6, 7] },
];
const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

export default function OperationsPage() {
  const { t, lang } = useLang();
  const { officer } = useAuth();
  const { units, unitStates, cartridges, now } = useData();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const queue = useMemo(() => {
    return units
      .map((u) => {
        const s = unitStates[u.id];
        if (!s) return null;
        const active = cartridges.filter((c) => c.unitId === u.id && c.status === "active");
        const worst = active.map((c) => ({ c, life: cartridgeLife(c, u.dailyLitres) })).sort((a, b) => b.life.usedFraction - a.life.usedFraction)[0] ?? null;
        const { score, reasons } = maintenanceUrgency(u, s.status, worst, s.ver, now);
        return { unit: u, s, score, reasons, worst };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null && x.score > 0)
      .sort((a, b) => b.score - a.score);
  }, [units, unitStates, cartridges, now]);

  const offline = useMemo(() => Object.values(unitStates).filter((s) => s.status === "grey").sort((a, b) => a.unit.lastSeen - b.unit.lastSeen), [unitStates]);

  const forecast = useMemo(() => {
    const byMedia = new Map<string, { d7: number; d14: number; d30: number; d60: number; units: string[] }>();
    for (const c of cartridges.filter((x) => x.status === "active")) {
      const u = unitStates[c.unitId]?.unit;
      if (!u) continue;
      const life = cartridgeLife(c, u.dailyLitres);
      if (life.daysLeft === null) continue;
      const row = byMedia.get(c.mediaType) ?? { d7: 0, d14: 0, d30: 0, d60: 0, units: [] };
      if (life.daysLeft <= 7) row.d7++;
      if (life.daysLeft <= 14) row.d14++;
      if (life.daysLeft <= 30) row.d30++;
      if (life.daysLeft <= 60) row.d60++;
      if (life.daysLeft <= 60) row.units.push(u.name);
      byMedia.set(c.mediaType, row);
    }
    return [...byMedia.entries()].sort((a, b) => b[1].d30 - a[1].d30);
  }, [cartridges, unitStates]);

  const spent = cartridges.filter((c) => c.status === "spent" || c.status === "replaced");
  const thisMonth = new Date(now).getMonth() + 1;

  async function dispose(id: string, to: "collected" | "disposed") {
    const c = cartridges.find((x) => x.id === id);
    if (!c || !officer) return;
    setBusy(id);
    setErr(null);
    try {
      await setDisposal(officer, c, to);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader title={t("Operations")} sub={t("Where to send maintenance staff first, and what to have in the van.")} />

      <Card title={`${t("Maintenance queue, most urgent first")} (${queue.length})`}>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th className="r">{t("Urgency")}</th><th>{t("Unit")}</th><th>{t("Status")}</th><th>{t("Why")}</th><th>{t("Fitted")}</th></tr></thead>
            <tbody>
              {queue.map((q) => (
                <tr key={q.unit.id}>
                  <td className="num"><b>{q.score}</b></td>
                  <td><Link href={`/units/${q.unit.id}`}>{q.unit.name}</Link><div className="muted">{q.unit.block}, {q.unit.district}</div></td>
                  <td><StatusBadge status={q.s.status} /></td>
                  <td>{q.reasons.map((r) => t(r)).join(" · ")}</td>
                  <td>{q.unit.fittedCartridge ?? "—"} <ClassBadge cls={q.unit.currentClass} /></td>
                </tr>
              ))}
              {!queue.length && <tr><td colSpan={5}><Empty>{t("Nothing needs attention.")}</Empty></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid2">
        <Card title={`${t("Offline / dead units")} (${offline.length})`}>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>{t("Unit")}</th><th>{t("Last seen")}</th><th>{t("Open faults")}</th></tr></thead>
              <tbody>
                {offline.map((o) => (
                  <tr key={o.unit.id}>
                    <td><Link href={`/units/${o.unit.id}`}>{o.unit.name}</Link><div className="muted">{o.unit.district}</div></td>
                    <td>{fmtDate(o.unit.lastSeen, lang)} <span className="muted">({ago(o.unit.lastSeen, now)})</span></td>
                    <td>{o.unit.openFaults?.join(", ") || "—"}</td>
                  </tr>
                ))}
                {!offline.length && <tr><td colSpan={3}><Empty>{t("All units are reporting.")}</Empty></td></tr>}
              </tbody>
            </table>
          </div>
          <p className="muted pad">{t("Offline means no sync for 24 hours. A unit may still be treating water; it just cannot tell us.")}</p>
        </Card>

        <Card title={t("Consumables forecast")}>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>{t("Media")}</th><th className="r">{t("≤ 7 d")}</th><th className="r">{t("≤ 14 d")}</th><th className="r">{t("≤ 30 d")}</th><th className="r">{t("≤ 60 d")}</th></tr></thead>
              <tbody>
                {forecast.map(([media, r]) => (
                  <tr key={media} title={r.units.join(", ")}>
                    <td>{media}</td><td className="num">{r.d7}</td><td className="num">{r.d14}</td><td className="num"><b>{r.d30}</b></td><td className="num">{r.d60}</td>
                  </tr>
                ))}
                {!forecast.length && <tr><td colSpan={5}><Empty>{t("No active cartridges with a delivery rate.")}</Empty></td></tr>}
              </tbody>
            </table>
          </div>
          <p className="muted pad">{t("Cartridges expected to reach breakthrough within each window, from litres used and the pressure trend. Hover a row for unit names.")}</p>
        </Card>
      </div>

      <Card title={t("Bio-media supply calendar")}>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>{t("Media")}</th>{MONTHS.map((m, i) => <th key={i} style={{ textAlign: "center", boxShadow: i + 1 === thisMonth ? "inset 0 -3px 0 var(--accent)" : undefined }}>{m}</th>)}</tr></thead>
            <tbody>
              {BIO_CALENDAR.map((b) => {
                const demand60 = forecast.find(([m]) => m === b.media)?.[1].d60 ?? 0;
                const inSeasonSoon = [0, 1, 2].some((k) => b.months.includes(((thisMonth - 1 + k) % 12) + 1));
                return (
                  <tr key={b.media}>
                    <td>{b.media}{demand60 > 0 && !inSeasonSoon && <div className="err">✕ {demand60} {t("cartridges due within 60 d but seed is out of season: stock up now")}</div>}</td>
                    {MONTHS.map((_, i) => <td key={i} style={{ textAlign: "center" }}>{b.months.includes(i + 1) ? <b style={{ color: "var(--green)" }}>●</b> : <span className="muted">○</span>}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted pad">● {t("seed available")} · ○ {t("not available")}. {t("Indicative, confirm with the block office each year.")}</p>
      </Card>

      <Card title={`${t("Spent media tracking")} (${spent.length})`}>
        {err && <p className="err pad">{err}</p>}
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>{t("Unit")}</th><th>{t("Media")}</th><th>{t("Removed")}</th><th className="r">{t("Litres")}</th><th>{t("Handling")}</th><th>{t("Disposal")}</th></tr></thead>
            <tbody>
              {spent.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/units/${c.unitId}`}>{unitStates[c.unitId]?.unit.name ?? c.unitId}</Link></td>
                  <td>{c.mediaType}</td>
                  <td>{fmtDate(c.removedDate, lang)} {c.removedDate && <span className="muted">({Math.floor((now - c.removedDate) / DAY)} d)</span>}</td>
                  <td className="num">{Math.round(c.litresProcessed).toLocaleString()}</td>
                  <td>{c.hazardous ? <span className="badge s-red"><span className="glyph">!</span>{t("Hazardous")}</span> : t("Ordinary")}</td>
                  <td>
                    {c.disposal === "disposed" ? <span className="ok-text">✓ {t("Disposed")}</span>
                      : c.disposal === "collected" ? <>{t("Collected")} <button className="btn sm" disabled={busy === c.id} onClick={() => dispose(c.id, "disposed")}>{t("Mark disposed")}</button></>
                      : <><span className="err">{t("Awaiting collection")}</span> <button className="btn sm" disabled={busy === c.id} onClick={() => dispose(c.id, "collected")}>{t("Mark collected")}</button></>}
                  </td>
                </tr>
              ))}
              {!spent.length && <tr><td colSpan={6}><Empty>{t("No spent media on record.")}</Empty></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
