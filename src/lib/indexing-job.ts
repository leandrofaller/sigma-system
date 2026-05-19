import { join } from 'path';
import { prisma } from './db';
import { runIndexBatch } from './arcface-batch';

const BATCH_SIZE = 30;

export interface JobProgress {
  current: number;
  total: number;
  faces: number;
  skipped: number;
  errors: number;
  startTime: number;
}

interface JobState {
  isRunning: boolean;
  progress: JobProgress;
  error: string;
}

// Module-level singleton — persiste enquanto o processo Node.js estiver rodando
let state: JobState = {
  isRunning: false,
  progress: { current: 0, total: 0, faces: 0, skipped: 0, errors: 0, startTime: 0 },
  error: '',
};
let stopFlag = false;

export function getJobState(): JobState {
  return state;
}

export function stopJob(): void {
  stopFlag = true;
}

export function startJob(): void {
  if (state.isRunning) return;
  state.isRunning = true;
  state.error = '';
  stopFlag = false;

  runLoop().catch((err) => {
    state.error = err?.message ?? 'Erro desconhecido';
    state.isRunning = false;
  });
}

async function runLoop(): Promise<void> {
  const uploadsDir = join(process.cwd(), 'uploads', 'apenados');

  const total = await prisma.apenado.count({
    where: { photoPath: { not: null }, faceDescriptor: null },
  });

  const startTime = Date.now();
  state.progress = { current: 0, total, faces: 0, skipped: 0, errors: 0, startTime };

  let processed = 0;
  let faces = 0;
  let skipped = 0;
  let errors = 0;

  while (!stopFlag) {
    const records = await prisma.apenado.findMany({
      where: { photoPath: { not: null }, faceDescriptor: null },
      select: { id: true },
      take: BATCH_SIZE,
      orderBy: { createdAt: 'asc' },
    });

    if (records.length === 0) break;

    const ids = records.map((r) => r.id);
    const results = await runIndexBatch(ids, uploadsDir);

    const updates: Promise<any>[] = [];
    for (const r of results) {
      if (r.done) continue;
      if (!r.id) continue;
      if (r.embedding && Array.isArray(r.embedding) && r.embedding.length === 512) {
        updates.push(
          prisma.apenado.update({
            where: { id: r.id },
            data: { faceDescriptor: JSON.stringify(r.embedding) },
          }),
        );
        faces++;
      } else if (r.no_face || r.no_photo) {
        skipped++;
      } else {
        errors++;
      }
    }
    await Promise.all(updates);

    processed += ids.length;
    state.progress = { current: processed, total, faces, skipped, errors, startTime };
  }

  state.isRunning = false;
}
