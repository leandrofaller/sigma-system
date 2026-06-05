/**
 * Tipos e constantes compartilhados entre GeoMonitorPanel e GeoMap.
 * Separado do GeoMap.tsx para evitar importar leaflet no servidor (SSR).
 */

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
  googleSatellite: {
    label: 'Google Híbrido (Satélite)',
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    attribution: '© Google Maps',
  },
  googleSatellitePure: {
    label: 'Google Satélite (Limpo)',
    url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    attribution: '© Google Maps',
  },
  googleTerrain: {
    label: 'Google Terreno (Físico)',
    url: 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',
    attribution: '© Google Maps',
  },
  satellite: {
    label: 'Esri (Satélite)',
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
