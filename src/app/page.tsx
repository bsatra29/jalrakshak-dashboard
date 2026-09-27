"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AlertList from "@/components/AlertList";
import { fold, loadVillages, type Village } from "@/lib/villages";
import MapView, { type MapBlob, type MapMarker, type MapRing } from "@/components/MapView";
import { Card, ClassBadge, CyclePips, Empty, PageHeader, Stat, StatusBadge, STATUS_GLYPH, STATUS_LABEL, STATUS_ORDER, VerifyChip } from "@/components/ui";
import { useData } from "@/context/DataProvider";
import { useLang } from "@/context/LangProvider";
import { heatIntensity } from "@/lib/analysis";
import { ago } from "@/lib/format";
import { CONTAMINANT_FILTERS, isOutOfLimit, paramLabel } from "@/lib/thresholds";
import type { MineFeatureType, MineType, ParamId, Status } from "@/lib/types";

const MINE_RING: Record<MineFeatureType, { r: number; color: string; glyph: string; cls: string; label: string }> = {
  colliery: { r: 3000, color: "#3b2f2f", glyph: "C", cls: "mine", label: "Colliery" },
  tailingPond: { r: 2000, color: "#6a3fb5", glyph: "T", cls: "mine-tail", label: "Tailing pond" },
  washery: { r: 1500, color: "#7a5c1a", glyph: "W", cls: "mine-wash", label: "Washery" },
  dump: { r: 1000, color: "#555555", glyph: "D", cls: "mine-dump", label: "Overburden dump" },
};

const MINE_TYPES: MineType[] = ["coal", "uranium", "chromite", "iron ore", "quarry", "none"];

export default function LiveMapPage() {
  const { t, lang } = useLang();
  const { units, unitStates, mines, alerts, now } = useData();

  const [district, setDistrict] = useState("");
  const [block, setBlock] = useState("");
  const [mineType, setMineType] = useState<"" | MineType>("");
  const [status, setStatus] = useState<"" | Status>("");
  const [contaminant, setContaminant] = useState<"" | ParamId | "uranium">("");
  const [showMines, setShowMines] = useState(true);
  const [showHeat, setShowHeat] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [showVillages, setShowVillages] = useState(true);
  const [villages, setVillages] = useState<Village[]>([]);
  const [vq, setVq] = useState("");
  const [focus, setFocus] = useState<Village | null>(null);

  useEffect(() => {
    loadVillages().then(setVillages).catch(() => {});
  }, []);

  const districts = useMemo(() => [...new Set([...units.map((u) => u.district), ...villages.map((v) => v.district)])].sort(), [units, villages]);
  const villageHits = useMemo(() => {
    const q = fold(vq.trim());
    if (q.length < 2) return [];
    return villages.filter((v) => (!district || v.district === district) && fold(v.name).includes(q))
      .sort((a, b) => Number(!fold(a.name).startsWith(q)) - Number(!fold(b.name).startsWith(q)) || a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [villages, vq, district]);
  const blocks = useMemo(() => [...new Set(units.filter((u) => !district || u.district === district).map((u) => u.block))].sort(), [units, district]);

  const filtered = useMemo(
    () =>
      units.filter((u) => {
        const s = unitStates[u.id];
        if (!s) return false;
        if (district && u.district !== district) return false;
        if (block && u.block !== block) return false;
        if (mineType && u.mineProfile.type !== mineType) return false;
        if (status && s.status !== status) return false;
        if (contaminant === "uranium") return u.mineProfile.type === "uranium" || s.ver.pending.some((p) => p.type === "uranium");
        if (contaminant) {
          const v = u.latest[contaminant]?.value;
          return v !== undefined && isOutOfLimit(contaminant, v);
        }
        return true;
      }),
    [units, unitStates, district, block, mineType, status, contaminant],
  );

  const stats = useMemo(() => {
    const all = Object.values(unitStates);
    return {
      online: all.filter((s) => s.status !== "grey").length,
      red: all.filter((s) => s.status === "red").length,
      overdue: all.filter((s) => s.ver.overdue).length,
      unacked: alerts.filter((a) => !a.acknowledgedAt).length,
    };
  }, [unitStates, alerts]);

  const markers: MapMarker[] = useMemo(() => {
    const out: MapMarker[] = filtered.map((u) => ({
      id: u.id,
      lat: u.lat,
      lng: u.lng,
      status: unitStates[u.id].status,
      label: `${u.name} · ${t(STATUS_LABEL[unitStates[u.id].status])}`,
    }));
    if (showMines) {
      for (const m of mines) {
        const s = MINE_RING[m.type];
        out.push({ id: `mine:${m.id}`, lat: m.lat, lng: m.lng, glyph: s.glyph, cls: s.cls, size: 22, label: `${t(s.label)}: ${m.name} (${m.operator})` });
      }
    }
    return out;
  }, [filtered, unitStates, mines, showMines, t]);

  const rings: MapRing[] = useMemo(
    () => (showMines ? mines.map((m) => ({ lat: m.lat, lng: m.lng, radiusM: MINE_RING[m.type].r, color: MINE_RING[m.type].color, dashed: true })) : []),
    [mines, showMines],
  );

  const blobs: MapBlob[] = useMemo(
    () => (showHeat ? filtered.map((u) => ({ lat: u.lat, lng: u.lng, intensity: heatIntensity(u, mines) })) : []),
    [filtered, mines, showHeat],
  );

  const sel = selected && unitStates[selected] ? unitStates[selected] : null;
  const unacked = alerts.filter((a) => !a.acknowledgedAt).sort((a, b) => a.raisedAt - b.raisedAt);
  const fitKey = `${district}|${block}|${mineType}|${status}|${contaminant}|${units.length}`;

  const sorted = [...filtered].sort(
    (a, b) => STATUS_ORDER.indexOf(unitStates[a.id].status) - STATUS_ORDER.indexOf(unitStates[b.id].status) || a.name.localeCompare(b.name),
  );

  return (
    <>
      <PageHeader title={t("Live Map")} sub={t("Every unit, coloured by what it is safe to say about its water right now.")} />

      <div className="stats">
        <Stat label={t("Units online")} value={`${stats.online} / ${units.length}`} tone="green" />
        <Stat label={t("Units red")} value={stats.red} tone="red" onClick={() => setStatus(status === "red" ? "" : "red")} sub={status === "red" ? t("Filter on, click to clear") : t("Click to filter")} />
        <Stat label={t("Lab tests overdue")} value={stats.overdue} tone="blue" sub={t("No lab result in 60 d, or sample pending over 14 d")} />
        <Stat label={t("Unacknowledged alerts")} value={stats.unacked} tone="amber" />
      </div>

      <div className="filters">
        <label>
          {t("District")}
          <select value={district} onChange={(e) => { setDistrict(e.target.value); setBlock(""); }}>
            <option value="">{t("All")}</option>
            {districts.map((d) => <option key={d}>{d}</option>)}
          </select>
        </label>
        <label>
          {t("Block")}
          <select value={block} onChange={(e) => setBlock(e.target.value)}>
            <option value="">{t("All")}</option>
            {blocks.map((d) => <option key={d}>{d}</option>)}
          </select>
        </label>
        <label>
          {t("Mine type")}
          <select value={mineType} onChange={(e) => setMineType(e.target.value as MineType | "")}>
            <option value="">{t("All")}</option>
            {MINE_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label>
          {t("Status")}
          <select value={status} onChange={(e) => setStatus(e.target.value as Status | "")}>
            <option value="">{t("All")}</option>
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_GLYPH[s]} {t(STATUS_LABEL[s])}</option>)}
          </select>
        </label>
        <label>
          {t("Contaminant over limit")}
          <select value={contaminant} onChange={(e) => setContaminant(e.target.value as ParamId | "uranium" | "")}>
            <option value="">{t("Any")}</option>
            {CONTAMINANT_FILTERS.map((p) => <option key={p} value={p}>{paramLabel(p, lang)}</option>)}
            <option value="uranium">{t("Uranium (unverified)")}</option>
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={showVillages} onChange={(e) => setShowVillages(e.target.checked)} /> {t("Villages")} ({villages.length.toLocaleString()})</label>
        <label className="check"><input type="checkbox" checked={showMines} onChange={(e) => setShowMines(e.target.checked)} /> {t("Mining overlay")}</label>
        <label className="check"><input type="checkbox" checked={showHeat} onChange={(e) => setShowHeat(e.target.checked)} /> {t("Contamination heatmap")}</label>
        {(district || block || mineType || status || contaminant) && (
          <button type="button" className="btn sm" onClick={() => { setDistrict(""); setBlock(""); setMineType(""); setStatus(""); setContaminant(""); }}>{t("Clear filters")}</button>
        )}
      </div>

      <div className="split">
        <div>
          <div className="village-search">
            <input type="search" placeholder={t("Search village")} aria-label={t("Search village")} value={vq} onChange={(e) => setVq(e.target.value)} />
            {villageHits.length > 0 && (
              <ul>
                {villageHits.map((v) => (
                  <li key={`${v.name}|${v.lat}|${v.lng}`}>
                    <button type="button" onClick={() => { setFocus(v); setShowVillages(true); setVq(""); }}>
                      {v.name} <small className="muted">{v.district}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <MapView markers={markers} rings={rings} blobs={blobs} selectedId={selected} fitKey={fitKey} onSelect={(id) => !id.startsWith("mine:") && setSelected(id)} showVillages={showVillages} villageDistrict={district} focus={focus} />
          <div className="legend-box">
            {STATUS_ORDER.map((s) => <StatusBadge key={s} status={s} />)}
            {showMines && Object.values(MINE_RING).map((m) => <span key={m.glyph}><b>{m.glyph}</b> {t(m.label)} ({m.r / 1000} km {t("ring")})</span>)}
            {showHeat && <span>{t("Heat: contamination × closeness to mining features")}</span>}
            {showVillages && <span>○ {t("Villages")}: OpenStreetMap</span>}
          </div>
        </div>

        <Card title={sel ? sel.unit.name : t("Select a unit")}>
          {sel ? (
            <>
              <dl className="kv">
                <dt>{t("Status")}</dt>
                <dd>
                  <StatusBadge status={sel.status} />
                  {sel.reason === "unverified" && <div className="muted">{t("Unverified, lab sample pending")}</div>}
                  {sel.reason === "lab-fail" && <div className="muted">{t("Lab result failed")}</div>}
                </dd>
                <dt>{t("Village")}</dt><dd>{sel.unit.village}, {sel.unit.block}, {sel.unit.district}</dd>
                <dt>{t("Water class")}</dt><dd><ClassBadge cls={sel.unit.currentClass} /></dd>
                <dt>{t("Cycles")}</dt><dd><CyclePips count={sel.unit.cycleCount} /></dd>
                <dt>{t("Last verified")}</dt><dd><VerifyChip days={sel.ver.daysSince} tone={sel.ver.tone} /></dd>
                <dt>{t("Last seen")}</dt><dd>{ago(sel.unit.lastSeen, now)} {t("ago")}</dd>
                <dt>{t("Mine profile")}</dt>
                <dd>{sel.unit.mineProfile.type}{sel.unit.mineProfile.type !== "none" && `, ${(sel.unit.mineProfile.distanceM / 1000).toFixed(1)} km, ${t(sel.unit.mineProfile.position)}`}, {t(sel.unit.mineProfile.sourceType)}</dd>
              </dl>
              <div className="form-row"><Link className="btn primary" href={`/units/${sel.unit.id}`}>{t("Open unit detail")}</Link></div>
            </>
          ) : (
            <Empty>{t("Click a pin on the map, or a row below.")}</Empty>
          )}
        </Card>
      </div>

      <Card title={`${t("Units")} (${filtered.length})`}>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("Unit")}</th><th>{t("District / block")}</th><th>{t("Status")}</th><th>{t("Class")}</th><th>{t("Cycles")}</th><th>{t("Last verified")}</th><th>{t("Last seen")}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((u) => {
                const s = unitStates[u.id];
                return (
                  <tr key={u.id} className={selected === u.id ? "row-sel" : ""} onClick={() => setSelected(u.id)}>
                    <td><Link href={`/units/${u.id}`}>{u.name}</Link><div className="muted">{u.village}</div></td>
                    <td>{u.district}<div className="muted">{u.block}</div></td>
                    <td><StatusBadge status={s.status} /></td>
                    <td><ClassBadge cls={u.currentClass} /></td>
                    <td>{u.cycleCount} / 3</td>
                    <td><VerifyChip days={s.ver.daysSince} tone={s.ver.tone} /></td>
                    <td>{ago(u.lastSeen, now)}</td>
                  </tr>
                );
              })}
              {!sorted.length && <tr><td colSpan={7}><Empty>{t("No units match these filters.")}</Empty></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={`${t("Unacknowledged alerts")} (${unacked.length})`}>
        <AlertList alerts={unacked} />
      </Card>
    </>
  );
}
