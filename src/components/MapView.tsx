"use client";

import dynamic from "next/dynamic";

/** Leaflet touches `window` at import time, so it must never render on the server. */
const MapView = dynamic(() => import("./MapCanvas"), {
  ssr: false,
  loading: () => <div className="map map-loading">Loading map…</div>,
});

export default MapView;
export type { MapMarker, MapRing, MapBlob } from "./MapCanvas";
