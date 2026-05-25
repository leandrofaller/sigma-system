import { prisma } from './db';

export interface CachedFace {
  id: string;
  name: string;
  matricula: string | null;
  unidade: string | null;
  faccao: string | null;
  photoPath: string | null;
}

export interface FaceCache {
  meta: CachedFace[];
  // Packed Float32Array: vecs[i*512 .. (i+1)*512] = embedding for meta[i]
  vecs: Float32Array;
  count: number;
  loadedAt: number;
}

export interface CacheStatus {
  loaded: boolean;
  loading: boolean;
  count: number;
  loadedAt: number | null;
  error: string | null;
}

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

let cache: FaceCache | null = null;
let loadingPromise: Promise<FaceCache> | null = null;
let lastError: string | null = null;

function hexDecode(hex: string | null): string | null {
  if (!hex) return null;
  const s = Buffer.from(hex, 'hex').toString('utf8').replace(/\x00/g, '');
  return s || null;
}

async function loadFromDB(): Promise<FaceCache> {
  const rawRows = await prisma.$queryRaw<{
    id: string; name: string;
    matricula: string | null; unidade: string | null;
    faccao: string | null; photoPath: string | null;
    faceDescriptor: string;
  }[]>`
    SELECT
      encode(id::bytea,               'hex') AS id,
      encode(name::bytea,             'hex') AS name,
      encode(matricula::bytea,        'hex') AS matricula,
      encode(unidade::bytea,          'hex') AS unidade,
      encode(faccao::bytea,           'hex') AS faccao,
      encode("photoPath"::bytea,      'hex') AS "photoPath",
      encode("faceDescriptor"::bytea, 'hex') AS "faceDescriptor"
    FROM apenados
    WHERE "faceDescriptor" IS NOT NULL
  `;

  const meta: CachedFace[] = [];
  const vecArrays: number[][] = [];

  for (const row of rawRows) {
    const descHex = row.faceDescriptor;
    if (!descHex) continue;
    const descStr = Buffer.from(descHex, 'hex').toString('utf8').replace(/\x00/g, '');
    if (!descStr.startsWith('[')) continue;
    let arr: number[];
    try { arr = JSON.parse(descStr); } catch { continue; }
    if (!Array.isArray(arr) || arr.length !== 512) continue;

    meta.push({
      id: Buffer.from(row.id, 'hex').toString('utf8'),
      name: Buffer.from(row.name, 'hex').toString('utf8').replace(/\x00/g, ''),
      matricula: hexDecode(row.matricula),
      unidade: hexDecode(row.unidade),
      faccao: hexDecode(row.faccao),
      photoPath: hexDecode(row.photoPath),
    });
    vecArrays.push(arr);
  }

  const count = meta.length;
  const vecs = new Float32Array(count * 512);
  for (let i = 0; i < count; i++) {
    vecs.set(vecArrays[i], i * 512);
  }

  return { meta, vecs, count, loadedAt: Date.now() };
}

function startLoad(): Promise<FaceCache> {
  lastError = null;
  loadingPromise = loadFromDB()
    .then((c) => {
      cache = c;
      loadingPromise = null;
      return c;
    })
    .catch((err) => {
      lastError = err?.message ?? 'Erro desconhecido';
      loadingPromise = null;
      throw err;
    });
  return loadingPromise;
}

// Non-blocking warm-up: starts loading in background, does not throw.
export function warmFaceCache(): void {
  const now = Date.now();
  if (loadingPromise) return;
  if (cache && now - cache.loadedAt < CACHE_TTL) return;
  startLoad().catch(() => {});
}

// Returns cache, waiting if it's currently loading. Throws on load error.
export async function getFaceCache(forceRefresh = false): Promise<FaceCache> {
  const now = Date.now();
  if (!forceRefresh && cache && now - cache.loadedAt < CACHE_TTL) return cache;
  if (loadingPromise) return loadingPromise;
  return startLoad();
}

// Call after indexing new photos so the next search reloads.
export function invalidateFaceCache(): void {
  cache = null;
}

export function getCacheStatus(): CacheStatus {
  return {
    loaded: cache !== null,
    loading: loadingPromise !== null,
    count: cache?.count ?? 0,
    loadedAt: cache?.loadedAt ?? null,
    error: lastError,
  };
}
