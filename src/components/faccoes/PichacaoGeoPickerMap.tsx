'use client';

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { UNIDADE_SATELLITE_TILE } from '@/lib/leaflet-unidade-map';

let pichacaoIcon: L.DivIcon | null = null;

function createPichacaoMarkerIcon(): L.DivIcon {
  if (!pichacaoIcon) {
    pichacaoIcon = L.divIcon({
      className: 'pichacao-map-marker-icon',
      html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="30" height="45" role="img" aria-label="Pichação">
        <path fill="#9333ea" stroke="#581c87" stroke-width="1.2" d="M12 0C5.37 0 0 5.37 0 12c0 9 12 24 12 24s12-15 12-24C24 5.37 18.63 0 12 0z"/>
        <circle cx="12" cy="12" r="4.5" fill="#ffffff"/>
      </svg>`,
      iconSize: [30, 45],
      iconAnchor: [15, 45],
      popupAnchor: [0, -42],
    });
  }
  return pichacaoIcon!;
}

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
          attribution={UNIDADE_SATELLITE_TILE.attribution}
          url={UNIDADE_SATELLITE_TILE.url}
        />
        <ClickHandler onPick={onPick} />
        <FlyTo lat={latitude} lng={longitude} />
        {latitude != null && longitude != null && (
          <Marker
            position={[latitude, longitude]}
            icon={createPichacaoMarkerIcon()}
            draggable={true}
            eventHandlers={eventHandlers}
            ref={markerRef}
          />
        )}
      </MapContainer>
    </div>
  );
}
