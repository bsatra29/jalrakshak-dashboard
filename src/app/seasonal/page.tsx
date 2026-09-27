"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CompareBars, LineChart, type Series } from "@/components/Charts";
import { Card, Empty, Loading, PageHeader } from "@/components/ui";
import { useData, useFleetHistory } from "@/context/DataProvider";
import { useLang } from "@/context/LangProvider";
import { paramSeries, type Pt } from "@/lib/analysis";
import { fmtMonth, mean, pctChange } from "@/lib/format";
import { PARAMS, SCORED_PARAMS, fmtValue, paramLabel } from "@/lib/thresholds";
import type { ParamId, Unit } from "@/lib/types";

type Season = "pre" | "monsoon" | "post" | "winter";

/** Jharkhand: monsoon Jun–Sep, post-monsoon Oct–Nov, pre-monsoon Mar–May. */
function seasonOf(ts: number): Season {
  const m = new Date(ts).getMonth();
  if (m >= 2 && m <= 4) return "pre";
  if (m >= 5 && m <= 8) return "monsoon";
  if (m === 9 || m === 10) return "post";
  return "winter";
}

const LEACH_PARAMS: ParamId[] = ["ec", "sulphate", "iron", "hardness"];

export default function SeasonalPage() {
  const { t, lang } = useLang();
  const { units } = useData();
  const hist = useFleetHistory();
  const [district, setDistrict] = useState("");
  const [param, setParam] = useState<ParamId>("ec");

  const districts = useMemo(() => [...new Set(units.map((u) => u.district))].sort(), [units]);
  const scoped = useMemo(() => units.filter((u) => !district || u.district === district), [units, district]);
  const ready = hist.state === "ready";

  /** Per-unit series for a parameter, cached for the render. */
  const series = useMemo(() => {
    const out = new Map<string, Map<ParamId, Pt[]>>();
    if (!ready) return out;
    for (const u of scoped) {
      const m = new Map<ParamId, Pt[]>();
      for (const p of SCORED_PARAMS) m.set(p, paramSeries(hist.readings[u.id] ?? [], hist.chem[u.id] ?? [], p));
      out.set(u.id, m);
    }
    return out;
  }, [scoped, hist, ready]);

  const seasonMean = (u: Unit, p: ParamId, s: Season) => mean((series.get(u.id)?.get(p) ?? []).filter((x) => seasonOf(x.t) === s).map((x) => x.v));

  const table = useMemo(
    () =>
      SCORED_PARAMS.map((p) => {
        const pre = mean(scoped.map((u) => seasonMean(u, p, "pre")).filter((v): v is number => v !== null));
        const post = mean(scoped.map((u) => seasonMean(u, p, "post")).filter((v): v is number => v !== null));
        return { p, pre, post, pct: pctChange(pre, post) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, series],
  );

  const leaching = useMemo(() => {
    const out: { unit: Unit; hits: { p: ParamId; pct: number }[] }[] = [];
    for (const u of scoped) {
      const hits = LEACH_PARAMS.map((p) => ({ p, pct: pctChange(seasonMean(u, p, "pre"), seasonMean(u, p, "post")) }))
        .filter((h): h is { p: ParamId; pct: number } => h.pct !== null && h.pct >= 25);
      if (hits.length >= 2) out.push({ unit: u, hits });
    }
    return out.sort((a, b) => b.hits.length - a.hits.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, series]);

  const split = useMemo(
    () =>
      SCORED_PARAMS.map((p) => {
        const by = (src: "groundwater" | "surface") =>
          mean(scoped.filter((u) => u.mineProfile.sourceType === src).flatMap((u) => (series.get(u.id)?.get(p) ?? []).map((x) => x.v)));
        return { p, gw: by("groundwater"), sw: by("surface") };
      }),
    [scoped, series],
  );

  /** Monthly means, one point per calendar month. */
  const monthly = useMemo(() => {
    const bucket = (us: Unit[]): Pt[] => {
      const m = new Map<string, { t: number; vs: number[] }>();
      for (const u of us) for (const x of series.get(u.id)?.get(param) ?? []) {
        const d = new Date(x.t);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        const b = m.get(key) ?? { t: new Date(d.getFullYear(), d.getMonth(), 15).getTime(), vs: [] };
        b.vs.push(x.v);
        m.set(key, b);
      }
      return [...m.values()].map((b) => ({ t: b.t, v: mean(b.vs)! })).sort((a, b) => a.t - b.t);
    };
    const out: Series[] = [
      { name: t("Groundwater units"), color: "#0b5cad", points: bucket(scoped.filter((u) => u.mineProfile.sourceType === "groundwater")) },
      { name: t("Surface water units"), color: "#c2410c", dash: "6 4", points: bucket(scoped.filter((u) => u.mineProfile.sourceType === "surface")) },
    ];
    return out.filter((s) => s.points.length);
  }, [scoped, series, param, t]);

  const lastPt = monthly.flatMap((s) => s.points).sort((a, b) => b.t - a.t)[0];

  return (
    <>
      <PageHeader title={t("Seasonal & Trend")} sub={t("Monsoon dilutes; the months after it are when mine waste leaches into groundwater.")} />
      <div className="filters">
        <label>{t("District")}<select value={district} onChange={(e) => setDistrict(e.target.value)}><option value="">{t("All")}</option>{districts.map((d) => <option key={d}>{d}</option>)}</select></label>
      </div>
      {!ready ? <Loading /> : (
        <>
          <div className="grid2">
            <Card title={t("Pre-monsoon (Mar–May) vs post-monsoon (Oct–Nov)")}>
              <div className="tbl-wrap">
                <table>
                  <thead><tr><th>{t("Parameter")}</th><th className="r">{t("Pre")}</th><th className="r">{t("Post")}</th><th className="r">{t("Change")}</th></tr></thead>
                  <tbody>
                    {table.map((r) => (
                      <tr key={r.p} onClick={() => setParam(r.p)} style={{ cursor: "pointer" }} className={param === r.p ? "row-sel" : ""}>
                        <td>{paramLabel(r.p, lang)} <span className="muted">{PARAMS[r.p].unit}</span></td>
                        <td className="num">{fmtValue(r.p, r.pre)}</td>
                        <td className="num">{fmtValue(r.p, r.post)}</td>
                        <td className={`num ${r.pct !== null && r.pct >= 25 ? "bad" : ""}`}>{r.pct === null ? "—" : `${r.pct >= 0 ? "▲ +" : "▼ "}${r.pct.toFixed(0)} %`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted pad">{t("Fleet mean of raw-source values. Click a row to chart it below.")}</p>
            </Card>

            <Card title={t("Groundwater vs surface water")}>
              <CompareBars
                aName={t("Groundwater")}
                bName={t("Surface water")}
                rows={split.filter((s) => ["ec", "tds", "hardness", "sulphate", "iron", "turbidity"].includes(s.p)).map((s) => ({ label: paramLabel(s.p, lang), a: s.gw, b: s.sw }))}
              />
            </Card>
          </div>

          <Card title={`${t("Post-monsoon leaching alerts")} (${leaching.length})`}>
            {leaching.length ? (
              <div className="tbl-wrap">
                <table>
                  <thead><tr><th>{t("Unit")}</th><th>{t("Mine profile")}</th><th>{t("Rose 25 % or more after the monsoon")}</th></tr></thead>
                  <tbody>
                    {leaching.map(({ unit, hits }) => (
                      <tr key={unit.id}>
                        <td><Link href={`/units/${unit.id}`}>{unit.name}</Link><div className="muted">{unit.district}</div></td>
                        <td>{unit.mineProfile.type}, {t(unit.mineProfile.sourceType)}</td>
                        <td>{hits.map((h) => <span key={h.p} className="badge s-amber" style={{ marginRight: 6 }}><span className="glyph">▲</span>{paramLabel(h.p, lang)} +{h.pct.toFixed(0)} %</span>)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty>{t("No unit shows two or more leaching indicators up by 25 % after the monsoon.")}</Empty>}
            <p className="muted pad">{t("This is a slow trend, not an event: it is handled by inspection of the source, not by an emergency response.")}</p>
          </Card>

          <Card
            title={t("12-month trend")}
            right={<label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>{t("Parameter")}<select value={param} onChange={(e) => setParam(e.target.value as ParamId)}>{SCORED_PARAMS.map((p) => <option key={p} value={p}>{paramLabel(p, lang)}</option>)}</select></label>}
          >
            <LineChart
              series={monthly}
              thresholds={PARAMS[param].max !== undefined ? [{ y: PARAMS[param].max!, label: `${t("limit")} ${PARAMS[param].max}` }] : []}
              unit={PARAMS[param].unit}
            />
            <p className="muted pad">{t("Monthly means across the selected units.")} {lastPt && `${t("Latest month")}: ${fmtMonth(lastPt.t, lang)}.`} {t("Monsoon months (Jun–Sep) show dilution in conductivity and a rise in turbidity.")}</p>
          </Card>
        </>
      )}
    </>
  );
}
