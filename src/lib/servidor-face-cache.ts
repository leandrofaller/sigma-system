import { prisma } from './db';

export interface ServidorFaceCache {
  ids: string[];       // IDs dos servidores na mesma ordem que vecs
  vecs: Float32Array;  // Packed: vecs[i*512 .. (i+1)*512] = embedding para ids[i]
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

const CACHE_TTL = 10 * 60 * 1000; // 10 minutos
const BATCH_SIZE = 30_000;

let cache: ServidorFaceCache | null = null;
let loadingPromise: Promise<ServidorFaceCache> | null = null;
let lastError: string | null = null;

async function loadFromDB(): Promise<ServidorFaceCache> {
  const ids: string[] = [];
  // Pré-aloca para 10k embeddings; dobra se necessário
  let vecsBuffer = new Float32Array(10_000 * 512);
  let count = 0;
  let lastId = '';

  while (true) {
    const batch = await prisma.$queryRaw<{ id: string; fd: string }[]>`
      SELECT
        id,
        "faceDescriptor" AS fd
      FROM sejus_servidores
      WHERE "faceDescriptor" IS NOT NULL
        AND "faceDescriptor" LIKE '[%'
        AND "photoPath" IS NOT NULL
        AND id > ${lastId}
      ORDER BY id
      LIMIT ${BATCH_SIZE}
    `;

    if (batch.length === 0) break;

    for (const row of batch) {
      if (!row.fd) continue;
      let arr: number[];
      try { arr = JSON.parse(row.fd); } catch { continue; }
      if (!Array.isArray(arr) || arr.length !== 512) continue;

      // Expande buffer se necessário
      if ((count + 1) * 512 > vecsBuffer.length) {
        const bigger = new Float32Array(vecsBuffer.length * 2);
        bigger.set(vecsBuffer.subarray(0, count * 512));
        vecsBuffer = bigger;
      }

      vecsBuffer.set(arr, count * 512);
      ids.push(row.id);
      count++;
    }

    lastId = batch[batch.length - 1].id;
    if (batch.length < BATCH_SIZE) break;
  }

  const vecs = count * 512 === vecsBuffer.length ? vecsBuffer : vecsBuffer.slice(0, count * 512);
  return { ids, vecs, count, loadedAt: Date.now() };
}

function startLoad(): Promise<ServidorFaceCache> {
  lastError = null;
  loadingPromise = loadFromDB()
    .then((c) => { cache = c; loadingPromise = null; return c; })
    .catch((err) => { lastError = err?.message ?? 'Erro desconhecido'; loadingPromise = null; throw err; });
  return loadingPromise;
}

// Inicia carregamento em background. Não bloqueia.
export function warmServidorFaceCache(): void {
  if (loadingPromise) return;
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL) return;
  startLoad().catch(() => {});
}

// Aguarda o cache ficar pronto até timeoutMs.
export function awaitServidorFaceCache(timeoutMs: number): Promise<ServidorFaceCache> {
  warmServidorFaceCache();
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      if (cache && Date.now() - cache.loadedAt < CACHE_TTL) { resolve(cache); return; }
      if (lastError) { reject(new Error(lastError)); return; }
      if (Date.now() >= deadline) {
        reject(new Error(
          'Índice de rostos de servidores ainda carregando. Aguarde alguns instantes e tente novamente.'
        ));
        return;
      }
      setTimeout(check, checkInterval);
    };
    const checkInterval = 300;
    check();
  });
}

// Invalida cache após nova indexação
export function invalidateServidorFaceCache(): void {
  cache = null;
}

export function getServidorCacheStatus(): CacheStatus {
  return {
    loaded: cache !== null && Date.now() - (cache.loadedAt ?? 0) < CACHE_TTL,
    loading: loadingPromise !== null,
    count: cache?.count ?? 0,
    loadedAt: cache?.loadedAt ?? null,
    error: lastError,
  };
}
