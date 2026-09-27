"use client";

import { useLang } from "@/context/LangProvider";
import type { Verification } from "@/lib/analysis";
import { routeContacts } from "@/lib/authorities";
import { countdown } from "@/lib/format";
import { PARAMS, fmtValue } from "@/lib/thresholds";
import type { Alert, CitizenReport, ParamId, Unit } from "@/lib/types";
import { Card, Empty } from "./ui";

const LABEL: Record<string, string> = { uranium: "Uranium", arsenic: "Arsenic", bacteria: "Bacteria", microbial: "Microbial risk" };

export default function ContactPanel({ unit, ver, alerts, reports, now }: { unit: Unit; ver: Verification; alerts: Alert[]; reports: CitizenReport[]; now: number }) {
  const { t, lang } = useLang();
  const r = routeContacts(unit, ver, alerts, reports, now);

  return (
    <Card
      title={t("Who to contact")}
      right={r.escalateAt !== null && (
        <span className={r.escalateNow ? "err" : "muted"}>
          ⏱ {r.escalateNow ? t("24 h passed: escalate now") : `${countdown(r.escalateAt - now)} ${t("left to acknowledge")}`}
        </span>
      )}
    >
      {!r.steps.length ? (
        <Empty>{t("Nothing detected. No authority needs to be contacted.")}</Empty>
      ) : (
        <>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>{t("Detected")}</th><th className="r">{t("Value")}</th><th className="r">{t("Limit")}</th><th>{t("Severity")}</th></tr></thead>
              <tbody>
                {r.detections.map((d) => {
                  const p = PARAMS[d.param as ParamId];
                  return (
                    <tr key={d.param}>
                      <td>{p ? p.label[lang] : t(LABEL[d.param])}</td>
                      <td className="num bad">{p ? `${fmtValue(d.param as ParamId, d.value)} ${p.unit}` : d.value ?? "—"}</td>
                      <td className="num">{d.limit}</td>
                      <td><b className={d.severity === "Unsafe" ? "err" : "warn-text"}>{t(d.severity)}</b></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ol className="contacts">
            {r.steps.map((s) => {
              const c = s.authority.contact;
              const details = [c.phone, c.email, c.address].filter(Boolean).join(" · ");
              return (
                <li key={s.authority.id}>
                  <b>{t(s.authority.name)}</b> <small className="muted">{t(s.authority.office)}</small>
                  <div>{t(s.why)}</div>
                  <small className={details ? "" : "muted"}>{details || t("Contact details not added yet")}</small>
                </li>
              );
            })}
          </ol>
          {!r.mining && r.detections.length > 0 && (
            <p className="muted pad">{t("No sign of mining discharge (pH and sulphate normal), so JSPCB and the Mining Officer are not involved.")}</p>
          )}
        </>
      )}
    </Card>
  );
}
