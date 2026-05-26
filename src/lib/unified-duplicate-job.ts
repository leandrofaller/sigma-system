import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import sharp from 'sharp';
import { prisma } from './db';
import { getApenadoPhotoPath } from './storage';

const BATCH_SIZE = 200;
const CONCURRENCY = 4;
const DHASH_THRESHOLD = 3; // Hamming ≤ 3/64 bits — genuinamente quase idênticas
const MAX_BUCKET_SIZE = 500; // Prevent O(n²) blowup with highly similar photos

export interface DupRecord {
  id: string;
  name: string;
  matricula: string | null;
  unidade: string | null;
  faccao: string | null;
  photoPath: string | null;
  photoQuality: number | null;
  hasFace: boolean;
}

export interface DupGroup {
  type: 'exact' | 'similar';
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
  error: string;
}

let state: UnifiedDupJobState = {
  phase: 'idle',
  indexingCurrent: 0,
  indexingTotal: 0,
  groups: [],
  totalGroups: 0,
  totalAnalyzed: 0,
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

async function buildGroupsAsync(records: RawRecord[]): Promise<DupGroup[]> {
  const idToRecord = new Map(records.map((r) => [r.id, r]));
  const parent = new Map<string, string>(records.map((r) => [r.id, r.id]));
  const find = makeFind(parent);

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
          const a = ids[i] < ids[j] ? ids[i] : ids[j];
          const b = ids[i] < ids[j] ? ids[j] : ids[i];
          candidatePairs.add(`${a}|${b}`);
          if (++iteration % 50_000 === 0) await new Promise<void>((r) => setImmediate(r));
        }
      }
    }
  }

  await new Promise<void>((r) => setImmediate(r));

  iteration = 0;
  for (const pair of candidatePairs) {
    const [idA, idB] = pair.split('|');
    const a = idToRecord.get(idA);
    const b = idToRecord.get(idB);
    if (a?.photoHash && b?.photoHash && hammingDistance(a.photoHash, b.photoHash) <= DHASH_THRESHOLD) {
      const ra = find(idA),
        rb = find(idB);
      if (ra !== rb) parent.set(ra, rb);
    }
    if (++iteration % 50_000 === 0) await new Promise<void>((r) => setImmediate(r));
  }

  // ── Build output groups ───────────────────────────────────────────────────
  const groupMap = new Map<string, RawRecord[]>();
  for (const r of records) {
    const root = find(r.id);
    const arr = groupMap.get(root) ?? [];
    arr.push(r);
    groupMap.set(root, arr);
  }

  return Array.from(groupMap.values())
    .filter((g) => g.length >= 2)
    .map((g) => {
      // Keeper: foto com rosto primeiro; dentro de cada tier, maior qualidade primeiro
      const sorted = g.sort((a, b) => {
        if (a.hasFace !== b.hasFace) return a.hasFace ? -1 : 1;
        return (b.photoQuality ?? 0) - (a.photoQuality ?? 0);
      });
      const sha = sorted[0].photoHashSha;
      const type: 'exact' | 'similar' =
        sha != null && sorted.every((r) => r.photoHashSha === sha) ? 'exact' : 'similar';
      return {
        type,
        records: sorted.map(({ photoHashSha: _s, photoHash: _h, ...rest }) => rest),
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
    SELECT id, name, matricula, unidade, faccao, "photoPath",
           "photoHashSha", "photoHash", "photoQuality",
           ("faceDescriptor" IS NOT NULL AND "faceDescriptor" != '') AS "hasFace"
    FROM apenados
    WHERE "photoPath" IS NOT NULL
      AND "photoHash" IS NOT NULL
      AND "photoHashSha" IS NOT NULL
    ORDER BY name ASC
  `;

  const groups = await buildGroupsAsync(records);

  state = {
    phase: 'done',
    indexingCurrent: state.indexingCurrent,
    indexingTotal: state.indexingTotal,
    groups,
    totalGroups: groups.length,
    totalAnalyzed: records.length,
    error: '',
  };
}
