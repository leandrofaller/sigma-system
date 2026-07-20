import L from 'leaflet'

/** Camada de satélite Híbrida do Google (Satélite + Nomes de Ruas/Bairros) com suporte a alto zoom. */
export const GOOGLE_HYBRID_TILE = {
  url: 'https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
  subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
  attribution: '&copy; Google Maps',
  maxZoom: 20,
  maxNativeZoom: 20,
}

export const UNIDADE_SATELLITE_TILE = GOOGLE_HYBRID_TILE

let markerIcon: L.DivIcon | null = null

/** Marcador SVG embutido — evita dependência de CDN bloqueada pelo CSP (unpkg). */
export function createUnidadeMarkerIcon(): L.DivIcon {
  if (!markerIcon) {
    markerIcon = L.divIcon({
      className: 'unidade-map-marker-icon',
      html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="30" height="45" role="img" aria-label="Localização">
        <path fill="#2563eb" stroke="#1e3a8a" stroke-width="1.2" d="M12 0C5.37 0 0 5.37 0 12c0 9 12 24 12 24s12-15 12-24C24 5.37 18.63 0 12 0z"/>
        <circle cx="12" cy="12" r="4.5" fill="#ffffff"/>
      </svg>`,
      iconSize: [30, 45],
      iconAnchor: [15, 45],
      popupAnchor: [0, -42],
    })
  }
  return markerIcon
}