/**
 * Pure utility functions + types for Pichações Territory / Heatmap analysis.
 * 
 * These are used by both the map visualization and the lateral statistics panel + export.
 * All functions are side-effect free and easily testable.
 */

export interface ValidPichacao {
  id: string;
  municipio: string;
  endereco: string;
  latitude: number;
  longitude: number;
  descricao: string | null;
  faccaoId: string | null;
  faccao: {
    id: string;
    nome: string;
    sigla: string | null;
    cor: string | null;
  } | null;
}

export interface TerritoryGroup {
  key: string;
  label: string;
  cor: string;
  count: number;
  items: ValidPichacao[];
}

export interface TerritoryConflict {
  id: string;
  lat: number;
  lng: number;
  faccaoA: string;
  corA: string;
  faccaoB: string;
  corB: string;
  distance: number;
  municipioA?: string;
  municipioB?: string;
}

// Haversine distance in meters
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
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

export function getValidGeoPichacoes<T extends { latitude: number | null; longitude: number | null }>(
  pichacoes: T[]
): (T & { latitude: number; longitude: number })[] {
  return pichacoes.filter(
    (p): p is T & { latitude: number; longitude: number } =>
      p.latitude !== null && p.longitude !== null
  );
}

/**
 * Groups valid pichações by facção (or "SEM_FACCAO").
 * Respects hiddenFaccaoIds.
 */
export function groupPichacoesByFaccao(
  validPichacoes: ValidPichacao[],
  hiddenFaccaoIds: Set<string>
): TerritoryGroup[] {
  const map = new Map<string, TerritoryGroup>();

  for (const p of validPichacoes) {
    const key = p.faccaoId || 'SEM_FACCAO';
    if (hiddenFaccaoIds.has(key)) continue;

    const label = p.faccao?.sigla || p.faccao?.nome || 'Fato Isolado';
    const cor = p.faccao?.cor || '#6b7280';

    if (!map.has(key)) {
      map.set(key, {
        key,
        label,
        cor,
        count: 0,
        items: [],
      });
    }
    const group = map.get(key)!;
    group.items.push(p);
    group.count = group.items.length;
  }

  // Sort by count desc
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

/**
 * Detects geographic conflicts between different facções.
 */
export function detectTerritoryConflicts(
  validPichacoes: ValidPichacao[],
  conflictThreshold: number,
  hiddenFaccaoIds: Set<string>
): TerritoryConflict[] {
  const conflicts: TerritoryConflict[] = [];
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
        const conflictId = [a.id, b.id].sort().join('_');
        if (seen.has(conflictId)) continue;
        seen.add(conflictId);

        const midLat = (a.latitude + b.latitude) / 2;
        const midLng = (a.longitude + b.longitude) / 2;

        conflicts.push({
          id: conflictId,
          lat: midLat,
          lng: midLng,
          faccaoA: a.faccao?.sigla || a.faccao?.nome || 'Isolada',
          corA: a.faccao?.cor || '#6b7280',
          faccaoB: b.faccao?.sigla || b.faccao?.nome || 'Isolada',
          corB: b.faccao?.cor || '#6b7280',
          distance: Math.round(dist),
          municipioA: a.municipio,
          municipioB: b.municipio,
        });
      }
    }
  }

  // Sort by distance asc (closest first = more critical)
  return conflicts.sort((x, y) => x.distance - y.distance);
}

/**
 * Simple per-município aggregation (for stats panel).
 */
export function aggregateByMunicipio(valid: ValidPichacao[]) {
  const map = new Map<string, number>();
  for (const p of valid) {
    map.set(p.municipio, (map.get(p.municipio) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([municipio, count]) => ({ municipio, count }))
    .sort((a, b) => b.count - a.count);
}

export type TerritoryAnalysis = {
  totalGeoMarks: number;
  groups: TerritoryGroup[];
  conflicts: TerritoryConflict[];
  byMunicipio: { municipio: string; count: number }[];
  activeFaccoes: number;
  conflictCount: number;
};
