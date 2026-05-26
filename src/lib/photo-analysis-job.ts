import { readFile } from 'fs/promises';
import sharp from 'sharp';
import { prisma } from './db';
import { getApenadoPhotoPath } from './storage';

const BATCH_SIZE = 200;
const CONCURRENCY = 4;

export interface PhotoAnalysisJobState {
  isRunning: boolean;
  current: number;
  total: number;
  error: string;
}

let state: PhotoAnalysisJobState = { isRunning: false, current: 0, total: 0, error: '' };

export function getPhotoAnalysisState(): PhotoAnalysisJobState {
  return state;
}

export function startPhotoAnalysisJob(): void {
  if (state.isRunning) return;
  state = { isRunning: true, current: 0, total: 0, error: '' };
  runJob().catch((err) => {
    state = { ...state, isRunning: false, error: err?.message ?? 'Erro desconhecido' };
  });
}

// Lê o arquivo uma vez e calcula dHash + Laplacian variance em paralelo.
async function analyzePhoto(
  filePath: string,
): Promise<{ hash: string; quality: number } | null> {
  try {
    const buf = await readFile(filePath);

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

    // dHash 64-bit
    let hashBig = 0n;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        hashBig =
          (hashBig << 1n) |
          (hashRaw[row * 9 + col] > hashRaw[row * 9 + col + 1] ? 1n : 0n);
      }
    }
    const hash = hashBig.toString(16).padStart(16, '0');

    // Variância do Laplacian → nitidez
    const { data, info } = qualityResult;
    const n = info.width * info.height;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      sum += data[i];
      sumSq += data[i] * data[i];
    }
    const mean = sum / n;
    const quality = Math.round((sumSq / n - mean * mean) * 100) / 100;

    return { hash, quality };
  } catch {
    return null;
  }
}

async function runJob(): Promise<void> {
  const total = await prisma.apenado.count({
    where: {
      photoPath: { not: null },
      OR: [{ photoHash: null }, { photoQuality: null }],
    },
  });
  state = { ...state, total };

  if (total === 0) {
    state = { ...state, isRunning: false };
    return;
  }

  let cursor = '';
  let processed = 0;

  while (true) {
    const batch = await prisma.apenado.findMany({
      where: {
        photoPath: { not: null },
        OR: [{ photoHash: null }, { photoQuality: null }],
        id: { gt: cursor },
      },
      select: { id: true, photoPath: true, photoHash: true },
      take: BATCH_SIZE,
      orderBy: { id: 'asc' },
    });
    if (batch.length === 0) break;

    const results: { id: string; hash: string; quality: number }[] = [];
    let idx = 0;

    async function worker() {
      while (idx < batch.length) {
        const i = idx++;
        const a = batch[i];
        const analysis = await analyzePhoto(getApenadoPhotoPath(a.photoPath!));
        if (analysis) {
          results.push({
            id: a.id,
            // Preserva hash existente — não re-computa se já tiver
            hash: a.photoHash ?? analysis.hash,
            quality: analysis.quality,
          });
        }
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    if (results.length > 0) {
      await prisma.$transaction(
        results.map((r) =>
          prisma.apenado.update({
            where: { id: r.id },
            data: { photoHash: r.hash, photoQuality: r.quality },
          }),
        ),
      );
    }

    processed += batch.length;
    state = { ...state, current: processed };
    cursor = batch[batch.length - 1].id;
    if (batch.length < BATCH_SIZE) break;
  }

  state = { ...state, isRunning: false, current: processed };
}
