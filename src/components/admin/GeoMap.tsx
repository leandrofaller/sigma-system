'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
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

function markerColor(ts: string): string {
  const h = (Date.now() - new Date(ts).getTime()) / 3600000;
  if (h < 1) return '#22c55e';
  if (h < 24) return '#f59e0b';
  return '#ef4444';
}

function MapController({ targets }: { targets: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (!targets.length) return;
    if (targets.length === 1) {
      map.setView(targets[0], 13, { animate: true });
    } else {
      map.fitBounds(targets.map((t) => t as [number, number]), { padding: [40, 40], maxZoom: 12, animate: true });
    }
  }, [JSON.stringify(targets)]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

interface Props {
  locations: LocationEntry[];
  selectedUserId: string | null;
}

export default function GeoMap({ locations, selectedUserId }: Props) {
  // Most recent location per user (for "all users" view)
  const latestByUser = new Map<string, LocationEntry>();
  for (const loc of [...locations].reverse()) {
    latestByUser.set(loc.userId, loc);
  }

  const markers = selectedUserId
    ? locations.filter((l) => l.userId === selectedUserId).slice(0, 50)
    : Array.from(latestByUser.values());

  const targets: [number, number][] = markers.map((m) => [m.lat, m.lng]);

  return (
    <MapContainer
      center={[-10, -53]}
      zoom={4}
      style={{ height: '100%', width: '100%', borderRadius: 'inherit' }}
      zoomControl
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <MapController targets={targets} />
      {markers.map((loc, i) => (
        <CircleMarker
          key={`${loc.id}-${i}`}
          center={[loc.lat, loc.lng]}
          radius={selectedUserId ? 6 : 9}
          fillColor={markerColor(loc.timestamp)}
          fillOpacity={0.85}
          color="#fff"
          weight={2}
        >
          <Popup>
            <div style={{ minWidth: 160 }}>
              <strong>{loc.user.name}</strong><br />
              <span style={{ fontSize: 11, color: '#666' }}>{loc.user.email}</span><br />
              <br />
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
    </MapContainer>
  );
}
