'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
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
  onSelect: (pichacao: PichacaoData) => void;
  center?: [number, number];
  zoom?: number;
}

function MapController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: true });
  }, [center, zoom, map]);
  return null;
}

export default function PichacoesMap({ pichacoes, onSelect, center = [-10.9, -62.8], zoom = 7 }: PichacoesMapProps) {
  // Filtra as pichações que possuem coordenadas válidas
  const validPichacoes = pichacoes.filter(
    (p) => p.latitude !== null && p.longitude !== null
  ) as (PichacaoData & { latitude: number; longitude: number })[];

  return (
    <div className="w-full h-full rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-inner relative z-0">
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ width: '100%', height: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapController center={center} zoom={zoom} />

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
