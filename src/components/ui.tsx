"use client";

import type { ReactNode } from "react";
import { useT } from "@/context/LangProvider";
import type { Status, Tier, WaterClass } from "@/lib/types";

/* Colour is load-bearing here, so it is never used alone: every status and
   tier carries a distinct glyph and a text label. */

export const STATUS_GLYPH: Record<Status, string> = { green: "✓", amber: "⏳", red: "✕", blue: "?", grey: "–" };

export const STATUS_LABEL: Record<Status, string> = {
  green: "Safe",
  amber: "Being treated, wait",
  red: "Do not drink",
  blue: "Treated, unverified",
  grey: "Offline",
};

export const STATUS_ORDER: Status[] = ["red", "blue", "amber", "grey", "green"];

export function StatusBadge({ status, compact }: { status: Status; compact?: boolean }) {
  const t = useT();
  return (
    <span className={`badge s-${status}`} title={t(STATUS_LABEL[status])}>
      <span aria-hidden className="glyph">{STATUS_GLYPH[status]}</span>
      {!compact && <span>{t(STATUS_LABEL[status])}</span>}
    </span>
  );
}

const TIER_GLYPH: Record<Tier, string> = { MEASURED: "●", ESTIMATED: "◐", UNVERIFIABLE: "○" };
const TIER_LABEL: Record<Tier, string> = { MEASURED: "Measured", ESTIMATED: "Estimated", UNVERIFIABLE: "Unverifiable" };

export function TierBadge({ tier }: { tier: Tier }) {
  const t = useT();
  return (
    <span className={`tier tier-${tier.toLowerCase()}`}>
      <span aria-hidden>{TIER_GLYPH[tier]}</span> {t(TIER_LABEL[tier])}
    </span>
  );
}

export const CLASS_INFO: Record<WaterClass, { what: string; action: string }> = {
  A: { what: "Microbial / particles only", action: "Treat locally" },
  B: { what: "Heavy particles, coal fines", action: "Treat locally" },
  C: { what: "High dissolved salts / sulphate", action: "Refer to block RO plant" },
  D: { what: "Specific toxic ion", action: "Fit the correct cartridge" },
  E: { what: "Cannot verify", action: "Refuse to certify, lab sample required" },
};

export function ClassBadge({ cls, detail }: { cls: WaterClass | null; detail?: boolean }) {
  const t = useT();
  if (!cls) return <span className="muted">—</span>;
  const info = CLASS_INFO[cls];
  return (
    <span className="classbadge" title={`${t(info.what)} · ${t(info.action)}`}>
      <b>{t("Class")} {cls}</b>
      {detail && <span> · {t(info.what)} → {t(info.action)}</span>}
    </span>
  );
}

export function CyclePips({ count, max = 3 }: { count: number; max?: number }) {
  const t = useT();
  return (
    <span className="pips" aria-label={`${count} / ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`pip ${i < count ? "on" : ""}`} />
      ))}
      <span className="pipn">{count} / {max}</span>
      {count >= max && <span className="badge s-red"><span className="glyph">✕</span>{t("Beyond local treatment")}</span>}
    </span>
  );
}

export function VerifyChip({ days, tone }: { days: number | null; tone: "green" | "amber" | "red" }) {
  const t = useT();
  const glyph = tone === "green" ? "✓" : tone === "amber" ? "!" : "✕";
  return (
    <span className={`vchip v-${tone}`}>
      <span aria-hidden className="glyph">{glyph}</span>
      {days === null ? t("Never verified") : `${days} ${t("d since lab")}`}
    </span>
  );
}

export function Card({ title, right, children, className }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className ?? ""}`}>
      {(title || right) && (
        <header className="card-h">
          <h2>{title}</h2>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="page-h">
      <div>
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      {right && <div className="page-h-r">{right}</div>}
    </div>
  );
}

export function Stat({ label, value, tone, onClick, sub }: { label: string; value: ReactNode; tone?: Status; onClick?: () => void; sub?: string }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={`stat ${tone ? `stat-${tone}` : ""}`} onClick={onClick} type={onClick ? "button" : undefined}>
      <span className="stat-l">{label}</span>
      <span className="stat-v">{value}</span>
      {sub && <span className="stat-s">{sub}</span>}
    </Tag>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error"; children: ReactNode }) {
  const glyph = tone === "error" ? "✕" : tone === "warn" ? "!" : "i";
  return (
    <div className={`notice n-${tone}`} role={tone === "error" ? "alert" : undefined}>
      <span className="glyph" aria-hidden>{glyph}</span>
      <div>{children}</div>
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  const t = useT();
  return <p className="muted pad">{t(label)}</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted pad">{children}</p>;
}

/** Sortable table header cell. */
export function Th({ children, sortKey, sort, onSort, align }: { children: ReactNode; sortKey?: string; sort?: { key: string; dir: 1 | -1 }; onSort?: (k: string) => void; align?: "right" }) {
  const active = sortKey && sort?.key === sortKey;
  return (
    <th className={align === "right" ? "r" : undefined} aria-sort={active ? (sort!.dir === 1 ? "ascending" : "descending") : undefined}>
      {sortKey && onSort ? (
        <button type="button" className="thbtn" onClick={() => onSort(sortKey)}>
          {children} <span aria-hidden>{active ? (sort!.dir === 1 ? "▲" : "▼") : "↕"}</span>
        </button>
      ) : (
        children
      )}
    </th>
  );
}
