import L from 'leaflet'

/** Camada de satélite Esri — já permitida no CSP (server.arcgisonline.com). */
export const UNIDADE_SATELLITE_TILE = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution:
    '&copy; <a href="https://www.esri.com">Esri</a>, Maxar, Earthstar Geographics',
}

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