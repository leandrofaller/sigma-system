'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { UNIDADE_SATELLITE_TILE } from '@/lib/leaflet-unidade-map';

// Corrigir os ícones padrão do Leaflet no Next.js
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface PichacaoData {
  id: string;
  municipio: string;
  endereco: string;
  latitude: number | null;
  longitude: number | null;
  descricao: string | null;
  fotos: string[];
  faccaoId: string | null;
  faccao: { id: string; nome: string; sigla: string | null; cor: string | null } | null;
  cadastradoPor: { id: string; name: string } | null;
  dataRegistro: string;
}

interface PichacoesMapProps {
  pichacoes: PichacaoData[];
  onSelect: (pichacao: any) => void;
  center?: [number, number];
  zoom?: number;
  focusedPichacaoId?: string;
}

function MapController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: true });
  }, [center, zoom, map]);
  return null;
}

function FocusedController({ focusedId, pichacoes }: { focusedId?: string; pichacoes: PichacaoData[] }) {
  const map = useMap();
  useEffect(() => {
    if (!focusedId) return;
    const item = pichacoes.find(p => p.id === focusedId);
    if (item && item.latitude !== null && item.longitude !== null) {
      map.setView([item.latitude, item.longitude], 17, { animate: true });
    }
  }, [focusedId, pichacoes, map]);
  return null;
}

/**
 * Best practice: automatically zooms/pans to frame all current data points nicely.
 * Solves the problem of events appearing "too far away" by default.
 */
function DataBoundsController({ points }: { points: Array<{ latitude: number; longitude: number }> }) {
  const map = useMap();

  useEffect(() => {
    if (!points || points.length === 0) return;

    const latLngs = points.map((p) => [p.latitude, p.longitude] as [number, number]);
    const bounds = L.latLngBounds(latLngs);

    if (bounds.isValid()) {
      map.flyToBounds(bounds, {
        padding: [30, 30],
        maxZoom: 16, // allow closer view for individual pichações
        duration: 0.8,
      });
    }
  }, [points.length, JSON.stringify(points.map((p) => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`)), map]);

  return null;
}

export default function PichacoesMap({ pichacoes, onSelect, center = [-10.9, -62.8], zoom = 7, focusedPichacaoId }: PichacoesMapProps) {
  // Filtra as pichações que possuem coordenadas válidas
  const validPichacoes = pichacoes.filter(
    (p) => p.latitude !== null && p.longitude !== null
  ) as (PichacaoData & { latitude: number; longitude: number })[];

  const fitPoints = validPichacoes.map(p => ({ latitude: p.latitude, longitude: p.longitude }));

  return (
    <div className="w-full h-full rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-inner relative z-0">
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ width: '100%', height: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution={UNIDADE_SATELLITE_TILE.attribution}
          url={UNIDADE_SATELLITE_TILE.url}
        />
        
        <MapController center={center} zoom={zoom} />
        <FocusedController focusedId={focusedPichacaoId} pichacoes={validPichacoes} />
        {/* Auto-fit to current data - only if we are not focused on a specific pichação */}
        {!focusedPichacaoId && <DataBoundsController points={fitPoints} />}

        {validPichacoes.map((p) => {
          const faccaoColor = p.faccao?.cor || '#6b7280'; // cinza se não houver facção
          const sigla = p.faccao?.sigla || 'Fato Isolado';
          const mainFoto = p.fotos && p.fotos.length > 0 ? p.fotos[0] : null;

          return (
            <CircleMarker
              key={p.id}
              center={[p.latitude, p.longitude]}
              radius={10}
              fillColor={faccaoColor}
              color="#ffffff"
              weight={2.5}
              fillOpacity={0.9}
            >
              <Popup>
                <div className="p-1 font-sans max-w-[220px]">
                  {mainFoto && (
                    <div className="w-full h-24 mb-2 rounded overflow-hidden border border-gray-100">
                      <img
                        src={mainFoto}
                        alt="Foto da pichação"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <h4 className="font-bold text-gray-900 text-xs mb-1 uppercase tracking-wide">
                    {p.municipio} - RO
                  </h4>
                  <span
                    className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mb-2 text-white border-0"
                    style={{ backgroundColor: faccaoColor }}
                  >
                    {sigla}
                  </span>
                  <p className="text-[11px] text-gray-600 mb-1 leading-snug truncate">
                    <strong>Ref:</strong> {p.endereco}
                  </p>
                  {p.descricao && (
                    <p className="text-[10px] text-gray-500 italic line-clamp-2 mb-2 leading-relaxed">
                      "{p.descricao}"
                    </p>
                  )}
                  <button
                    onClick={() => onSelect(p)}
                    className="w-full mt-1 py-1 text-center bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-bold rounded transition-colors"
                  >
                    Ver Registro Completo
                  </button>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
