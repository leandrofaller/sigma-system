'use client';

import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Circle, Polygon, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Corrigir os ícones padrão do Leaflet no Next.js
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface GeofenceData {
  id?: string;
  name: string;
  type: string;
  action: string;
  coordinates: any;
  isActive: boolean;
}

interface GeofencesMapProps {
  fences: GeofenceData[];
  selectedFenceId: string | null;
  newFence: {
    lat: number | null;
    lng: number | null;
    radius: number;
    type: string;
    action: string;
  };
  onMapClick: (lat: number, lng: number) => void;
}

const TILE_LAYERS = {
  standard: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
};

// Componente para capturar os cliques no mapa
function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Componente para centralizar o mapa em um ponto específico
function MapController({ center }: { center: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, 14, { animate: true });
    }
  }, [center, map]);
  return null;
}

// Botão flutuante de localização em tempo real (GPS do navegador)
function LocateControl({ onLocate }: { onLocate: (lat: number, lng: number) => void }) {
  const map = useMap();
  const [loading, setLoading] = useState(false);

  const handleLocate = () => {
    if (!navigator.geolocation) {
      alert('Geolocalização não é suportada por este navegador.');
      return;
    }

    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        map.setView([latitude, longitude], 15, { animate: true });
        onLocate(latitude, longitude);
        setLoading(false);
      },
      (error) => {
        console.error(error);
        alert('Não foi possível obter sua localização atual. Verifique se o GPS está ativo e com permissão.');
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="absolute bottom-16 right-3 z-[1000]">
      <button
        type="button"
        onClick={handleLocate}
        className={`w-10 h-10 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors ${
          loading ? 'animate-pulse text-sigma-600 dark:text-sigma-400' : ''
        }`}
        title="Localizar minha posição atual"
      >
        {loading ? (
          <svg className="animate-spin h-5 w-5 text-sigma-600 dark:text-sigma-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <circle cx="12" cy="12" r="3" fill="currentColor"/>
            <line x1="12" y1="1" x2="12" y2="4"/>
            <line x1="12" y1="20" x2="12" y2="23"/>
            <line x1="1" y1="12" x2="4" y2="12"/>
            <line x1="20" y1="12" x2="23" y2="12"/>
          </svg>
        )}
      </button>
    </div>
  );
}

export default function GeofencesMap({
  fences,
  selectedFenceId,
  newFence,
  onMapClick
}: GeofencesMapProps) {
  const [mapStyle, setMapStyle] = useState<'standard' | 'dark' | 'satellite'>('standard');
  const [isMounted, setIsMounted] = useState(false);

  const customPinIcon = useMemo(() => {
    return L.divIcon({
      html: `
        <div style="position:relative;width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0Z"/>
            <circle cx="12" cy="10" r="3" fill="#2563eb"/>
          </svg>
        </div>
      `,
      className: '',
      iconSize: [32, 32],
      iconAnchor: [16, 28],
    });
  }, []);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Centraliza o mapa inicialmente na capital ou no centro das cercas
  const initialCenter = useMemo<[number, number]>(() => {
    if (fences.length > 0) {
      const first = fences[0];
      const coords = first.coordinates;
      if (first.type === 'circle' && coords && coords.lat) {
        return [coords.lat, coords.lng];
      } else if (first.type === 'polygon' && Array.isArray(coords) && coords.length > 0) {
        return [coords[0].lat, coords[0].lng];
      }
    }
    // Coordenada padrão (centro aproximado do Brasil/DF)
    return [-15.7801, -47.9292];
  }, [fences]);

  // Encontra o centro da cerca selecionada para focar o mapa nela
  const selectedCenter = useMemo<[number, number] | null>(() => {
    if (!selectedFenceId) return null;
    const selected = fences.find(f => f.id === selectedFenceId);
    if (!selected) return null;
    const coords = selected.coordinates;
    if (selected.type === 'circle' && coords && coords.lat) {
      return [coords.lat, coords.lng];
    } else if (selected.type === 'polygon' && Array.isArray(coords) && coords.length > 0) {
      return [coords[0].lat, coords[0].lng];
    }
    return null;
  }, [selectedFenceId, fences]);

  if (!isMounted) {
    return (
      <div className="w-full h-[500px] bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center border border-gray-200 dark:border-gray-700 animate-pulse">
        <span className="text-gray-500">Carregando mapa...</span>
      </div>
    );
  }

  // Cores das cercas baseadas na ação (allow = azul/verde, deny = vermelho)
  const getFenceOptions = (action: string, isActive: boolean) => {
    const color = action === 'allow' ? '#2563eb' : '#dc2626';
    return {
      color,
      fillColor: color,
      fillOpacity: isActive ? 0.2 : 0.05,
      dashArray: isActive ? undefined : '5, 10',
      weight: isActive ? 2 : 1
    };
  };

  return (
    <div className="relative w-full h-[550px] rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-inner">
      {/* Seletor de camada do mapa */}
      <div className="absolute top-3 right-3 z-[1000] bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-1.5 flex gap-1">
        {(['standard', 'dark', 'satellite'] as const).map((style) => (
          <button
            key={style}
            onClick={() => setMapStyle(style)}
            className={`px-2.5 py-1 text-xs font-semibold rounded ${
              mapStyle === style
                ? 'bg-sigma-600 text-white dark:bg-sigma-500'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            {style === 'standard' ? 'Padrão' : style === 'dark' ? 'Escuro' : 'Satélite'}
          </button>
        ))}
      </div>

      <MapContainer
        center={initialCenter}
        zoom={12}
        style={{ width: '100%', height: '100%', background: '#f5f5f5' }}
      >
        <TileLayer url={TILE_LAYERS[mapStyle]} attribution='&copy; OpenStreetMap contributors' />
        
        {/* Manipulador de cliques para criar marcador de nova cerca */}
        <MapClickHandler onMapClick={onMapClick} />
        
        {/* Controlador para focar cerca selecionada */}
        <MapController center={selectedCenter} />

        {/* Desenhar as cercas existentes */}
        {fences.map((fence) => {
          const coords = fence.coordinates;
          if (!coords) return null;

          const options = getFenceOptions(fence.action, fence.isActive);

          if (fence.type === 'circle' && typeof coords.lat === 'number') {
            return (
              <Circle
                key={fence.id}
                center={[coords.lat, coords.lng]}
                radius={coords.radius}
                pathOptions={options}
              />
            );
          } else if (fence.type === 'polygon' && Array.isArray(coords)) {
            return (
              <Polygon
                key={fence.id}
                positions={coords.map(c => [c.lat, c.lng])}
                pathOptions={options}
              />
            );
          }
          return null;
        })}

        {/* Marcador e círculo para a nova cerca em edição */}
        {newFence.lat !== null && newFence.lng !== null && (
          <>
            <Marker position={[newFence.lat, newFence.lng]} icon={customPinIcon} />
            {newFence.type === 'circle' && (
              <Circle
                center={[newFence.lat, newFence.lng]}
                radius={newFence.radius}
                pathOptions={{
                  color: newFence.action === 'allow' ? '#3b82f6' : '#ef4444',
                  fillColor: newFence.action === 'allow' ? '#3b82f6' : '#ef4444',
                  fillOpacity: 0.35,
                  dashArray: '5, 5',
                  weight: 2
                }}
              />
            )}
          </>
        )}
        
        {/* Controle flutuante para capturar localização atual */}
        <LocateControl onLocate={onMapClick} />
      </MapContainer>

      {/* Dica no rodapé do mapa */}
      <div className="absolute bottom-2 left-2 z-[1000] bg-white/90 dark:bg-gray-800/90 backdrop-blur rounded px-3 py-1.5 text-[11px] font-medium text-gray-700 dark:text-gray-300 shadow border border-gray-150 dark:border-gray-750">
        💡 Clique no mapa para definir o ponto central da cerca.
      </div>
    </div>
  );
}
