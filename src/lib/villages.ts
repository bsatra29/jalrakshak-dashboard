/**
 * Real villages and hamlets of Jharkhand from OpenStreetMap (ODbL), fetched via
 * the Overpass query in scripts/villages.overpassql and stored in
 * public/data/villages.json. The state outline is public/data/jharkhand-boundary.json.
 */

export type Village = { name: string; district: string; lat: number; lng: number; hamlet: boolean };

let villages: Promise<Village[]> | null = null;
let boundary: Promise<[number, number][][]> | null = null;

/** OSM and the unit records spell one district differently. */
const DISTRICT_ALIAS: Record<string, string> = { "Seraikela-Kharsawan": "Saraikela-Kharsawan" };

export function loadVillages(): Promise<Village[]> {
  villages ??= fetch("/data/villages.json")
    .then((r) => r.json())
    .then((d: { rows: [string, string, number, number, number][] }) =>
      d.rows.map(([name, district, lat, lng, hamlet]) => ({ name, district: DISTRICT_ALIAS[district] ?? district, lat, lng, hamlet: hamlet === 1 })),
    );
  return villages;
}

export function loadBoundary(): Promise<[number, number][][]> {
  boundary ??= fetch("/data/jharkhand-boundary.json").then((r) => r.json()).then((d: { lines: [number, number][][] }) => d.lines);
  return boundary;
}

/** Lower-case and strip accents, so "kharam" finds "Khārām". */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
