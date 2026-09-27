"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, Empty, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { useData } from "@/context/DataProvider";
import { useLang } from "@/context/LangProvider";
import { healthFlags } from "@/lib/analysis";

const GROUP_LABEL = { infants: "Infants under 2", children: "Children under 12", everyone: "Everyone served" } as const;

export default function HealthPage() {
  const { t } = useLang();
  const { unitStates } = useData();
  const [district, setDistrict] = useState("");

  const rows = useMemo(
    () =>
      Object.values(unitStates)
        .filter((s) => !district || s.unit.district === district)
        .map((s) => {
          const flags = healthFlags(s.unit, s.status, s.ver);
          const exposed = flags.filter((f) => !f.treated);
          // People can sit in more than one flag; count each group once.
          const atRisk = (sel: typeof flags) => {
            if (sel.some((f) => f.group === "everyone")) return s.unit.populationServed;
            const inf = sel.some((f) => f.group === "infants") ? s.unit.infantsUnder2 : 0;
            const ch = sel.some((f) => f.group === "children") ? s.unit.childrenUnder12 : 0;
            return inf + ch;
          };
          return { s, flags, exposedN: atRisk(exposed), potentialN: atRisk(flags) };
        })
        .sort((a, b) => b.exposedN - a.exposedN || b.potentialN - a.potentialN),
    [unitStates, district],
  );

  const districts = [...new Set(Object.values(unitStates).map((s) => s.unit.district))].sort();
  const served = rows.reduce((n, r) => n + r.s.unit.populationServed, 0);
  const exposed = rows.reduce((n, r) => n + r.exposedN, 0);
  const potential = rows.reduce((n, r) => n + r.potentialN, 0);
  const infExposed = rows.reduce((n, r) => n + (r.flags.some((f) => !f.treated && f.group === "infants") ? r.s.unit.infantsUnder2 : 0), 0);

  return (
    <>
      <PageHeader title={t("Health & Vulnerability")} sub={t("Contaminants matter differently by age: nitrate is a danger to infants, fluoride and chromium to children.")} />
      <div className="filters">
        <label>{t("District")}<select value={district} onChange={(e) => setDistrict(e.target.value)}><option value="">{t("All")}</option>{districts.map((d) => <option key={d}>{d}</option>)}</select></label>
      </div>
      <div className="stats">
        <Stat label={t("People served")} value={served.toLocaleString()} />
        <Stat label={t("Vulnerable people exposed now")} value={exposed.toLocaleString()} tone="red" sub={t("Source over limit and unit red or offline")} />
        <Stat label={t("Infants exposed (nitrate)")} value={infExposed.toLocaleString()} tone="red" />
        <Stat label={t("At risk if treatment lapses")} value={potential.toLocaleString()} tone="amber" sub={t("Source water over limit, treatment working")} />
      </div>

      <Card title={t("Units with a contaminant flag")}>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>{t("Unit")}</th><th>{t("Status")}</th><th>{t("Flags")}</th><th className="r">{t("People served")}</th><th className="r">{t("Infants < 2")}</th><th className="r">{t("Children < 12")}</th><th className="r">{t("Exposed now")}</th></tr></thead>
            <tbody>
              {rows.filter((r) => r.flags.length).map(({ s, flags, exposedN }) => (
                <tr key={s.unit.id}>
                  <td><Link href={`/units/${s.unit.id}`}>{s.unit.name}</Link><div className="muted">{s.unit.district}</div></td>
                  <td><StatusBadge status={s.status} /></td>
                  <td>
                    {flags.map((f) => (
                      <div key={f.key}>
                        <span className={`badge ${f.treated ? "s-amber" : "s-red"}`}><span className="glyph">{f.treated ? "⏳" : "✕"}</span>{t(f.label)}</span>{" "}
                        <small>{t(GROUP_LABEL[f.group])} · {f.basis === "lab" ? t("lab result") : f.treated ? t("in source, being treated") : t("reaching users")}</small>
                      </div>
                    ))}
                  </td>
                  <td className="num">{s.unit.populationServed.toLocaleString()}</td>
                  <td className="num">{s.unit.infantsUnder2.toLocaleString()}</td>
                  <td className="num">{s.unit.childrenUnder12.toLocaleString()}</td>
                  <td className={`num ${exposedN ? "bad" : ""}`}>{exposedN.toLocaleString()}</td>
                </tr>
              ))}
              {!rows.some((r) => r.flags.length) && <tr><td colSpan={7}><Empty>{t("No unit has a contaminant over its limit.")}</Empty></td></tr>}
            </tbody>
          </table>
        </div>
        <p className="muted pad">{t("Uranium and arsenic appear here only from lab results: they are never measured on site, so a unit with no flag is not proof of absence.")}</p>
      </Card>

      <Card title={t("All units by population served")}>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>{t("Unit")}</th><th>{t("Mine profile")}</th><th className="r">{t("People served")}</th></tr></thead>
            <tbody>
              {[...rows].sort((a, b) => b.s.unit.populationServed - a.s.unit.populationServed).map(({ s }) => (
                <tr key={s.unit.id}><td><Link href={`/units/${s.unit.id}`}>{s.unit.name}</Link></td><td>{s.unit.mineProfile.type}</td><td className="num">{s.unit.populationServed.toLocaleString()}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
