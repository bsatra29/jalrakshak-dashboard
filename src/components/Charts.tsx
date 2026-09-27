"use client";

import { useEffect, useMemo, useState } from "react";
import { useLang } from "@/context/LangProvider";
import { fmtDate } from "@/lib/format";

export type Series = {
  name: string;
  color: string;
  dash?: string;
  points: { t: number; v: number }[];
};

export type ChartMarker = { t: number; label: string; kind: "event" | "mine" };
export type Threshold = { y: number; label: string };

const W = 820;
const H = 280;
const M = { l: 52, r: 44, t: 14, b: 30 };

function niceTicks(min: number, max: number, n = 5): number[] {
  if (max === min) return [min];
  const raw = (max - min) / n;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * pow).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 0.001; v += step) out.push(+v.toFixed(6));
  return out;
}

const shortNum = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : Number.isInteger(v) ? String(v) : v.toFixed(Math.abs(v) < 1 ? 2 : 1));

/**
 * Viewport width bucket, re-read on resize. The chart itself scales fluidly
 * via the SVG's viewBox, but the NUMBER of x-axis labels that fit does not —
 * six dates crowd and overlap on a 375px phone. Defaults to "desktop" for the
 * server-rendered pass, then corrects on mount.
 */
function useViewportBucket(): "phone" | "tablet" | "desktop" {
  const [bucket, setBucket] = useState<"phone" | "tablet" | "desktop">("desktop");
  useEffect(() => {
    const pick = () => (window.innerWidth < 480 ? "phone" : window.innerWidth < 860 ? "tablet" : "desktop");
    const onResize = () => setBucket(pick());
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return bucket;
}

/**
 * Multi-series time chart with optional rainfall bars on a right axis,
 * threshold lines and event markers. Series are told apart by dash pattern
 * and legend, not by colour alone.
 */
export function LineChart({
  series,
  thresholds = [],
  markers = [],
  bars,
  barsLabel,
  unit,
  height = H,
}: {
  series: Series[];
  thresholds?: Threshold[];
  markers?: ChartMarker[];
  bars?: { t: number; v: number }[];
  barsLabel?: string;
  unit?: string;
  height?: number;
}) {
  const { lang } = useLang();
  const [hover, setHover] = useState<number | null>(null);
  const bucket = useViewportBucket();
  const xTickCount = bucket === "phone" ? 3 : bucket === "tablet" ? 4 : 6;

  const geo = useMemo(() => {
    const all = series.flatMap((s) => s.points);
    if (!all.length) return null;
    let t0 = Math.min(...all.map((p) => p.t));
    let t1 = Math.max(...all.map((p) => p.t));
    if (bars?.length) {
      t0 = Math.min(t0, ...bars.map((b) => b.t));
      t1 = Math.max(t1, ...bars.map((b) => b.t));
    }
    if (t0 === t1) t1 = t0 + 1;
    let y0 = Math.min(...all.map((p) => p.v), ...thresholds.map((x) => x.y));
    let y1 = Math.max(...all.map((p) => p.v), ...thresholds.map((x) => x.y));
    const pad = (y1 - y0) * 0.08 || 1;
    y0 = y0 >= 0 && y0 - pad < 0 ? 0 : y0 - pad;
    y1 += pad;
    const bmax = bars?.length ? Math.max(...bars.map((b) => b.v), 1) : 1;
    return { t0, t1, y0, y1, bmax, yt: niceTicks(y0, y1) };
  }, [series, thresholds, bars]);

  if (!geo) return <p className="muted pad">No data in this range.</p>;
  const { t0, t1, y0, y1, bmax, yt } = geo;
  const px = (t: number) => M.l + ((t - t0) / (t1 - t0)) * (W - M.l - M.r);
  const py = (v: number) => H - M.b - ((v - y0) / (y1 - y0)) * (H - M.t - M.b);
  const xt = Array.from({ length: xTickCount }, (_, i) => t0 + ((t1 - t0) * i) / (xTickCount - 1));
  const bw = bars?.length ? Math.max(2, ((W - M.l - M.r) / bars.length) * 0.6) : 0;

  const primary = series[0]?.points ?? [];
  const nearest = hover === null || !primary.length ? null : primary.reduce((b, p) => (Math.abs(px(p.t) - hover) < Math.abs(px(b.t) - hover) ? p : b));

  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", maxHeight: height }}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(((e.clientX - r.left) / r.width) * W);
        }}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={series.map((s) => s.name).join(", ")}
      >
        {yt.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={py(v)} y2={py(v)} className="grid" />
            <text x={M.l - 6} y={py(v) + 4} textAnchor="end" className="axis">{shortNum(v)}</text>
          </g>
        ))}
        {xt.map((t, i) => (
          <text key={i} x={px(t)} y={H - 8} textAnchor="middle" className="axis">{fmtDate(t, lang).replace(/ \d{4}$/, "")}</text>
        ))}
        {bars?.map((b, i) => (
          <rect key={i} x={px(b.t) - bw / 2} width={bw} y={H - M.b - (b.v / bmax) * (H - M.t - M.b) * 0.45} height={(b.v / bmax) * (H - M.t - M.b) * 0.45} className="bar-rain" />
        ))}
        {bars?.length ? <text x={W - M.r + 4} y={M.t + 8} className="axis">{`${bmax.toFixed(0)} mm`}</text> : null}
        {thresholds.map((th) => (
          <g key={th.label}>
            <line x1={M.l} x2={W - M.r} y1={py(th.y)} y2={py(th.y)} className="thresh" />
            <text x={W - M.r - 4} y={py(th.y) - 4} textAnchor="end" className="axis thr">{th.label}</text>
          </g>
        ))}
        {markers.map((m, i) => (
          <g key={i}>
            <line x1={px(m.t)} x2={px(m.t)} y1={M.t} y2={H - M.b} className={m.kind === "mine" ? "mk-mine" : "mk-event"} />
            <text x={px(m.t)} y={M.t + 10 + (i % 3) * 10} textAnchor="middle" className="axis mk">{m.kind === "mine" ? "▲" : "●"}</text>
            <title>{`${m.label} · ${fmtDate(m.t, lang)}`}</title>
          </g>
        ))}
        {series.map((s) => (
          <g key={s.name}>
            <polyline
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeDasharray={s.dash}
              strokeLinejoin="round"
              points={s.points.map((p) => `${px(p.t).toFixed(1)},${py(p.v).toFixed(1)}`).join(" ")}
            />
            {s.points.length <= 60 && s.points.map((p, i) => <circle key={i} cx={px(p.t)} cy={py(p.v)} r="2.2" fill={s.color} />)}
          </g>
        ))}
        {nearest && (
          <g>
            <line x1={px(nearest.t)} x2={px(nearest.t)} y1={M.t} y2={H - M.b} className="cursor" />
          </g>
        )}
      </svg>
      {nearest && (
        <div className="tip">
          <b>{fmtDate(nearest.t, lang)}</b>
          {series.map((s) => {
            const p = s.points.reduce<{ t: number; v: number } | null>((b, q) => (!b || Math.abs(q.t - nearest.t) < Math.abs(b.t - nearest.t) ? q : b), null);
            return p ? (
              <span key={s.name} style={{ color: s.color }}>
                {s.name}: {p.v.toFixed(Math.abs(p.v) < 10 ? 2 : 0)} {unit}
              </span>
            ) : null;
          })}
        </div>
      )}
      <ul className="legend">
        {series.map((s) => (
          <li key={s.name}>
            <svg width="26" height="8" aria-hidden><line x1="0" x2="26" y1="4" y2="4" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dash} /></svg>
            {s.name}
          </li>
        ))}
        {bars?.length ? <li><span className="swatch rain" />{barsLabel}</li> : null}
        {markers.some((m) => m.kind === "event") && <li>● event</li>}
        {markers.some((m) => m.kind === "mine") && <li>▲ mine activity</li>}
        {thresholds.length > 0 && <li><svg width="26" height="8" aria-hidden><line x1="0" x2="26" y1="4" y2="4" className="thresh" /></svg>limit</li>}
      </ul>
    </div>
  );
}

/** Grouped horizontal bars: one row per label, two values compared. */
export function CompareBars({
  rows,
  aName,
  bName,
  unit,
}: {
  rows: { label: string; a: number | null; b: number | null }[];
  aName: string;
  bName: string;
  unit?: string;
}) {
  const max = Math.max(1e-9, ...rows.flatMap((r) => [r.a ?? 0, r.b ?? 0]));
  return (
    <div className="cbars">
      <ul className="legend">
        <li><span className="swatch a" />{aName}</li>
        <li><span className="swatch b" />{bName}</li>
      </ul>
      {rows.map((r) => (
        <div key={r.label} className="cbar-row">
          <span className="cbar-l">{r.label}</span>
          <div className="cbar-tracks">
            {([["a", r.a], ["b", r.b]] as const).map(([k, v]) => (
              <div key={k} className="cbar-track">
                <div className={`cbar-fill ${k}`} style={{ width: `${v === null ? 0 : (v / max) * 100}%` }} />
                <span className="cbar-v">{v === null ? "—" : v.toFixed(v < 10 ? 2 : 0)} {unit}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Small inline meter. Label always accompanies it. */
export function Meter({ fraction, tone = "green", label }: { fraction: number; tone?: "green" | "amber" | "red"; label: string }) {
  return (
    <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction * 100)} aria-label={label}>
      <div className={`meter-fill m-${tone}`} style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%` }} />
    </div>
  );
}
