import { createReadStream } from 'fs';
import crypto from 'crypto';
import { prisma } from './db';
import { getApenadoPhotoPath } from './storage';

const BATCH_SIZE = 200;
const CONCURRENCY = 4;

export interface ExactDupJobState {
  isRunning: boolean;
  current: number;
  total: number;
  error: string;
}

let state: ExactDupJobState = { isRunning: false, current: 0, total: 0, error: '' };

export function getExactDupState(): ExactDupJobState {
  return state;
}

export function startExactDupJob(): void {
  if (state.isRunning) return;
  state = { isRunning: true, current: 0, total: 0, error: '' };
  runJob().catch((err) => {
    state = { ...state, isRunning: false, error: err?.message ?? 'Erro desconhecido' };
  });
}

function sha256File(filepath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = createReadStream(filepath);
    s.on('data', (d) => h.update(d));
    s.on('end', () => resolve(h.digest('hex')));
    s.on('error', reject);
  });
}

async function runJob(): Promise<void> {
  const total = await prisma.apenado.count({
    where: { photoPath: { not: null }, photoHashSha: null },
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
      where: { photoPath: { not: null }, photoHashSha: null, id: { gt: cursor } },
      select: { id: true, photoPath: true },
      take: BATCH_SIZE,
      orderBy: { id: 'asc' },
    });
    if (batch.length === 0) break;

    // Compute SHA-256 with bounded concurrency to avoid saturating libuv thread pool
    const results: { id: string; hash: string }[] = [];
    let idx = 0;
    async function worker() {
      while (idx < batch.length) {
        const i = idx++;
        const a = batch[i];
        try {
          const hash = await sha256File(getApenadoPhotoPath(a.photoPath!));
          results.push({ id: a.id, hash });
        } catch {
          // File missing or unreadable — skip, leave photoHashSha null
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    // Bulk write via transaction to minimize round-trips
    if (results.length > 0) {
      await prisma.$transaction(
        results.map((r) =>
          prisma.apenado.update({ where: { id: r.id }, data: { photoHashSha: r.hash } }),
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
