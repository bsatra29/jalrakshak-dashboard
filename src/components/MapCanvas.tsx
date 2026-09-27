"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { loadBoundary, loadVillages, type Village } from "@/lib/villages";
import type { Status } from "@/lib/types";

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  /** Unit pins use a status; other pins pass a custom glyph and class. */
  status?: Status;
  glyph?: string;
  cls?: string;
  size?: number;
};

export type MapRing = { lat: number; lng: number; radiusM: number; color: string; dashed?: boolean; label?: string };
export type MapBlob = { lat: number; lng: number; intensity: number; radiusM?: number };

type Props = {
  markers: MapMarker[];
  rings?: MapRing[];
  blobs?: MapBlob[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Re-fit the viewport when this changes (e.g. after a filter change). */
  fitKey?: string;
  height?: number | string;
  /** Show the real-village layer, optionally limited to one district. */
  showVillages?: boolean;
  villageDistrict?: string;
  /** Fly to this village and open its popup (e.g. from search). */
  focus?: Village | null;
};

function villagePopup(v: Village) {
  const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  return `<b>${esc(v.name)}</b><br>${v.hamlet ? "Hamlet" : "Village"} · ${esc(v.district)} district<br><small>${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}</small>`;
}

const STATUS_GLYPH: Record<Status, string> = { green: "✓", amber: "⏳", red: "✕", blue: "?", grey: "–" };

function heatColor(i: number) {
  // Sequential single-hue-to-warm ramp: pale yellow → orange → deep red.
  if (i >= 75) return "#b4231a";
  if (i >= 55) return "#e0561f";
  if (i >= 35) return "#f0a030";
  return "#f3d86b";
}

export default function MapCanvas({ markers, rings = [], blobs = [], selectedId, onSelect, fitKey, height = 560, showVillages = false, villageDistrict = "", focus = null }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<{ heat: L.LayerGroup; rings: L.LayerGroup; pins: L.LayerGroup; villages: L.LayerGroup } | null>(null);
  const [allVillages, setAllVillages] = useState<Village[]>([]);
  const lastFit = useRef<string | undefined>(undefined);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { center: [23.7, 85.9], zoom: 7, zoomControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "© OpenStreetMap contributors",
    }).addTo(m);
    const outline = L.layerGroup().addTo(m);
    layers.current = { heat: L.layerGroup().addTo(m), rings: L.layerGroup().addTo(m), villages: L.layerGroup().addTo(m), pins: L.layerGroup().addTo(m) };
    map.current = m;
    loadBoundary()
      .then((lines) => lines.forEach((ln) => L.polyline(ln, { color: "#1d4f7a", weight: 2, opacity: 0.7, interactive: false }).addTo(outline)))
      .catch(() => {});
    loadVillages().then(setAllVillages).catch(() => {});

    // The container's size changes with viewport width (clamp() height below),
    // sidebar drawer open/close, and orientation flips — Leaflet needs telling,
    // or tiles render offset/blank until the next pan.
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);

    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
      layers.current = null;
    };
  }, []);

  useEffect(() => {
    const l = layers.current;
    const m = map.current;
    if (!l || !m) return;

    l.heat.clearLayers();
    for (const b of blobs) {
      const color = heatColor(b.intensity);
      const base = b.radiusM ?? 9000;
      // Three stacked discs fake a soft falloff without a heat plugin.
      [1, 0.62, 0.3].forEach((k, i) =>
        L.circle([b.lat, b.lng], { radius: base * k, stroke: false, fillColor: color, fillOpacity: 0.16 + i * 0.05, interactive: false }).addTo(l.heat),
      );
    }

    l.rings.clearLayers();
    for (const r of rings) {
      const c = L.circle([r.lat, r.lng], { radius: r.radiusM, color: r.color, weight: 1.5, dashArray: r.dashed ? "6 5" : undefined, fillOpacity: 0.04, interactive: false }).addTo(l.rings);
      void c;
    }

    l.pins.clearLayers();
    for (const mk of markers) {
      const size = mk.size ?? 30;
      const cls = mk.status ? `pin p-${mk.status}` : `pin ${mk.cls ?? ""}`;
      const glyph = mk.glyph ?? (mk.status ? STATUS_GLYPH[mk.status] : "");
      const sel = mk.id === selectedId ? " sel" : "";
      const icon = L.divIcon({
        className: "pin-wrap",
        html: `<div class="${cls}${sel}" style="width:${size}px;height:${size}px"><span>${glyph}</span></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
      const pin = L.marker([mk.lat, mk.lng], { icon, title: mk.label, keyboard: true, riseOnHover: true }).addTo(l.pins);
      pin.bindTooltip(mk.label, { direction: "top", offset: [0, -size / 2] });
      pin.on("click", () => onSelectRef.current?.(mk.id));
    }

    if (fitKey !== lastFit.current && markers.length) {
      lastFit.current = fitKey;
      const bounds = L.latLngBounds(markers.map((x) => [x.lat, x.lng] as [number, number]));
      m.fitBounds(bounds.pad(0.25), { maxZoom: 11 });
    }
  }, [markers, rings, blobs, selectedId, fitKey]);

  useEffect(() => {
    const l = layers.current;
    if (!l) return;
    l.villages.clearLayers();
    if (!showVillages) return;
    // Canvas keeps thousands of points fast without a clustering plugin.
    const renderer = L.canvas({ padding: 0.3 });
    for (const v of allVillages) {
      if (villageDistrict && v.district !== villageDistrict) continue;
      L.circleMarker([v.lat, v.lng], { renderer, radius: v.hamlet ? 2.5 : 3.5, color: "#3b5b7a", weight: 1, fillColor: "#ffffff", fillOpacity: 0.9 })
        .bindPopup(villagePopup(v))
        .addTo(l.villages);
    }
  }, [allVillages, showVillages, villageDistrict]);

  useEffect(() => {
    const m = map.current;
    if (!m || !focus) return;
    m.flyTo([focus.lat, focus.lng], 13);
    L.popup().setLatLng([focus.lat, focus.lng]).setContent(villagePopup(focus)).openOn(m);
  }, [focus]);

  // A fixed pixel height eats most of a phone's viewport. clamp() keeps the
  // desktop/tablet height but caps it against viewport height on short or
  // narrow screens, so the panel below it (unit list, cluster list) stays reachable.
  const cssHeight = typeof height === "number" ? `clamp(240px, 55vh, ${height}px)` : height;
  return <div ref={el} className="map" style={{ height: cssHeight }} role="application" aria-label="Map" />;
}
