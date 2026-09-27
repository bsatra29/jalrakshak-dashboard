export const DAY = 86400000;
export const HOUR = 3600000;

export type Lang = "en" | "hi";

const locale = (lang: Lang) => (lang === "hi" ? "hi-IN" : "en-IN");

export function fmtDate(ms: number | null | undefined, lang: Lang = "en"): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString(locale(lang), { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(ms: number | null | undefined, lang: Lang = "en"): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString(locale(lang), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtMonth(ms: number, lang: Lang = "en"): string {
  return new Date(ms).toLocaleDateString(locale(lang), { month: "short", year: "2-digit" });
}

export function daysBetween(from: number, to: number): number {
  return Math.floor((to - from) / DAY);
}

/** "3 h ago", "2 d ago". Language-neutral abbreviations so it works in Hindi UI too. */
export function ago(ms: number | null | undefined, now: number): string {
  if (!ms) return "—";
  const d = now - ms;
  if (d < 0) return "0 m";
  if (d < HOUR) return `${Math.max(1, Math.round(d / 60000))} m`;
  if (d < DAY) return `${Math.round(d / HOUR)} h`;
  return `${Math.round(d / DAY)} d`;
}

/** hh:mm:ss or "3h 12m" countdown. Negative input renders as elapsed. */
export function countdown(ms: number): string {
  const abs = Math.abs(ms);
  const h = Math.floor(abs / HOUR);
  const m = Math.floor((abs % HOUR) / 60000);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export function pctChange(from: number | null, to: number | null): number | null {
  if (from === null || to === null || from === 0) return null;
  return ((to - from) / Math.abs(from)) * 100;
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function download(filename: string, text: string, mime = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Great-circle distance in metres. */
export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
