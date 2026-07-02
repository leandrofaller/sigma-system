'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Circle, CircleMarker, Popup, useMap, LayerGroup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet icons for Next.js
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

export interface PichacaoForMap {
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

interface TerritoryMapProps {
  pichacoes: PichacaoForMap[];
  onSelect: (pichacao: any) => void;
  center?: [number, number];
  zoom?: number;
  // Visualization controls (all optional, good defaults)
  influenceRadius: number; // meters
  conflictThreshold: number; // meters
  showPoints: boolean;
  showInfluenceZones: boolean;
  showConflicts: boolean;
  hiddenFaccaoIds: Set<string>; // faccaoId or 'SEM_FACCAO'
}

interface Conflict {
  id: string;
  lat: number;
  lng: number;
  faccaoA: string;
  corA: string;
  faccaoB: string;
  corB: string;
  distance: number;
}

function MapController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: true });
  }, [center, zoom, map]);
  return null;
}

// Haversine distance in meters (accurate enough, fast)
function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function PichacoesTerritoryMap({
  pichacoes,
  onSelect,
  center = [-10.9, -62.8],
  zoom = 7,
  influenceRadius,
  conflictThreshold,
  showPoints,
  showInfluenceZones,
  showConflicts,
  hiddenFaccaoIds,
}: TerritoryMapProps) {
  // Only points with valid coordinates
  const validPichacoes = useMemo(
    () =>
      pichacoes.filter(
        (p): p is PichacaoForMap & { latitude: number; longitude: number } =>
          p.latitude !== null && p.longitude !== null
      ),
    [pichacoes]
  );

  // Group by facção (key = faccaoId or 'SEM_FACCAO')
  const groups = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        label: string;
        cor: string;
        items: (PichacaoForMap & { latitude: number; longitude: number })[];
      }
    >();

    for (const p of validPichacoes) {
      const key = p.faccaoId || 'SEM_FACCAO';
      if (hiddenFaccaoIds.has(key)) continue;

      const label = p.faccao?.sigla || p.faccao?.nome || 'Fato Isolado';
      const cor = p.faccao?.cor || '#6b7280';

      if (!map.has(key)) {
        map.set(key, { key, label, cor, items: [] });
      }
      map.get(key)!.items.push(p);
    }

    return Array.from(map.values());
  }, [validPichacoes, hiddenFaccaoIds]);

  // Detect conflicts between different facções
  const conflicts = useMemo<Conflict[]>(() => {
    if (!showConflicts) return [];

    const conflictsList: Conflict[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < validPichacoes.length; i++) {
      const a = validPichacoes[i];
      const keyA = a.faccaoId || 'SEM_FACCAO';
      if (hiddenFaccaoIds.has(keyA)) continue;

      for (let j = i + 1; j < validPichacoes.length; j++) {
        const b = validPichacoes[j];
        const keyB = b.faccaoId || 'SEM_FACCAO';
        if (keyA === keyB) continue;
        if (hiddenFaccaoIds.has(keyB)) continue;

        const dist = distanceMeters(a.latitude, a.longitude, b.latitude, b.longitude);
        if (dist <= conflictThreshold) {
          const midLat = (a.latitude + b.latitude) / 2;
          const midLng = (a.longitude + b.longitude) / 2;
          const conflictId = [a.id, b.id].sort().join('_');

          if (!seen.has(conflictId)) {
            seen.add(conflictId);
            conflictsList.push({
              id: conflictId,
              lat: midLat,
              lng: midLng,
              faccaoA: a.faccao?.sigla || a.faccao?.nome || 'Isolada',
              corA: a.faccao?.cor || '#6b7280',
              faccaoB: b.faccao?.sigla || b.faccao?.nome || 'Isolada',
              corB: b.faccao?.cor || '#6b7280',
              distance: Math.round(dist),
            });
          }
        }
      }
    }

    return conflictsList;
  }, [validPichacoes, conflictThreshold, showConflicts, hiddenFaccaoIds]);

  const totalValid = validPichacoes.length;
  const totalConflicts = conflicts.length;

  if (totalValid === 0) {
    return (
      <div className="w-full h-full rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center px-6">
          <div className="text-4xl mb-3">🗺️</div>
          <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">
            Nenhum registro com coordenadas geográficas válidas
          </p>
          <p className="text-xs text-gray-500 mt-1 max-w-[260px]">
            Para visualizar zonas de atuação, adicione latitude/longitude nas pichações (use GPS ou preencha manualmente).
          </p>
        </div>
      </div>
    );
  }

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

        {/* Influence Zones (large translucent circles = "cobertura" like cell signal) */}
        {showInfluenceZones && (
          <LayerGroup>
            {groups.map((group) =>
              group.items.map((p) => (
                <Circle
                  key={`zone-${group.key}-${p.id}`}
                  center={[p.latitude, p.longitude]}
                  radius={influenceRadius}
                  pathOptions={{
                    fillColor: group.cor,
                    fillOpacity: 0.12,
                    color: group.cor,
                    weight: 1.5,
                    opacity: 0.35,
                  }}
                >
                  <Popup>
                    <div className="text-xs font-sans">
                      <div className="font-bold" style={{ color: group.cor }}>
                        {group.label}
                      </div>
                      <div className="text-[10px] text-gray-600">Zona de influência estimada</div>
                      <div className="mt-1 text-[10px]">{p.endereco}</div>
                      <button
                        onClick={() => onSelect(p)}
                        className="mt-2 w-full text-center text-[10px] py-0.5 rounded bg-gray-800 text-white hover:bg-black"
                      >
                        Ver ficha completa
                      </button>
                    </div>
                  </Popup>
                </Circle>
              ))
            )}
          </LayerGroup>
        )}

        {/* Actual registered points */}
        {showPoints && (
          <LayerGroup>
            {groups.map((group) =>
              group.items.map((p) => (
                <CircleMarker
                  key={`pt-${p.id}`}
                  center={[p.latitude, p.longitude]}
                  radius={7}
                  fillColor={group.cor}
                  color="#fff"
                  weight={1.5}
                  fillOpacity={0.95}
                  eventHandlers={{
                    click: () => onSelect(p),
                  }}
                >
                  <Popup>
                    <div className="p-1 font-sans max-w-[220px]">
                      <div
                        className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mb-1.5 text-white"
                        style={{ backgroundColor: group.cor }}
                      >
                        {group.label}
                      </div>
                      <div className="text-xs font-semibold text-gray-800">{p.municipio} - RO</div>
                      <div className="text-[11px] text-gray-600 truncate">{p.endereco}</div>
                      {p.descricao && (
                        <div className="text-[10px] text-gray-500 italic line-clamp-2 mt-1">“{p.descricao}”</div>
                      )}
                      <button
                        onClick={() => onSelect(p)}
                        className="mt-2 w-full py-1 text-[10px] font-bold rounded bg-purple-600 hover:bg-purple-700 text-white"
                      >
                        Abrir Registro
                      </button>
                    </div>
                  </Popup>
                </CircleMarker>
              ))
            )}
          </LayerGroup>
        )}

        {/* Conflict zones */}
        {showConflicts && conflicts.length > 0 && (
          <LayerGroup>
            {conflicts.map((c) => (
              <Circle
                key={`conflict-${c.id}`}
                center={[c.lat, c.lng]}
                radius={Math.max(180, Math.min(450, c.distance / 2))}
                pathOptions={{
                  fillColor: '#ef4444',
                  fillOpacity: 0.18,
                  color: '#b91c1c',
                  weight: 2,
                  dashArray: '4,3',
                  opacity: 0.9,
                }}
              >
                <Popup>
                  <div className="text-xs font-sans max-w-[230px]">
                    <div className="font-extrabold text-red-700 flex items-center gap-1.5">
                      ⚠️ ZONA DE CONFLITO / DISPUTA TERRITORIAL
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[11px]">
                      <span style={{ color: c.corA }} className="font-bold">{c.faccaoA}</span>
                      <span className="text-gray-400">×</span>
                      <span style={{ color: c.corB }} className="font-bold">{c.faccaoB}</span>
                    </div>
                    <div className="text-[10px] text-gray-600 mt-1">
                      Marcas a {c.distance}m de distância.<br />
                      Área de sobreposição / disputa pelo espaço.
                    </div>
                  </div>
                </Popup>
              </Circle>
            ))}
          </LayerGroup>
        )}
      </MapContainer>

      {/* Floating mini-legend + stats inside the map container */}
      <div className="absolute bottom-3 left-3 z-[500] bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-[10px] shadow-lg max-w-[240px]">
        <div className="font-bold text-gray-800 dark:text-gray-200 mb-1">Legenda de Atuação</div>
        <div className="space-y-1 max-h-[120px] overflow-auto pr-1">
          {groups.length === 0 && <div className="text-gray-500">Nenhuma facção visível</div>}
          {groups.map((g) => (
            <div key={g.key} className="flex items-center gap-2">
              <span
                className="inline-block w-3 h-3 rounded-full border border-white/70"
                style={{ backgroundColor: g.cor }}
              />
              <span className="font-semibold truncate text-gray-800 dark:text-gray-200">{g.label}</span>
              <span className="ml-auto tabular-nums text-gray-500">{g.items.length}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 mt-2 pt-1.5 text-[10px] text-gray-500 flex justify-between">
          <span>{totalValid} marcas georreferenciadas</span>
          {totalConflicts > 0 && <span className="text-red-600 font-semibold">{totalConflicts} conflitos</span>}
        </div>
      </div>

      {/* Small hint */}
      <div className="absolute top-3 right-3 z-[500] bg-black/60 text-white text-[9px] px-2 py-0.5 rounded font-mono tracking-wider">
        Raio: {Math.round(influenceRadius / 100) / 10}km • Conflito: {Math.round(conflictThreshold / 100) / 10}km
      </div>
    </div>
  );
}
