"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { Empty, PageHeader, StatusBadge, Th, VerifyChip } from "@/components/ui";
import { useAuth } from "@/context/AuthProvider";
import { useData } from "@/context/DataProvider";
import { useLang } from "@/context/LangProvider";
import { enterLabResult } from "@/lib/actions";
import { daysBetween, fmtDate } from "@/lib/format";
import { LAB_OVERDUE_DAYS } from "@/lib/thresholds";
import type { FieldTest } from "@/lib/types";

type Sort = { key: string; dir: 1 | -1 };

const UNITS_OF: Record<string, string> = { uranium: "µg/L", arsenic: "µg/L", bacterial: "CFU/100 mL" };

export default function LabPage() {
  const { t, lang } = useLang();
  const { officer } = useAuth();
  const { fieldTests, unitStates, now } = useData();
  const [tab, setTab] = useState<"queue" | "clock" | "history">("queue");
  const [sort, setSort] = useState<Sort>({ key: "days", dir: -1 });
  const [entering, setEntering] = useState<FieldTest | null>(null);
  const [result, setResult] = useState<"pass" | "fail">("pass");
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pending = useMemo(() => fieldTests.filter((f) => f.status === "pending"), [fieldTests]);
  const resulted = useMemo(() => fieldTests.filter((f) => f.status === "resulted").sort((a, b) => (b.resultDate ?? 0) - (a.resultDate ?? 0)), [fieldTests]);

  const onSort = (key: string) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: -1 }));
  const cmp = <T,>(rows: T[], get: (r: T) => number | string) =>
    [...rows].sort((a, b) => {
      const x = get(a), y = get(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });

  const queueRows = cmp(pending, (f) => {
    if (sort.key === "unit") return unitStates[f.unitId]?.unit.name ?? "";
    if (sort.key === "type") return f.type;
    return daysBetween(f.collectedDate, now);
  });

  const clockRows = cmp(Object.values(unitStates), (s) => {
    if (sort.key === "unit") return s.unit.name;
    if (sort.key === "district") return s.unit.district;
    return s.ver.daysSince ?? 99999;
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!officer || !entering) return;
    setBusy(true);
    setErr(null);
    try {
      const num = value.trim() === "" ? null : Number(value);
      if (num !== null && !Number.isFinite(num)) throw new Error("Value must be a number");
      await enterLabResult(officer, entering, result, num, notes.trim());
      setEntering(null);
      setValue("");
      setNotes("");
      setResult("pass");
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const overdueCount = pending.filter((f) => daysBetween(f.collectedDate, now) > LAB_OVERDUE_DAYS).length;

  return (
    <>
      <PageHeader title={t("Lab Referral Queue")} sub={t("Uranium, arsenic and bacteria cannot be measured on site. A unit in a uranium district stays blue until a lab result comes back.")} />
      <div className="card">
        <div className="tabs">
          <button className={tab === "queue" ? "on" : ""} onClick={() => { setTab("queue"); setSort({ key: "days", dir: -1 }); }}>{t("Pending samples")} ({pending.length})</button>
          <button className={tab === "clock" ? "on" : ""} onClick={() => { setTab("clock"); setSort({ key: "days", dir: -1 }); }}>{t("Last-verified clock")}</button>
          <button className={tab === "history" ? "on" : ""} onClick={() => setTab("history")}>{t("Results entered")}</button>
        </div>

        {tab === "queue" && (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("Sample ID")}</th>
                  <Th sortKey="unit" sort={sort} onSort={onSort}>{t("Unit")}</Th>
                  <Th sortKey="type" sort={sort} onSort={onSort}>{t("Type")}</Th>
                  <th>{t("GPS")}</th><th>{t("Collected")}</th>
                  <Th sortKey="days" sort={sort} onSort={onSort} align="right">{t("Days pending")}</Th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {queueRows.map((f) => {
                  const d = daysBetween(f.collectedDate, now);
                  const over = d > LAB_OVERDUE_DAYS;
                  return (
                    <tr key={f.id}>
                      <td className="mono">{f.sampleId}</td>
                      <td><Link href={`/units/${f.unitId}`}>{unitStates[f.unitId]?.unit.name ?? f.unitId}</Link></td>
                      <td>{t(f.type)}</td>
                      <td className="mono">{f.gps.lat.toFixed(4)}, {f.gps.lng.toFixed(4)}</td>
                      <td>{fmtDate(f.collectedDate, lang)}</td>
                      <td className="num">{d} {over && <span className="badge s-red"><span className="glyph">!</span>{t("Overdue")}</span>}</td>
                      <td><button className="btn sm primary" onClick={() => { setEntering(f); setErr(null); }}>{t("Enter result")}</button></td>
                    </tr>
                  );
                })}
                {!pending.length && <tr><td colSpan={7}><Empty>{t("No samples pending.")}</Empty></td></tr>}
              </tbody>
            </table>
            {overdueCount > 0 && <p className="err pad">{overdueCount} {t("sample(s) pending longer than")} {LAB_OVERDUE_DAYS} {t("days")}.</p>}
          </div>
        )}

        {tab === "clock" && (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <Th sortKey="unit" sort={sort} onSort={onSort}>{t("Unit")}</Th>
                  <Th sortKey="district" sort={sort} onSort={onSort}>{t("District")}</Th>
                  <th>{t("Status")}</th>
                  <Th sortKey="days" sort={sort} onSort={onSort}>{t("Days since last lab verification")}</Th>
                  <th>{t("Pending")}</th>
                </tr>
              </thead>
              <tbody>
                {clockRows.map((s) => (
                  <tr key={s.unit.id}>
                    <td><Link href={`/units/${s.unit.id}`}>{s.unit.name}</Link></td>
                    <td>{s.unit.district}</td>
                    <td><StatusBadge status={s.status} /></td>
                    <td><VerifyChip days={s.ver.daysSince} tone={s.ver.tone} /></td>
                    <td>{s.ver.pending.length ? `${s.ver.pending.length} (${s.ver.oldestPendingDays} d)` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted pad">{t("Amber at 30 days, red at 60. A unit never verified is red.")}</p>
          </div>
        )}

        {tab === "history" && (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>{t("Sample ID")}</th><th>{t("Unit")}</th><th>{t("Type")}</th><th>{t("Result")}</th><th className="r">{t("Lab value")}</th><th>{t("Result date")}</th><th>{t("Entered by")}</th></tr></thead>
              <tbody>
                {resulted.map((f) => (
                  <tr key={f.id}>
                    <td className="mono">{f.sampleId}</td>
                    <td><Link href={`/units/${f.unitId}`}>{unitStates[f.unitId]?.unit.name ?? f.unitId}</Link></td>
                    <td>{t(f.type)}</td>
                    <td>{f.result === "pass" ? <span className="ok-text">✓ {t("pass")}</span> : <span className="err">✕ {t("fail")}</span>}</td>
                    <td className="num">{f.value === null ? "—" : `${f.value} ${UNITS_OF[f.type]}`}</td>
                    <td>{fmtDate(f.resultDate, lang)}</td>
                    <td>{f.enteredBy ?? "—"}</td>
                  </tr>
                ))}
                {!resulted.length && <tr><td colSpan={7}><Empty>{t("No results entered yet.")}</Empty></td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {entering && (
        <div className="modal-bg" role="dialog" aria-modal="true" aria-label={t("Enter lab result")}>
          <form className="modal" onSubmit={submit}>
            <h2>{t("Enter lab result")}</h2>
            <p className="muted">{entering.sampleId} · {t(entering.type)} · {unitStates[entering.unitId]?.unit.name}</p>
            <label>{t("Result against the limit")}
              <select value={result} onChange={(e) => setResult(e.target.value as "pass" | "fail")}>
                <option value="pass">✓ {t("Pass, within limit")}</option>
                <option value="fail">✕ {t("Fail, over limit")}</option>
              </select>
            </label>
            <label>{t("Lab value")} ({UNITS_OF[entering.type]}, {t("optional")})<input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} /></label>
            <label>{t("Notes")}<input value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
            <p className="muted">{result === "pass" ? t("A pass restarts the verification clock and, for uranium, lets the unit show green again.") : t("A fail turns the unit red immediately.")} {t("This entry is written to the audit log and cannot be edited.")}</p>
            {err && <p className="err">{err}</p>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn" onClick={() => setEntering(null)}>{t("Cancel")}</button>
              <button className="btn primary" disabled={busy}>{t("Save result")}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
