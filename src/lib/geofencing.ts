import { prisma } from './db';

/**
 * Calcula se um ponto (lat, lng) está dentro de um círculo definido por centro e raio (em metros).
 * Utiliza a fórmula de Haversine para cálculo de distância em esfera.
 */
export function isPointInCircle(
  lat: number,
  lng: number,
  centerLat: number,
  centerLng: number,
  radiusInMeters: number
): boolean {
  const R = 6371e3; // Raio da Terra em metros
  const phi1 = (lat * Math.PI) / 180;
  const phi2 = (centerLat * Math.PI) / 180;
  const deltaPhi = ((centerLat - lat) * Math.PI) / 180;
  const deltaLambda = ((centerLng - lng) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance <= radiusInMeters;
}

/**
 * Calcula se um ponto (lat, lng) está dentro de um polígono fechado.
 * Utiliza o algoritmo de Ray-Casting (Point-in-Polygon).
 */
export function isPointInPolygon(
  lat: number,
  lng: number,
  polygon: { lat: number; lng: number }[]
): boolean {
  if (!polygon || polygon.length < 3) return false;
  
  let isInside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;

    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;

    if (intersect) isInside = !isInside;
  }
  return isInside;
}

/**
 * Verifica as coordenadas do usuário em relação a todas as cercas geográficas ativas no banco.
 * 
 * Regra:
 * - Se houver cercas ativas do tipo 'deny' (Bloqueio), o usuário NÃO pode estar dentro de nenhuma delas.
 * - Se houver cercas ativas do tipo 'allow' (Permissão), o usuário DEVE estar dentro de pelo menos uma delas.
 */
export async function checkLocationAgainstGeofences(
  lat: number,
  lng: number
): Promise<{ isAllowed: boolean; blockedByFenceName?: string }> {
  try {
    const fences = await prisma.geofence.findMany({
      where: { isActive: true },
    });

    if (fences.length === 0) {
      return { isAllowed: true };
    }

    const allowFences = fences.filter((f) => f.action === 'allow');
    const denyFences = fences.filter((f) => f.action === 'deny');

    // 1. Verificar cercas do tipo "deny" (Bloqueio)
    for (const fence of denyFences) {
      const coords = fence.coordinates as any;
      let isInside = false;

      if (fence.type === 'circle' && coords && typeof coords.lat === 'number') {
        isInside = isPointInCircle(lat, lng, coords.lat, coords.lng, coords.radius);
      } else if (fence.type === 'polygon' && Array.isArray(coords)) {
        isInside = isPointInPolygon(lat, lng, coords);
      }

      if (isInside) {
        return {
          isAllowed: false,
          blockedByFenceName: fence.name,
        };
      }
    }

    // 2. Verificar cercas do tipo "allow" (Permissão - obrigatório estar dentro)
    if (allowFences.length > 0) {
      let insideAnyAllow = false;
      
      for (const fence of allowFences) {
        const coords = fence.coordinates as any;
        let isInside = false;

        if (fence.type === 'circle' && coords && typeof coords.lat === 'number') {
          isInside = isPointInCircle(lat, lng, coords.lat, coords.lng, coords.radius);
        } else if (fence.type === 'polygon' && Array.isArray(coords)) {
          isInside = isPointInPolygon(lat, lng, coords);
        }

        if (isInside) {
          insideAnyAllow = true;
          break; // O usuário está em pelo menos uma área permitida
        }
      }

      if (!insideAnyAllow) {
        return {
          isAllowed: false,
          blockedByFenceName: 'Fora do perímetro autorizado',
        };
      }
    }

    return { isAllowed: true };
  } catch (err) {
    console.error('[Geofencing] Erro ao validar cercas:', err);
    // Em caso de erro na consulta do banco, por padrão de falha segura, permitimos o acesso
    return { isAllowed: true };
  }
}
