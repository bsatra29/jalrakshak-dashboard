"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import AlertList from "@/components/AlertList";
import ContactPanel from "@/components/ContactPanel";
import { LineChart, Meter } from "@/components/Charts";
import { Card, ClassBadge, CLASS_INFO, CyclePips, Empty, Notice, PageHeader, StatusBadge, TierBadge, VerifyChip } from "@/components/ui";
import { useAuth } from "@/context/AuthProvider";
import { useData } from "@/context/DataProvider";
import { useLang } from "@/context/LangProvider";
import { logMaintenance, requestSample } from "@/lib/actions";
import { cartridgeLife, detectNeutralLeachate, paramSeries } from "@/lib/analysis";
import { getDb } from "@/lib/firebase";
import { DAY, ago, daysBetween, fmtDate, fmtDateTime } from "@/lib/format";
import { CHEM_PARAMS, PARAMS, SCORED_PARAMS, SENSOR_PARAMS, fmtValue, isOutOfLimit, paramLabel } from "@/lib/thresholds";
import type { ChemTest, FieldTestType, MaintenanceEntry, ParamId, Reading, SensorParam, TapPoint } from "@/lib/types";

const TAPS: TapPoint[] = ["raw", "sediment", "carbon", "media", "final"];
const TAP_LABEL: Record<TapPoint, string> = { raw: "Raw chamber", sediment: "After sediment", carbon: "After carbon", media: "After media", final: "Treated chamber" };
const MAINT_KINDS: MaintenanceEntry["kind"][] = ["cartridge-swap", "sensor-service", "cleaning", "repair", "inspection"];
const RANGES = [
  { key: "2d", label: "48 hours", days: 2 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "12m", label: "12 months", days: 366 },
];

function useUnitData(id: string) {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [chem, setChem] = useState<ChemTest[]>([]);
  const [maint, setMaint] = useState<MaintenanceEntry[]>([]);
  useEffect(() => {
    const db = getDb();
    const offs = [
      onSnapshot(query(collection(db, "units", id, "readings"), orderBy("timestamp", "desc"), limit(300)), (s) => setReadings(s.docs.map((d) => ({ ...(d.data() as Reading), id: d.id })).reverse())),
      onSnapshot(query(collection(db, "units", id, "chemTests"), orderBy("timestamp", "desc"), limit(200)), (s) => setChem(s.docs.map((d) => ({ ...(d.data() as ChemTest), id: d.id })).reverse())),
      onSnapshot(query(collection(db, "units", id, "maintenance"), orderBy("timestamp", "desc"), limit(50)), (s) => setMaint(s.docs.map((d) => ({ ...(d.data() as MaintenanceEntry), id: d.id })))),
    ];
    return () => offs.forEach((o) => o());
  }, [id]);
  return { readings, chem, maint };
}

export default function UnitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useLang();
  const { officer } = useAuth();
  const { unitStates, cartridges, fieldTests, alerts, reports, now } = useData();
  const { readings, chem, maint } = useUnitData(id);

  const [tap, setTap] = useState<TapPoint>("raw");
  const [chartParam, setChartParam] = useState<ParamId>("ec");
  const [range, setRange] = useState("30d");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [mKind, setMKind] = useState<MaintenanceEntry["kind"]>("inspection");
  const [mNote, setMNote] = useState("");

  const state = unitStates[id];

  const latestByTap = useMemo(() => {
    const out: Partial<Record<TapPoint, Reading>> = {};
    for (const r of readings) if (!out[r.tapPoint] || r.timestamp > out[r.tapPoint]!.timestamp) out[r.tapPoint] = r;
    return out;
  }, [readings]);

  const latestChem = useMemo(() => {
    const out: Record<string, Partial<Record<TapPoint, ChemTest>>> = {};
    for (const c of chem) {
      const tp = c.tapPoint ?? "raw";
      const cur = (out[c.parameter] ??= {});
      if (!cur[tp] || c.timestamp > cur[tp]!.timestamp) cur[tp] = c;
    }
    return out;
  }, [chem]);

  const leachate = useMemo(() => detectNeutralLeachate(readings, chem, now), [readings, chem, now]);

  const chartPts = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)!.days;
    return paramSeries(readings, chem, chartParam).filter((p) => p.t >= now - days * DAY);
  }, [readings, chem, chartParam, range, now]);

  if (!state) return <Card><Empty>{t("Unit not found.")} <Link href="/">{t("Back to map")}</Link></Empty></Card>;
  const { unit, status, reason, ver } = state;

  const carts = cartridges.filter((c) => c.unitId === id && c.status === "active");
  const tests = fieldTests.filter((f) => f.unitId === id).sort((a, b) => b.collectedDate - a.collectedDate);
  const unitAlerts = alerts.filter((a) => a.unitId === id);
  const micro = unit.estimates?.microbialRisk;

  async function request(type: FieldTestType) {
    if (!officer) return;
    setBusy(true);
    setMsg(null);
    try {
      const e = await requestSample(officer, unit, type);
      setMsg(`${t("Lab sample requested")} (#${e.seq})`);
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitMaint(e: FormEvent) {
    e.preventDefault();
    if (!officer || !mNote.trim()) return;
    setBusy(true);
    try {
      await logMaintenance(officer, unit, mKind, mNote.trim());
      setMNote("");
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const tapReading = latestByTap[tap];
  const pendingOf = (type: FieldTestType) => ver.pending.find((p) => p.type === type);
  const lastOf = (type: FieldTestType) => tests.find((x) => x.type === type && x.status === "resulted");

  return (
    <>
      <PageHeader
        title={unit.name}
        sub={`${unit.village} · ${unit.block} · ${unit.district} · ${unit.populationServed.toLocaleString()} ${t("people served")}`}
        right={<Link className="btn" href="/">← {t("Live Map")}</Link>}
      />

      {reason === "unverified" && (
        <Notice tone="info">
          <b>{t("Treated, but unverified.")}</b> {t("This unit is in a uranium district. Uranium cannot be measured on site, so it cannot show green until a lab result under 60 days old is entered.")}
        </Notice>
      )}
      {reason === "offline" && (
        <Notice tone="warn">{t("Unit not heard from for")} {ago(unit.lastSeen, now)}. {t("Values below are the last ones it synced.")}</Notice>
      )}
      {msg && <Notice tone="info">{msg}</Notice>}

      <div className="grid3">
        <Card title={t("Status")}>
          <dl className="kv">
            <dt>{t("Status")}</dt><dd><StatusBadge status={status} /></dd>
            <dt>{t("Water class")}</dt><dd><ClassBadge cls={unit.currentClass} /></dd>
            {unit.currentClass && <><dt>{t("Action")}</dt><dd>{t(CLASS_INFO[unit.currentClass].action)}</dd></>}
            <dt>{t("Cycle counter")}</dt><dd><CyclePips count={unit.cycleCount} /></dd>
            <dt>{t("Last seen")}</dt><dd>{fmtDateTime(unit.lastSeen, lang)} ({ago(unit.lastSeen, now)})</dd>
            <dt>{t("Last verified")}</dt><dd><VerifyChip days={ver.daysSince} tone={ver.tone} /></dd>
          </dl>
        </Card>

        <Card title={t("Mine profile")}>
          <dl className="kv">
            <dt>{t("Mining type")}</dt><dd>{unit.mineProfile.type}</dd>
            <dt>{t("Nearest pit / pond")}</dt><dd>{unit.mineProfile.type === "none" ? "—" : `${(unit.mineProfile.distanceM / 1000).toFixed(1)} km`}</dd>
            <dt>{t("Position")}</dt><dd>{t(unit.mineProfile.position)}</dd>
            <dt>{t("Water source")}</dt><dd>{t(unit.mineProfile.sourceType)}</dd>
            <dt>{t("Fitted cartridge")}</dt><dd>{unit.fittedCartridge ?? "—"}</dd>
          </dl>
        </Card>

        <Card title={t("Cartridge life")} right={<TierBadge tier="ESTIMATED" />}>
          {carts.length ? carts.map((c) => {
            const life = cartridgeLife(c, unit.dailyLitres);
            const tone = life.usedFraction > 0.9 ? "red" : life.usedFraction > 0.75 ? "amber" : "green";
            return (
              <div key={c.id} className="card-b">
                <b>{t("Slot")} {c.slot} · {c.mediaType}</b>
                <Meter fraction={life.usedFraction} tone={tone} label={c.mediaType} />
                <small className="muted">
                  {Math.round(c.litresProcessed).toLocaleString()} L {t("used of")} ~{Math.round(life.predictedLitres).toLocaleString()} L {t("predicted breakthrough")}
                  {life.daysLeft !== null && ` · ≈ ${Math.round(life.daysLeft)} ${t("days left")}`}
                </small>
                {life.pressureLimited && <div><small className="err">{t("Pressure is climbing faster than litres alone predict.")} ΔP {c.dpNowKpa.toFixed(0)} / {c.dpLimitKpa.toFixed(0)} kPa</small></div>}
              </div>
            );
          }) : <Empty>{t("No active cartridge on record.")}</Empty>}
        </Card>
      </div>

      <ContactPanel unit={unit} ver={ver} alerts={alerts} reports={reports} now={now} />

      <Card
        title={t("Sensor values")}
        right={
          <div className="tabs" style={{ border: 0, padding: 0 }}>
            {TAPS.map((x) => <button key={x} type="button" className={tap === x ? "on" : ""} onClick={() => setTap(x)}>{t(TAP_LABEL[x])}</button>)}
          </div>
        }
      >
        {tapReading ? (
          <>
            <div className="paramgrid">
              {SENSOR_PARAMS.map((p) => {
                const v = tapReading[p];
                const bad = v !== null && v !== undefined && isOutOfLimit(p, v);
                return (
                  <div key={p} className={`param ${bad ? "bad" : ""}`}>
                    <span className="pl">{paramLabel(p, lang)}</span>
                    <span className="pv">{p === "flow" && v === 0 ? t("No flow") : <>{fmtValue(p, v)} <small>{PARAMS[p].unit}</small></>}</span>
                    {p === "flow" && v === 0 && <small className="muted">{t("Batch complete")}</small>}
                    <span>{v !== null && v !== undefined && <TierBadge tier={tapReading.confidenceTier} />}{bad && <b className="err"> ✕ {t("over limit")}</b>}</span>
                  </div>
                );
              })}
            </div>
            <p className="muted pad">{t("Read at")} {fmtDateTime(tapReading.timestamp, lang)}</p>
          </>
        ) : <Empty>{t("No reading at this tap point yet.")}</Empty>}
      </Card>

      <Card title={t("Before / after treatment")}>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("Parameter")}</th>
                {TAPS.map((x) => <th key={x} className="r">{t(TAP_LABEL[x])}</th>)}
                <th className="r">{t("Removed")}</th>
              </tr>
            </thead>
            <tbody>
              {SCORED_PARAMS.map((p) => {
                const val = (x: TapPoint): number | null => {
                  if (PARAMS[p].kind === "sensor") return (latestByTap[x]?.[p as SensorParam] as number | null | undefined) ?? null;
                  return latestChem[p]?.[x]?.value ?? null;
                };
                const raw = val("raw");
                const fin = val("final");
                const removed = raw !== null && fin !== null && raw !== 0 && p !== "pH" ? ((raw - fin) / raw) * 100 : null;
                return (
                  <tr key={p}>
                    <td>{paramLabel(p, lang)} <span className="muted">{PARAMS[p].unit}</span></td>
                    {TAPS.map((x) => {
                      const v = val(x);
                      return <td key={x} className={`num ${v !== null && isOutOfLimit(p, v) ? "bad" : ""}`}>{fmtValue(p, v)}</td>;
                    })}
                    <td className="num">{removed === null ? "—" : `${removed.toFixed(0)} %`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted pad">{t("Colorimetric chemistry is tested in the raw and treated chambers only. Red numbers are over the acceptable limit.")}</p>
      </Card>

      <div className="grid2">
        <Card title={t("Carousel chemistry (raw chamber)")}>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>{t("Parameter")}</th><th className="r">{t("Value")}</th><th className="r">{t("Limit")}</th><th>{t("Method")}</th><th>{t("Tier")}</th><th>{t("Tested")}</th></tr></thead>
              <tbody>
                {CHEM_PARAMS.filter((p) => latestChem[p]?.raw).map((p) => {
                  const c = latestChem[p]!.raw!;
                  const lim = PARAMS[p];
                  return (
                    <tr key={p}>
                      <td>{paramLabel(p, lang)}</td>
                      <td className={`num ${isOutOfLimit(p, c.value) ? "bad" : ""}`}>{fmtValue(p, c.value)} {lim.unit}</td>
                      <td className="num">{lim.max ?? "—"}</td>
                      <td>{c.method}</td>
                      <td><TierBadge tier={c.confidenceTier} /></td>
                      <td>{ago(c.timestamp, now)}</td>
                    </tr>
                  );
                })}
                {!Object.keys(latestChem).length && <tr><td colSpan={6}><Empty>{t("No chemistry tests yet.")}</Empty></td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title={t("Estimates and declared blind spots")}>
          <div className="card-b">
            <p>
              <b>{t("Microbial risk")}</b> <TierBadge tier="ESTIMATED" />{" "}
              {micro ? `${Math.round(micro.p * 100)} % (${Math.round(micro.lo * 100)}–${Math.round(micro.hi * 100)} %)` : t("not estimated")}
            </p>
            <p>
              <b>{t("Mining signature")}</b> <TierBadge tier="ESTIMATED" />{" "}
              {leachate.flag ? (
                <span className="badge s-amber"><span className="glyph">!</span>{t("Neutral-pH leachate suspected")}</span>
              ) : leachate.ecPct === null ? t("not enough history") : t("no leachate signature")}
            </p>
            {leachate.ecPct !== null && (
              <p className="muted">
                EC {leachate.ecPct >= 0 ? "+" : ""}{leachate.ecPct.toFixed(0)} %
                {leachate.hardnessPct !== null && `, ${t("hardness")} ${leachate.hardnessPct >= 0 ? "+" : ""}${leachate.hardnessPct.toFixed(0)} %`}
                {leachate.phDelta !== null && `, pH ${leachate.phDelta >= 0 ? "+" : ""}${leachate.phDelta.toFixed(2)}`} ({t("last 30 d vs prior months")})
              </p>
            )}
          </div>
          <div className="card-b">
            {(["uranium", "arsenic", "bacterial"] as const).map((type) => {
              const pend = pendingOf(type);
              const last = lastOf(type);
              return (
                <div key={type} className="blind" style={{ marginBottom: 8 }}>
                  <b>{type === "bacterial" ? t("Live pathogen count") : type === "uranium" ? t("Uranium") : t("Arsenic")}</b> <TierBadge tier="UNVERIFIABLE" />
                  <div>
                    {pend
                      ? <>{t("Unverified, lab sample pending")}: {pend.sampleId} ({daysBetween(pend.collectedDate, now)} d)</>
                      : <>{t("Cannot be measured on site.")} {last ? <>{t("Last lab result")}: <b>{last.result === "pass" ? `✓ ${t("pass")}` : `✕ ${t("fail")}`}</b> {fmtDate(last.resultDate, lang)}.</> : t("No lab result on record.")}</>}
                  </div>
                  {!pend && <button type="button" className="btn sm" disabled={busy} onClick={() => request(type)} style={{ marginTop: 6 }}>{t("Request lab sample")}</button>}
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card
        title={t("Trend")}
        right={
          <div className="filters" style={{ margin: 0 }}>
            <label>{t("Parameter")}
              <select value={chartParam} onChange={(e) => setChartParam(e.target.value as ParamId)}>
                {[...SENSOR_PARAMS.filter((p) => p !== "flow" && p !== "waterLevel" && p !== "pressureDrop"), ...CHEM_PARAMS.filter((p) => p !== "freeChlorine")].map((p) => <option key={p} value={p}>{paramLabel(p, lang)}</option>)}
              </select>
            </label>
            <label>{t("Range")}
              <select value={range} onChange={(e) => setRange(e.target.value)}>{RANGES.map((r) => <option key={r.key} value={r.key}>{t(r.label)}</option>)}</select>
            </label>
          </div>
        }
      >
        <LineChart
          series={[{ name: `${paramLabel(chartParam, lang)} (${t("raw source")})`, color: "#0b5cad", points: chartPts }]}
          thresholds={PARAMS[chartParam].max !== undefined ? [{ y: PARAMS[chartParam].max!, label: `${t("limit")} ${PARAMS[chartParam].max}` }] : []}
          unit={PARAMS[chartParam].unit}
        />
      </Card>

      <Card title={t("Field test log")}>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>{t("Sample")}</th><th>{t("Type")}</th><th>{t("Collected")}</th><th>{t("Status")}</th><th>{t("Result")}</th><th className="r">{t("Days since")}</th></tr></thead>
            <tbody>
              {tests.map((f) => (
                <tr key={f.id}>
                  <td className="mono">{f.sampleId}</td>
                  <td>{t(f.type)}</td>
                  <td>{fmtDate(f.collectedDate, lang)}</td>
                  <td>{f.status === "pending" ? <span className="badge s-blue"><span className="glyph">?</span>{t("Pending")}</span> : t("Resulted")}</td>
                  <td>{f.status === "pending" ? "—" : f.result === "pass" ? <span className="ok-text">✓ {t("pass")}</span> : <span className="err">✕ {t("fail")}</span>}</td>
                  <td className="num">{daysBetween(f.status === "pending" ? f.collectedDate : f.resultDate ?? f.collectedDate, now)}</td>
                </tr>
              ))}
              {!tests.length && <tr><td colSpan={6}><Empty>{t("No field tests on record.")}</Empty></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={`${t("Alerts")} (${unitAlerts.length})`}><AlertList alerts={unitAlerts} showUnit={false} /></Card>

      <Card title={t("Maintenance history")}>
        <form className="form-row" onSubmit={submitMaint} style={{ borderTop: 0 }}>
          <label>{t("Kind")}<select value={mKind} onChange={(e) => setMKind(e.target.value as MaintenanceEntry["kind"])}>{MAINT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
          <label style={{ flex: 1, minWidth: 200 }}>{t("Note")}<input value={mNote} onChange={(e) => setMNote(e.target.value)} placeholder={t("What was done")} /></label>
          <button className="btn primary" disabled={busy || !mNote.trim()}>{t("Log maintenance")}</button>
        </form>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>{t("When")}</th><th>{t("Kind")}</th><th>{t("Note")}</th><th>{t("Officer")}</th></tr></thead>
            <tbody>
              {maint.map((m) => <tr key={m.id}><td>{fmtDate(m.timestamp, lang)}</td><td>{m.kind}</td><td>{m.note}</td><td>{m.officerName}</td></tr>)}
              {!maint.length && <tr><td colSpan={4}><Empty>{t("No maintenance logged.")}</Empty></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
