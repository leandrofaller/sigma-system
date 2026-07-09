'use client';

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Corrigir os ícones padrão do Leaflet no Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Porto Velho / Rondônia como centro padrão
const DEFAULT_CENTER: [number, number] = [-8.7612, -63.9039];

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FlyTo({ lat, lng }: { lat: number | null; lng: number | null }) {
  const map = useMap();
  const firstFly = useRef(true);

  useEffect(() => {
    if (lat != null && lng != null) {
      const zoom = firstFly.current ? 16 : map.getZoom();
      map.setView([lat, lng], zoom, { animate: true });
      firstFly.current = false;
    }
  }, [lat, lng, map]);
  return null;
}

interface PichacaoGeoPickerMapProps {
  latitude: number | null;
  longitude: number | null;
  onPick: (lat: number, lng: number) => void;
}

export default function PichacaoGeoPickerMap({
  latitude,
  longitude,
  onPick,
}: PichacaoGeoPickerMapProps) {
  const center: [number, number] =
    latitude != null && longitude != null ? [latitude, longitude] : DEFAULT_CENTER;

  const markerRef = useRef<L.Marker | null>(null);

  const eventHandlers = {
    dragend() {
      const marker = markerRef.current;
      if (marker != null) {
        const latLng = marker.getLatLng();
        onPick(latLng.lat, latLng.lng);
      }
    },
  };

  return (
    <div className="w-full h-full relative z-0">
      <MapContainer
        center={center}
        zoom={latitude != null ? 16 : 7}
        style={{ width: '100%', height: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onPick={onPick} />
        <FlyTo lat={latitude} lng={longitude} />
        {latitude != null && longitude != null && (
          <Marker
            position={[latitude, longitude]}
            draggable={true}
            eventHandlers={eventHandlers}
            ref={markerRef}
          />
        )}
      </MapContainer>
    </div>
  );
}
