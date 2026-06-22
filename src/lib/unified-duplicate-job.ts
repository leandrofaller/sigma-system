import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import sharp from 'sharp';
import { prisma } from './db';
import { getApenadoPhotoPath } from './storage';

const BATCH_SIZE = 200;
const CONCURRENCY = 4;
const DHASH_THRESHOLD = 3; // Hamming ≤ 3/64 bits — genuinamente quase idênticas
const MAX_BUCKET_SIZE = 500; // Prevent O(n²) blowup with highly similar photos

const FACE_SIM_THRESHOLD = 0.72; // cosine similarity ≥ 0.72 → mesmo indivíduo
const FACE_HAMMING_THRESHOLD = 20; // pré-filtro SimHash: Hamming ≤ 20/64 bits (~91% recall)
const FACE_BATCH_SIZE = 5000;

export interface DupRecord {
  id: string;
  name: string;
  matricula: string | null;
  unidade: string | null;
  faccao: string | null;
  photoPath: string | null;
  photoQuality: number | null;
  hasFace: boolean;
  category: 'doc' | 'tattoo' | 'other';
  hasAip?: boolean;
  hasSipe?: boolean;
  sipeId?: number | null;
  situacao?: string | null;
}

export interface DupGroup {
  type: 'exact' | 'similar' | 'face';
  category: 'doc' | 'tattoo' | 'other';
  records: DupRecord[];
}

export type DupJobPhase = 'idle' | 'indexing' | 'detecting' | 'done';

export interface UnifiedDupJobState {
  phase: DupJobPhase;
  indexingCurrent: number;
  indexingTotal: number;
  groups: DupGroup[];
  totalGroups: number;
  totalAnalyzed: number;
  faceGroupsCount: number;
  error: string;
}

let state: UnifiedDupJobState = {
  phase: 'idle',
  indexingCurrent: 0,
  indexingTotal: 0,
  groups: [],
  totalGroups: 0,
  totalAnalyzed: 0,
  faceGroupsCount: 0,
  error: '',
};

export function getUnifiedDupState(): UnifiedDupJobState {
  return state;
}

export function startUnifiedDupJob(): boolean {
  if (state.phase === 'indexing' || state.phase === 'detecting') return false;
  state = { ...state, phase: 'indexing', indexingCurrent: 0, indexingTotal: 0, error: '' };
  runJob().catch((err) => {
    state = { ...state, phase: 'idle', error: err?.message ?? 'Erro desconhecido' };
  });
  return true;
}

async function analyzePhoto(
  filePath: string,
): Promise<{ sha256: string; dHash: string; quality: number } | null> {
  try {
    const buf = await readFile(filePath);

    const sha256 = createHash('sha256').update(buf).digest('hex');

    const [hashRaw, qualityResult] = await Promise.all([
      sharp(buf)
        .resize(9, 8, { fit: 'fill', kernel: 'nearest' })
        .grayscale()
        .raw()
        .toBuffer(),
      sharp(buf)
        .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
        .grayscale()
        .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0] })
        .raw()
        .toBuffer({ resolveWithObject: true }),
    ]);

    // dHash 64-bit: compare adjacent pixels in each row
    let hashBig = 0n;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        hashBig =
          (hashBig << 1n) | (hashRaw[row * 9 + col] > hashRaw[row * 9 + col + 1] ? 1n : 0n);
      }
    }
    const dHash = hashBig.toString(16).padStart(16, '0');

    // Laplacian variance → sharpness score
    const { data, info } = qualityResult;
    const n = info.width * info.height;
    let sum = 0,
      sumSq = 0;
    for (let i = 0; i < n; i++) {
      sum += data[i];
      sumSq += data[i] * data[i];
    }
    const mean = n > 0 ? sum / n : 0;
    const quality = n > 0 ? Math.round((sumSq / n - mean * mean) * 100) / 100 : 0;

    return { sha256, dHash, quality };
  } catch {
    return null;
  }
}

function hammingDistance(a: string, b: string): number {
  try {
    let diff = BigInt('0x' + a) ^ BigInt('0x' + b);
    let n = 0;
    while (diff > 0n) {
      diff &= diff - 1n;
      n++;
    }
    return n;
  } catch {
    return 64;
  }
}

// Fast 32-bit popcount using Hamming weight algorithm
function popcount32(x: number): number {
  x = x | 0;
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return (Math.imul(x, 0x01010101) >>> 24);
}

// Deterministic 64×512 random projection matrix for SimHash.
// Seeded LCG so every run produces the same projections.
function buildProjectionMatrix(): Float32Array {
  const DIMS = 512;
  const PROJ = 64;
  const proj = new Float32Array(PROJ * DIMS);
  let seed = 0xDEADBEEF >>> 0;
  const lcg = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed / 0xFFFFFFFF) * 2 - 1; // [-1, 1)
  };
  for (let p = 0; p < PROJ; p++) {
    let norm = 0;
    const base = p * DIMS;
    for (let d = 0; d < DIMS; d++) {
      const v = lcg();
      proj[base + d] = v;
      norm += v * v;
    }
    norm = Math.sqrt(norm);
    for (let d = 0; d < DIMS; d++) proj[base + d] /= norm;
  }
  return proj;
}

interface RawRecord {
  id: string;
  name: string;
  matricula: string | null;
  unidade: string | null;
  faccao: string | null;
  photoPath: string | null;
  photoHashSha: string | null;
  photoHash: string | null;
  photoQuality: number | null;
  hasFace: boolean;
  ocrText: string | null;
  hasAip: boolean;
  hasSipe: boolean;
  sipeId: number | null;
  situacao: string | null;
}

function makeFind(parent: Map<string, string>) {
  return function find(x: string): string {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // Iterative path compression
    let curr = x;
    while (curr !== root) {
      const next = parent.get(curr)!;
      parent.set(curr, root);
      curr = next;
    }
    return root;
  };
}

// ── Phase C: face-based duplicate detection using ArcFace embeddings ─────────
async function runFacePhase(
  idSet: Set<string>,
  parent: Map<string, string>,
  find: (x: string) => string,
): Promise<void> {
  const projMatrix = buildProjectionMatrix();
  const DIMS = 512;
  const PROJ = 64;

  // Load embeddings cursor-paged, only for records in idSet
  const ids: string[] = [];
  const allVecs: Float32Array[] = [];
  let cursor = '';

  while (true) {
    const batch = await prisma.$queryRaw<{ id: string; fd: string }[]>`
      SELECT id, "faceDescriptor" AS fd
      FROM apenados
      WHERE "faceDescriptor" IS NOT NULL
        AND "faceDescriptor" != ''
        AND id > ${cursor}
      ORDER BY id ASC
      LIMIT ${FACE_BATCH_SIZE}
    `;
    if (batch.length === 0) break;

    for (const row of batch) {
      if (!idSet.has(row.id)) continue; // only indexed records
      try {
        const arr: number[] = JSON.parse(row.fd);
        if (!Array.isArray(arr) || arr.length !== DIMS) continue;
        const vec = new Float32Array(DIMS);
        for (let d = 0; d < DIMS; d++) vec[d] = arr[d];
        ids.push(row.id);
        allVecs.push(vec);
      } catch {
        // skip invalid
      }
    }

    cursor = batch[batch.length - 1].id;
    if (batch.length < FACE_BATCH_SIZE) break;
    await new Promise<void>((r) => setImmediate(r));
  }

  const N = ids.length;
  if (N < 2) return;

  // Pack all vectors into a single Float32Array for cache-friendly access
  const vecArray = new Float32Array(N * DIMS);
  for (let i = 0; i < N; i++) vecArray.set(allVecs[i], i * DIMS);

  // Compute 64-bit SimHash for each embedding (stored as two Int32 halves)
  const simLo = new Int32Array(N); // bits 0-31
  const simHi = new Int32Array(N); // bits 32-63

  for (let i = 0; i < N; i++) {
    let lo = 0, hi = 0;
    const vBase = i * DIMS;
    for (let p = 0; p < PROJ; p++) {
      let dot = 0;
      const pBase = p * DIMS;
      for (let d = 0; d < DIMS; d++) dot += vecArray[vBase + d] * projMatrix[pBase + d];
      if (dot > 0) {
        if (p < 32) lo |= (1 << p);
        else hi |= (1 << (p - 32));
      }
    }
    simLo[i] = lo;
    simHi[i] = hi;
    if ((i + 1) % 2000 === 0) await new Promise<void>((r) => setImmediate(r));
  }

  // ── LSH Bucket Indexing for Face SimHash ──────────────────────────────────
  const faceBandMaps: Map<number, number[]>[] = [new Map(), new Map(), new Map(), new Map()];
  const MAX_FACE_BUCKET_SIZE = 100;

  for (let i = 0; i < N; i++) {
    const lo = simLo[i];
    const hi = simHi[i];
    const bands = [
      lo & 0xffff,
      (lo >>> 16) & 0xffff,
      hi & 0xffff,
      (hi >>> 16) & 0xffff,
    ];
    for (let b = 0; b < 4; b++) {
      const val = bands[b];
      const bucket = faceBandMaps[b].get(val);
      if (!bucket) {
        faceBandMaps[b].set(val, [i]);
      } else if (bucket.length < MAX_FACE_BUCKET_SIZE) {
        bucket.push(i);
      }
    }
    if ((i + 1) % 5000 === 0) await new Promise<void>((r) => setImmediate(r));
  }

  // Coletar pares de candidatos a partir dos baldes aplicando pré-filtro Hamming
  const faceCandidatePairs = new Set<string>();
  let iteration = 0;

  for (const bm of faceBandMaps) {
    for (const indices of bm.values()) {
      if (indices.length < 2) continue;
      for (let i = 0; i < indices.length; i++) {
        for (let j = i + 1; j < indices.length; j++) {
          const idxA = indices[i];
          const idxB = indices[j];
          const a = idxA < idxB ? idxA : idxB;
          const b = idxA < idxB ? idxB : idxA;
          
          // Calcula Hamming para filtrar antes de guardar no Set
          const hamming = popcount32(simLo[a] ^ simLo[b]) + popcount32(simHi[a] ^ simHi[b]);
          if (hamming <= FACE_HAMMING_THRESHOLD) {
            faceCandidatePairs.add(`${a}|${b}`);
          }
          if (++iteration % 50_000 === 0) await new Promise<void>((r) => setImmediate(r));
        }
      }
    }
  }

  // Comparação detalhada (cosseno exato) dos candidatos que passaram no pré-filtro
  iteration = 0;
  for (const pair of faceCandidatePairs) {
    const [idxAStr, idxBStr] = pair.split('|');
    const idxA = parseInt(idxAStr, 10);
    const idxB = parseInt(idxBStr, 10);

    // Exact cosine similarity (dot product on L2-normalized embeddings)
    const iBase = idxA * DIMS, jBase = idxB * DIMS;
    let dot = 0;
    for (let d = 0; d < DIMS; d++) dot += vecArray[iBase + d] * vecArray[jBase + d];
    if (dot >= FACE_SIM_THRESHOLD) {
      const ra = find(ids[idxA]), rb = find(ids[idxB]);
      if (ra !== rb) parent.set(ra, rb);
    }
    if (++iteration % 50_000 === 0) await new Promise<void>((r) => setImmediate(r));
  }
}

function getRecordCategory(
  r: { photoPath: string | null; photoQuality: number | null; photoHash: string | null; ocrText: string | null; id: string; hasFace: boolean },
  dupHashesSet: Set<string>,
  tattooApenadosSet: Set<string>
): 'doc' | 'tattoo' | 'other' {
  if (r.hasFace) return 'other';

  const ocrLower = r.ocrText?.toLowerCase() ?? '';
  const pathLower = r.photoPath?.toLowerCase() ?? '';

  const isDocKeywords = /registro|geral|identidade|cpf|rg|nascimento|eleitor|carteira|certificado|uf|estado|republica|ministerio|filiacao|orgao|expedicao|sipe|penal|secretaria/.test(ocrLower);
  const isDocPath = /doc|rg|cpf|documento/.test(pathLower);
  const isLowQuality = r.photoQuality !== null && r.photoQuality < 5;
  const isPlaceholderHash = r.photoHash !== null && dupHashesSet.has(r.photoHash);

  if (isDocKeywords || isDocPath || isLowQuality || isPlaceholderHash) {
    return 'doc';
  }

  const isTattooPath = /tatuagem|tattoo|tatoo|tatuag/.test(pathLower);
  const hasTattooComplement = tattooApenadosSet.has(r.id);

  if (isTattooPath || hasTattooComplement) {
    return 'tattoo';
  }

  return 'other';
}

async function buildGroupsAsync(records: RawRecord[]): Promise<DupGroup[]> {
  const idToRecord = new Map(records.map((r) => [r.id, r]));
  const parent = new Map<string, string>(records.map((r) => [r.id, r.id]));
  const find = makeFind(parent);
  const pixelMergedIds = new Set<string>(); // IDs merged via pixel hashing (phases A & B)

  // ── Phase A: SHA-256 exact grouping ───────────────────────────────────────
  const bySha = new Map<string, string[]>();
  for (const r of records) {
    if (!r.photoHashSha) continue;
    const arr = bySha.get(r.photoHashSha) ?? [];
    arr.push(r.id);
    bySha.set(r.photoHashSha, arr);
  }
  for (const ids of bySha.values()) {
    if (ids.length < 2) continue;
    for (let i = 1; i < ids.length; i++) {
      const ra = find(ids[0]),
        rb = find(ids[i]);
      if (ra !== rb) parent.set(ra, rb);
      pixelMergedIds.add(ids[0]);
      pixelMergedIds.add(ids[i]);
    }
  }

  await new Promise<void>((r) => setImmediate(r));

  // ── Phase B: dHash LSH near-duplicate grouping ────────────────────────────
  const validRecords = records.filter((r) => r.photoHash?.length === 16);
  const bandMaps: Map<string, string[]>[] = [new Map(), new Map(), new Map(), new Map()];

  for (const r of validRecords) {
    try {
      const n = BigInt('0x' + r.photoHash!);
      const bands = [
        ((n >> 48n) & 0xffffn).toString(16).padStart(4, '0'),
        ((n >> 32n) & 0xffffn).toString(16).padStart(4, '0'),
        ((n >> 16n) & 0xffffn).toString(16).padStart(4, '0'),
        (n & 0xffffn).toString(16).padStart(4, '0'),
      ];
      for (let b = 0; b < 4; b++) {
        const key = `${b}:${bands[b]}`;
        const bucket = bandMaps[b].get(key);
        if (!bucket) bandMaps[b].set(key, [r.id]);
        else if (bucket.length < MAX_BUCKET_SIZE) bucket.push(r.id);
      }
    } catch {
      // invalid hash — skip
    }
  }

  await new Promise<void>((r) => setImmediate(r));

  const candidatePairs = new Set<string>();
  let iteration = 0;

  for (const bm of bandMaps) {
    for (const ids of bm.values()) {
      if (ids.length < 2) continue;
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const idA = ids[i] < ids[j] ? ids[i] : ids[j];
          const idB = ids[i] < ids[j] ? ids[j] : ids[i];
          
          const a = idToRecord.get(idA);
          const b = idToRecord.get(idB);
          if (a?.photoHash && b?.photoHash && hammingDistance(a.photoHash, b.photoHash) <= DHASH_THRESHOLD) {
            candidatePairs.add(`${idA}|${idB}`);
          }
          if (++iteration % 50_000 === 0) await new Promise<void>((r) => setImmediate(r));
        }
      }
    }
  }

  await new Promise<void>((r) => setImmediate(r));

  iteration = 0;
  for (const pair of candidatePairs) {
    const [idA, idB] = pair.split('|');
    const ra = find(idA),
      rb = find(idB);
    if (ra !== rb) parent.set(ra, rb);
    pixelMergedIds.add(idA);
    pixelMergedIds.add(idB);
    if (++iteration % 50_000 === 0) await new Promise<void>((r) => setImmediate(r));
  }

  // ── Phase C: face similarity via ArcFace embeddings ──────────────────────
  const idSet = new Set(records.map((r) => r.id));
  try {
    await runFacePhase(idSet, parent, find);
  } catch {
    // face phase failure is non-fatal — proceed with pixel-only groups
  }

  // ── Build output groups ───────────────────────────────────────────────────
  const groupMap = new Map<string, RawRecord[]>();
  for (const r of records) {
    const root = find(r.id);
    const arr = groupMap.get(root) ?? [];
    arr.push(r);
    groupMap.set(root, arr);
  }

  // Obter hashes altamente duplicados (placeholders de "sem foto")
  const dupHashes = await prisma.$queryRaw<{ photoHash: string }[]>`
    SELECT "photoHash" FROM apenados
    WHERE "faceDescriptor" = 'NONE' AND "photoHash" IS NOT NULL
    GROUP BY "photoHash"
    HAVING COUNT(*) >= 5
  `;
  const dupHashesSet = new Set(dupHashes.map((h) => h.photoHash));

  // Obter apenados com fotos complementares de tatuagem/cicatriz
  const tattooApenados = await prisma.$queryRaw<{ apenadoLocalId: string }[]>`
    SELECT DISTINCT "apenadoLocalId" FROM sipe_fotos_complementares
    WHERE "apenadoLocalId" IS NOT NULL
      AND descricao IS NOT NULL
      AND descricao ~* 'tatuagem|tattoo|tatoo|tatuag|cicatriz'
  `;
  const tattooApenadosSet = new Set(tattooApenados.map((t) => t.apenadoLocalId));

  return Array.from(groupMap.values())
    .filter((g) => g.length >= 2)
    .map((g) => {
      // Keeper: foto com rosto primeiro; dentro de cada tier, maior qualidade primeiro
      const sorted = g.sort((a, b) => {
        const hasAipA = a.hasAip ? 1 : 0;
        const hasAipB = b.hasAip ? 1 : 0;
        if (hasAipA !== hasAipB) return hasAipB - hasAipA;

        const hasSipeA = a.hasSipe ? 1 : 0;
        const hasSipeB = b.hasSipe ? 1 : 0;
        if (hasSipeA !== hasSipeB) return hasSipeB - hasSipeA;

        if (a.hasFace !== b.hasFace) return a.hasFace ? -1 : 1;
        return (b.photoQuality ?? 0) - (a.photoQuality ?? 0);
      });
      const sha = sorted[0].photoHashSha;
      const allSameSha = sha != null && sorted.every((r) => r.photoHashSha === sha);
      const keeperHash = sorted[0].photoHash;
      const allIdenticalDHash = keeperHash != null && sorted.every((r) => {
        if (!r.photoHash) return false;
        return hammingDistance(keeperHash, r.photoHash) <= 1;
      });
      const hasPixelMerge = sorted.some((r) => pixelMergedIds.has(r.id));
      const type: 'exact' | 'similar' | 'face' = (allSameSha || allIdenticalDHash)
        ? 'exact'
        : hasPixelMerge
          ? 'similar'
          : 'face';
      
      const firstRec = sorted[0];
      const category = getRecordCategory(firstRec, dupHashesSet, tattooApenadosSet);

      return {
        type,
        category,
        records: sorted.map(({ photoHashSha: _s, photoHash: _h, ocrText: _o, ...rest }) => ({
          ...rest,
          category: getRecordCategory({ ...rest, photoHash: _h, ocrText: _o } as any, dupHashesSet, tattooApenadosSet)
        })),
      };
    });
}

async function runJob(): Promise<void> {
  // ── Phase 1: Indexing ──────────────────────────────────────────────────────
  const total = await prisma.apenado.count({
    where: {
      photoPath: { not: null },
      OR: [{ photoHashSha: null }, { photoHash: null }, { photoQuality: null }],
    },
  });
  state = { ...state, indexingTotal: total };

  if (total > 0) {
    let cursor = '';
    let processed = 0;

    while (true) {
      const batch = await prisma.$queryRaw<
        { id: string; photoPath: string; photoHashSha: string | null; photoHash: string | null }[]
      >`
        SELECT id, "photoPath", "photoHashSha", "photoHash"
        FROM apenados
        WHERE "photoPath" IS NOT NULL
          AND (
            "photoHashSha" IS NULL
            OR "photoHash" IS NULL
            OR "photoQuality" IS NULL
          )
          AND id > ${cursor}
        ORDER BY id ASC
        LIMIT ${BATCH_SIZE}
      `;
      if (batch.length === 0) break;

      const results: { id: string; sha256: string; dHash: string; quality: number }[] = [];
      let idx = 0;
      const worker = async () => {
        while (idx < batch.length) {
          const i = idx++;
          const a = batch[i];
          const analysis = await analyzePhoto(getApenadoPhotoPath(a.photoPath));
          if (analysis) {
            results.push({
              id: a.id,
              sha256: a.photoHashSha ?? analysis.sha256,
              dHash: a.photoHash ?? analysis.dHash,
              quality: analysis.quality,
            });
          }
        }
      };

      await Promise.all(Array.from({ length: CONCURRENCY }, worker));

      if (results.length > 0) {
        await prisma.$transaction(
          results.map((r) =>
            prisma.apenado.update({
              where: { id: r.id },
              data: { photoHashSha: r.sha256, photoHash: r.dHash, photoQuality: r.quality },
            }),
          ),
        );
      }

      processed += batch.length;
      state = { ...state, indexingCurrent: processed };
      cursor = batch[batch.length - 1].id;
      if (batch.length < BATCH_SIZE) break;
    }
  }

  // ── Phase 2: Detection ─────────────────────────────────────────────────────
  state = { ...state, phase: 'detecting' };

  const records = await prisma.$queryRaw<RawRecord[]>`
    SELECT a.id, a.name, a.matricula, a.unidade, a.faccao, a."photoPath",
           a."photoHashSha", a."photoHash", a."photoQuality",
           (a."faceDescriptor" IS NOT NULL AND a."faceDescriptor" != '') AS "hasFace",
           a."ocrText",
           EXISTS (
             SELECT 1 FROM sipe_apenados_importados s
             JOIN aip_apenados ai ON s."sipeId" = ai."sipeApenadoId"
             WHERE s."apenadoLocalId" = a.id
           ) AS "hasAip",
           EXISTS (
             SELECT 1 FROM sipe_apenados_importados s
             WHERE s."apenadoLocalId" = a.id
           ) AS "hasSipe",
           (
             SELECT s."sipeId" FROM sipe_apenados_importados s
             WHERE s."apenadoLocalId" = a.id
             LIMIT 1
           ) AS "sipeId",
           (
             SELECT s.situacao FROM sipe_apenados_importados s
             WHERE s."apenadoLocalId" = a.id
             LIMIT 1
           ) AS "situacao"
    FROM apenados a
    WHERE a."photoPath" IS NOT NULL
      AND a."photoHash" IS NOT NULL
      AND a."photoHashSha" IS NOT NULL
    ORDER BY a.name ASC
  `;

  const groups = await buildGroupsAsync(records);
  const faceGroupsCount = groups.filter((g) => g.type === 'face').length;

  state = {
    phase: 'done',
    indexingCurrent: state.indexingCurrent,
    indexingTotal: state.indexingTotal,
    groups,
    totalGroups: groups.length,
    totalAnalyzed: records.length,
    faceGroupsCount,
    error: '',
  };
}
