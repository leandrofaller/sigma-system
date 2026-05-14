'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface LocationEntry {
  id: string;
  userId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  address: string | null;
  timestamp: string;
  user: { id: string; name: string; email: string };
}

export const TILE_LAYERS = {
  standard: {
    label: 'Padrão (OpenStreetMap)',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  satellite: {
    label: 'Satélite (Esri)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© <a href="https://www.esri.com">Esri</a>, Maxar, GeoEye, Earthstar Geographics',
  },
  dark: {
    label: 'Escuro (CartoDB)',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
  },
  light: {
    label: 'Minimalista (CartoDB)',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
  },
  topo: {
    label: 'Topográfico',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://opentopomap.org">OpenTopoMap</a>',
  },
} as const;

export type TileStyle = keyof typeof TILE_LAYERS;

const TRAIL_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function markerColor(ts: string): string {
  const h = (Date.now() - new Date(ts).getTime()) / 3600000;
  if (h < 1) return '#22c55e';
  if (h < 24) return '#f59e0b';
  return '#ef4444';
}

function createPulsingIcon(): L.DivIcon {
  return L.divIcon({
    html: `
      <div style="position:relative;width:28px;height:28px;display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;width:28px;height:28px;border-radius:50%;background:rgba(34,197,94,0.55);animation:geomarker-pulse 1.6s ease-out infinite;"></div>
        <div style="position:absolute;width:14px;height:14px;border-radius:50%;background:#22c55e;border:2.5px solid #fff;box-shadow:0 0 6px rgba(0,0,0,0.35);"></div>
      </div>
    `,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

function MapController({ targets }: { targets: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (!targets.length) return;
    if (targets.length === 1) {
      map.setView(targets[0], 15, { animate: true });
    } else {
      map.fitBounds(targets.map((t) => t as [number, number]), { padding: [40, 40], maxZoom: 15, animate: true });
    }
  }, [JSON.stringify(targets)]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

interface Props {
  locations: LocationEntry[];
  selectedUserId: string | null;
  tileStyle?: TileStyle;
}

export default function GeoMap({ locations, selectedUserId, tileStyle = 'standard' }: Props) {
  const tile = TILE_LAYERS[tileStyle] ?? TILE_LAYERS.standard;
  const pulsingIcon = useMemo(() => createPulsingIcon(), []);

  // Overview mode: one latest marker per user
  const latestByUser = useMemo(() => {
    const map = new Map<string, LocationEntry>();
    for (const loc of [...locations].reverse()) map.set(loc.userId, loc);
    return map;
  }, [locations]);

  // Trail mode: locations from selected user in the last 10 minutes
  const trail = useMemo(() => {
    if (!selectedUserId) return [];
    const cutoff = Date.now() - TRAIL_WINDOW_MS;
    const userLocs = locations.filter((l) => l.userId === selectedUserId);
    const recent = userLocs.filter((l) => new Date(l.timestamp).getTime() >= cutoff);
    // Sort oldest → newest for polyline
    return (recent.length > 0 ? recent : userLocs.slice(0, 1))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [locations, selectedUserId]);

  const overviewMarkers = Array.from(latestByUser.values());
  const trailPoints: [number, number][] = trail.map((l) => [l.lat, l.lng]);
  const latestTrailPoint = trail[trail.length - 1] ?? null;

  const targets: [number, number][] = selectedUserId
    ? trailPoints
    : overviewMarkers.map((m) => [m.lat, m.lng]);

  return (
    <MapContainer
      center={[-10, -53]}
      zoom={4}
      style={{ height: '100%', width: '100%', borderRadius: 'inherit' }}
      zoomControl
    >
      <TileLayer url={tile.url} attribution={tile.attribution} />
      <MapController targets={targets} />

      {!selectedUserId && overviewMarkers.map((loc) => (
        <CircleMarker
          key={loc.id}
          center={[loc.lat, loc.lng]}
          radius={9}
          fillColor={markerColor(loc.timestamp)}
          fillOpacity={0.85}
          color="#fff"
          weight={2}
        >
          <Popup>
            <div style={{ minWidth: 160 }}>
              <strong>{loc.user.name}</strong><br />
              <span style={{ fontSize: 11, color: '#666' }}>{loc.user.email}</span><br /><br />
              <span style={{ fontSize: 12 }}>
                {new Date(loc.timestamp).toLocaleString('pt-BR')}<br />
                Lat: {loc.lat.toFixed(5)}<br />
                Lng: {loc.lng.toFixed(5)}<br />
                {loc.accuracy && <>Acurácia: {loc.accuracy.toFixed(0)}m<br /></>}
                {loc.address && <>{loc.address}</>}
              </span>
            </div>
          </Popup>
        </CircleMarker>
      ))}

      {selectedUserId && (
        <>
          {/* Trail polyline */}
          {trailPoints.length > 1 && (
            <Polyline
              positions={trailPoints}
              pathOptions={{ color: '#6172f3', weight: 2.5, opacity: 0.7, dashArray: '6 4' }}
            />
          )}

          {/* Historical trail points (excluding latest) */}
          {trail.slice(0, -1).map((loc, i) => (
            <CircleMarker
              key={`trail-${loc.id}-${i}`}
              center={[loc.lat, loc.lng]}
              radius={5}
              fillColor="#6172f3"
              fillOpacity={0.55}
              color="#fff"
              weight={1.5}
            >
              <Popup>
                <div style={{ minWidth: 150 }}>
                  <strong>{loc.user.name}</strong><br />
                  <span style={{ fontSize: 12 }}>
                    {new Date(loc.timestamp).toLocaleString('pt-BR')}<br />
                    Lat: {loc.lat.toFixed(5)} · Lng: {loc.lng.toFixed(5)}<br />
                    {loc.accuracy && <>Acurácia: {loc.accuracy.toFixed(0)}m<br /></>}
                    {loc.address && <>{loc.address}</>}
                  </span>
                </div>
              </Popup>
            </CircleMarker>
          ))}

          {/* Pulsing latest position marker */}
          {latestTrailPoint && (
            <Marker
              position={[latestTrailPoint.lat, latestTrailPoint.lng]}
              icon={pulsingIcon}
            >
              <Popup>
                <div style={{ minWidth: 160 }}>
                  <strong>{latestTrailPoint.user.name}</strong>
                  <span style={{ marginLeft: 6, fontSize: 11, background: '#22c55e', color: '#fff', borderRadius: 4, padding: '1px 5px' }}>
                    Posição atual
                  </span><br />
                  <span style={{ fontSize: 11, color: '#666' }}>{latestTrailPoint.user.email}</span><br /><br />
                  <span style={{ fontSize: 12 }}>
                    {new Date(latestTrailPoint.timestamp).toLocaleString('pt-BR')}<br />
                    Lat: {latestTrailPoint.lat.toFixed(5)}<br />
                    Lng: {latestTrailPoint.lng.toFixed(5)}<br />
                    {latestTrailPoint.accuracy && <>Acurácia: {latestTrailPoint.accuracy.toFixed(0)}m<br /></>}
                    {latestTrailPoint.address && <>{latestTrailPoint.address}</>}
                  </span>
                </div>
              </Popup>
            </Marker>
          )}
        </>
      )}
    </MapContainer>
  );
}
