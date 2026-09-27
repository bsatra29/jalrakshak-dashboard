"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { LineChart, type ChartMarker } from "@/components/Charts";
import { Card, Empty, Loading, Notice, PageHeader, TierBadge } from "@/components/ui";
import { useAuth } from "@/context/AuthProvider";
import { useData, useFleetHistory } from "@/context/DataProvider";
import { useLang } from "@/context/LangProvider";
import { logExport } from "@/lib/actions";
import { canonical } from "@/lib/audit";
import { classifySeries, detectNeutralLeachate, sensorSeries } from "@/lib/analysis";
import { DAY, download, fmtDate, median, pctChange, sha256Hex } from "@/lib/format";
import { PARAMS, SCORED_PARAMS, fmtValue, isOutOfLimit, paramLabel } from "@/lib/thresholds";
import type { Unit } from "@/lib/types";

type Pair = { streamId: string; up: Unit; down: Unit };

const RANGES = [{ k: "12m", days: 366, l: "12 months" }, { k: "90d", days: 90, l: "90 days" }, { k: "30d", days: 30, l: "30 days" }];

export default function AccountabilityPage() {
  const { t, lang } = useLang();
  const { officer } = useAuth();
  const { units, mines, mineEvents, now } = useData();
  const hist = useFleetHistory();
  const [sel, setSel] = useState("");
  const [range, setRange] = useState("12m");
  const [msg, setMsg] = useState<string | null>(null);

  const pairs: Pair[] = useMemo(() => {
    const byStream = new Map<string, Unit[]>();
    for (const u of units) if (u.streamId) byStream.set(u.streamId, [...(byStream.get(u.streamId) ?? []), u]);
    const out: Pair[] = [];
    for (const [streamId, us] of byStream) {
      const up = us.find((u) => u.mineProfile.position === "upstream");
      const down = us.find((u) => u.mineProfile.position === "downstream");
      if (up && down) out.push({ streamId, up, down });
    }
    return out;
  }, [units]);

  const pair = pairs.find((p) => p.streamId === sel) ?? pairs[0];
  const mineBetween = pair ? mines.find((m) => m.id === pair.down.mineBetweenId) : undefined;
  const days = RANGES.find((r) => r.k === range)!.days;

  const ready = hist.state === "ready";
  const ecUp = useMemo(() => (pair && ready ? sensorSeries(hist.readings[pair.up.id] ?? [], "ec") : []), [pair, ready, hist]);
  const ecDown = useMemo(() => (pair && ready ? sensorSeries(hist.readings[pair.down.id] ?? [], "ec") : []), [pair, ready, hist]);
  const shapeDown = useMemo(() => classifySeries(ecDown), [ecDown]);

  const rain = useMemo(
    () => (pair && ready ? (hist.readings[pair.up.id] ?? []).filter((r) => r.tapPoint === "raw" && (r.rainfallMm ?? 0) > 0 && r.timestamp >= now - days * DAY).map((r) => ({ t: r.timestamp, v: r.rainfallMm as number })) : []),
    [pair, ready, hist, days, now],
  );

  const markers: ChartMarker[] = useMemo(() => {
    if (!pair) return [];
    const ms: ChartMarker[] = mineEvents.filter((e) => e.mineId === pair.down.mineBetweenId && e.timestamp >= now - days * DAY).map((e) => ({ t: e.timestamp, kind: "mine" as const, label: `${e.type}${e.note ? `: ${e.note}` : ""}` }));
    const ev: ChartMarker[] = shapeDown.events.filter((p) => p.t >= now - days * DAY).map((p) => ({ t: p.t, kind: "event" as const, label: `EC spike ${p.v.toFixed(0)} µS/cm` }));
    return [...ms, ...ev];
  }, [pair, mineEvents, shapeDown, days, now]);

  const comparison = useMemo(() => {
    if (!pair) return [];
    return SCORED_PARAMS.map((p) => {
      const a = pair.up.latest[p]?.value ?? null;
      const b = pair.down.latest[p]?.value ?? null;
      return { param: p, up: a, down: b, delta: a !== null && b !== null ? b - a : null, pct: pctChange(a, b) };
    });
  }, [pair]);

  const leachDown = useMemo(() => (pair && ready ? detectNeutralLeachate(hist.readings[pair.down.id] ?? [], hist.chem[pair.down.id] ?? [], now) : null), [pair, ready, hist, now]);
  const leachUp = useMemo(() => (pair && ready ? detectNeutralLeachate(hist.readings[pair.up.id] ?? [], hist.chem[pair.up.id] ?? [], now) : null), [pair, ready, hist, now]);

  const scorecard = useMemo(() => {
    if (!ready) return [];
    return mines
      .map((m) => {
        const us = units.filter((u) => u.nearestMineId === m.id || u.mineBetweenId === m.id);
        let spikes = 0;
        let leach = 0;
        for (const u of us) {
          const rs = hist.readings[u.id] ?? [];
          const cutoff = now - 366 * DAY;
          spikes += classifySeries(sensorSeries(rs, "ec")).events.filter((p) => p.t >= cutoff).length;
          spikes += classifySeries(sensorSeries(rs, "turbidity")).events.filter((p) => p.t >= cutoff).length;
          if (detectNeutralLeachate(rs, hist.chem[u.id] ?? [], now).flag) leach++;
        }
        const logged = mineEvents.filter((e) => e.mineId === m.id && e.timestamp >= now - 366 * DAY).length;
        const deltas = units
          .filter((u) => u.mineBetweenId === m.id)
          .map((d) => {
            const up = units.find((x) => x.streamId === d.streamId && x.mineProfile.position === "upstream");
            const a = up?.latest.ec?.value;
            const b = d.latest.ec?.value;
            return a !== undefined && b !== undefined ? b - a : null;
          })
          .filter((x): x is number => x !== null);
        return { mine: m, units: us.length, spikes, logged, leach, ecDelta: median(deltas) };
      })
      .sort((a, b) => b.spikes - a.spikes);
  }, [mines, units, hist, ready, mineEvents, now]);

  async function exportEvidence() {
    if (!officer || !pair) return;
    const payload = {
      product: "JalRakshak",
      kind: "upstream-downstream-attribution",
      generatedAt: now,
      generatedBy: { uid: officer.uid, name: officer.name, role: officer.role },
      stream: pair.streamId,
      upstream: { id: pair.up.id, name: pair.up.name, lat: pair.up.lat, lng: pair.up.lng },
      downstream: { id: pair.down.id, name: pair.down.name, lat: pair.down.lat, lng: pair.down.lng },
      mineBetween: mineBetween ?? null,
      comparison,
      neutralPhLeachate: { upstream: leachUp, downstream: leachDown },
      ecEventsDownstream: shapeDown.events,
      mineEventsLogged: mineEvents.filter((e) => e.mineId === pair.down.mineBetweenId),
      scorecard: scorecard.map((s) => ({ mineId: s.mine.id, name: s.mine.name, operator: s.mine.operator, units: s.units, spikes12m: s.spikes, loggedEvents12m: s.logged, neutralPhFlags: s.leach, medianEcDelta: s.ecDelta })),
      caveat: "Attribution is inferred from paired-unit differences; it is evidence for inspection, not a finding of fault.",
    };
    const digest = await sha256Hex(canonical(payload));
    try {
      const e = await logExport(officer, "accountability", digest, { stream: pair.streamId });
      download(`jalrakshak-accountability-${pair.streamId}-${new Date(now).toISOString().slice(0, 10)}.json`, JSON.stringify({ payload, sha256: digest, auditSeq: e.seq, auditHash: e.hash }, null, 2));
      setMsg(`${t("Exported. SHA-256")} ${digest.slice(0, 16)}… (${t("audit entry")} #${e.seq})`);
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  if (!pairs.length) return <><PageHeader title={t("Mine Accountability")} /><Card><Empty>{t("No paired upstream/downstream units are configured. Give two units the same streamId with positions upstream and downstream.")}</Empty></Card></>;
  if (!pair) return null;

  const ecRow = comparison.find((c) => c.param === "ec");

  return (
    <>
      <PageHeader
        title={t("Mine Accountability")}
        sub={t("The difference between two units on one stream is attributable to what sits between them.")}
        right={<button type="button" className="btn primary" onClick={exportEvidence}>{t("Tamper-proof export")}</button>}
      />
      {msg && <Notice tone="info">{msg}</Notice>}

      <div className="filters">
        <label>{t("Stream")}
          <select value={pair.streamId} onChange={(e) => setSel(e.target.value)}>
            {pairs.map((p) => <option key={p.streamId} value={p.streamId}>{p.up.village} → {p.down.village} ({p.down.district})</option>)}
          </select>
        </label>
        <label>{t("Timeline")}
          <select value={range} onChange={(e) => setRange(e.target.value)}>{RANGES.map((r) => <option key={r.k} value={r.k}>{t(r.l)}</option>)}</select>
        </label>
      </div>

      <div className="grid2">
        <Card title={t("Upstream vs downstream")}>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("Parameter")}</th>
                  <th className="r"><Link href={`/units/${pair.up.id}`}>▲ {pair.up.name}</Link><br /><small className="muted">{t("upstream")}</small></th>
                  <th className="r"><Link href={`/units/${pair.down.id}`}>▼ {pair.down.name}</Link><br /><small className="muted">{t("downstream")}</small></th>
                  <th className="r">{t("Difference")}</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((c) => (
                  <tr key={c.param}>
                    <td>{paramLabel(c.param, lang)} <span className="muted">{PARAMS[c.param].unit}</span></td>
                    <td className={`num ${c.up !== null && isOutOfLimit(c.param, c.up) ? "bad" : ""}`}>{fmtValue(c.param, c.up)}</td>
                    <td className={`num ${c.down !== null && isOutOfLimit(c.param, c.down) ? "bad" : ""}`}>{fmtValue(c.param, c.down)}</td>
                    <td className="num">{c.delta === null ? "—" : `${c.delta >= 0 ? "+" : ""}${fmtValue(c.param, c.delta)}${c.pct !== null && c.param !== "pH" ? ` (${c.pct >= 0 ? "+" : ""}${c.pct.toFixed(0)} %)` : ""}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card-b">
            <TierBadge tier="ESTIMATED" />{" "}
            {mineBetween ? (
              <>
                {t("Between these units:")} <b>{mineBetween.name}</b> ({t(mineBetween.type)}), {t("operator")} <b>{mineBetween.operator}</b>.
                {ecRow?.delta !== null && ecRow?.delta !== undefined && ecRow.delta > 0 && <> {t("Downstream conductivity is")} <b>+{ecRow.delta.toFixed(0)} µS/cm</b> {t("above upstream.")}</>}
              </>
            ) : t("No mine feature is recorded between these units.")}
            <p className="muted">{t("This is inference from a paired difference, not proof of fault. Use it to direct inspection.")}</p>
          </div>
        </Card>

        <Card title={t("Neutral-pH leachate check")}>
          <div className="card-b">
            {ready ? (
              [{ u: pair.up, l: leachUp }, { u: pair.down, l: leachDown }].map(({ u, l }) => (
                <p key={u.id}>
                  <b>{u.name}</b>{" "}
                  {l?.flag ? <span className="badge s-amber"><span className="glyph">!</span>{t("Neutral-pH leachate flag")}</span> : l?.ecPct === null ? <span className="muted">{t("not enough history")}</span> : <span className="badge s-green"><span className="glyph">✓</span>{t("no flag")}</span>}
                  <br />
                  {l && l.ecPct !== null && <small className="muted">EC {l.ecPct >= 0 ? "+" : ""}{l.ecPct.toFixed(0)} %{l.hardnessPct !== null && `, ${t("hardness")} ${l.hardnessPct >= 0 ? "+" : ""}${l.hardnessPct.toFixed(0)} %`}{l.phDelta !== null && `, pH ${l.phDelta >= 0 ? "+" : ""}${l.phDelta.toFixed(2)}`}</small>}
                </p>
              ))
            ) : <Loading />}
            <p className="muted">{t("Flags conductivity and hardness rising 20 % or more while pH stays flat and in range. This is the coal signature a pH-only system misses.")}</p>
          </div>
        </Card>
      </div>

      <Card title={t("Event timeline: conductivity, rainfall and mining activity")}>
        {ready ? (
          <LineChart
            series={[
              { name: `${t("Upstream")} · ${pair.up.name}`, color: "#4a6fa5", dash: "6 4", points: ecUp.filter((p) => p.t >= now - days * DAY) },
              { name: `${t("Downstream")} · ${pair.down.name}`, color: "#c2410c", points: ecDown.filter((p) => p.t >= now - days * DAY) },
            ]}
            bars={rain}
            barsLabel={t("Rainfall (mm)")}
            markers={markers}
            thresholds={[{ y: PARAMS.ec.max!, label: `EC ${PARAMS.ec.max}` }]}
            unit="µS/cm"
          />
        ) : <Loading />}
        <p className="muted pad">
          {t("Event markers (●) are sudden departures from the recent baseline. Mine activity (▲) is what the operator or inspectors logged. A spike right after rain is runoff; a spike with no rain, downstream only, points at a discharge.")}
          {shapeDown.trendPctPerWeek !== null && ` ${t("Slow drift downstream")}: ${shapeDown.trendPctPerWeek >= 0 ? "+" : ""}${shapeDown.trendPctPerWeek.toFixed(1)} % ${t("per week")}.`}
        </p>
      </Card>

      <Card title={t("Per-mine scorecard (12 months)")}>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>{t("Mine feature")}</th><th>{t("Operator")}</th><th className="r">{t("Units")}</th><th className="r">{t("Spikes (EC + turbidity)")}</th><th className="r">{t("Logged mine events")}</th><th className="r">{t("Neutral-pH flags")}</th><th className="r">{t("Median EC gap")}</th></tr></thead>
            <tbody>
              {scorecard.map((s) => (
                <tr key={s.mine.id}>
                  <td>{s.mine.name}<div className="muted">{t(s.mine.type)}</div></td>
                  <td>{s.mine.operator}</td>
                  <td className="num">{s.units}</td>
                  <td className="num"><b>{s.spikes}</b></td>
                  <td className="num">{s.logged}</td>
                  <td className="num">{s.leach}</td>
                  <td className="num">{s.ecDelta === null ? "—" : `${s.ecDelta >= 0 ? "+" : ""}${s.ecDelta.toFixed(0)} µS/cm`}</td>
                </tr>
              ))}
              {!scorecard.length && <tr><td colSpan={7}>{ready ? <Empty>{t("No mine features recorded.")}</Empty> : <Loading />}</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="muted pad">{t("Counts cover units whose nearest or between-stream mine is that feature. Generated")} {fmtDate(now, lang)}.</p>
      </Card>
    </>
  );
}
