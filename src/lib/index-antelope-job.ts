import { prisma } from './db';
import { runIndexBatch } from './arcface-batch';
import { getApenadosDir } from './storage';
import { pgvectorAvailable, upsertVectorAdvanced } from './pgvector';

const BATCH_SIZE = 100;
const MAX_DURATION_MS = 170 * 60 * 1000; // 170 minutos
export const FACE_NONE = 'NONE';

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
  timedOut: boolean;
  progress: JobProgress;
  error: string;
}

let state: JobState = {
  isRunning: false,
  timedOut: false,
  progress: { current: 0, total: 0, faces: 0, skipped: 0, errors: 0, startTime: 0 },
  error: '',
};
let stopFlag = false;

export function getAntelopeJobState(): JobState {
  return state;
}

export function stopAntelopeJob(): void {
  stopFlag = true;
}

export function startAntelopeJob(): void {
  if (state.isRunning) return;
  state.isRunning = true;
  state.timedOut = false;
  state.error = '';
  stopFlag = false;

  runLoop().catch((err) => {
    state.error = err?.message ?? 'Erro desconhecido';
    state.isRunning = false;
  });
}

async function runLoop(): Promise<void> {
  const uploadsDir = getApenadosDir();

  // Limpa embeddings órfãos do Antelope
  await prisma.apenado.updateMany({
    where: { photoPath: null, faceDescriptorAdvanced: { not: null } },
    data: { faceDescriptorAdvanced: null, advancedDetScore: null },
  });

  // Conta total e processados
  const [totalWithPhoto, alreadyProcessed] = await Promise.all([
    prisma.apenado.count({ where: { photoPath: { not: null } } }),
    prisma.apenado.count({ where: { photoPath: { not: null }, faceDescriptorAdvanced: { not: null } } }),
  ]);

  const startTime = Date.now();
  state.progress = {
    current: alreadyProcessed,
    total: totalWithPhoto,
    faces: 0,
    skipped: 0,
    errors: 0,
    startTime,
  };

  let processed = alreadyProcessed;
  let faces = 0;
  let skipped = 0;
  let errors = 0;

  const pvecAvail = await pgvectorAvailable();

  while (!stopFlag) {
    if (Date.now() - startTime >= MAX_DURATION_MS) {
      state.timedOut = true;
      break;
    }

    const records = await prisma.apenado.findMany({
      where: { photoPath: { not: null }, faceDescriptorAdvanced: null },
      select: { id: true },
      take: BATCH_SIZE,
      orderBy: { createdAt: 'asc' },
    });

    if (records.length === 0) break;

    const ids = records.map((r) => r.id);
    // Chama o lote passando model: 'antelope'
    const results = await runIndexBatch(ids, uploadsDir, undefined, 'antelope');

    const updates: Promise<any>[] = [];
    for (const r of results) {
      if (r.done) continue;
      if (!r.id) continue;
      if (r.embedding && Array.isArray(r.embedding) && r.embedding.length === 512) {
        updates.push(
          prisma.apenado.update({
            where: { id: r.id },
            data: {
              faceDescriptorAdvanced: JSON.stringify(r.embedding).replace(/\x00/g, ''),
              advancedDetScore: typeof r.det_score === 'number' ? r.det_score : null,
            },
          })
        );
        if (pvecAvail) {
          updates.push(upsertVectorAdvanced(r.id, r.embedding));
        }
        faces++;
      } else if (r.no_face || r.no_photo) {
        updates.push(
          prisma.apenado.update({
            where: { id: r.id },
            data: { faceDescriptorAdvanced: FACE_NONE, advancedDetScore: null },
          })
        );
        skipped++;
      } else {
        errors++;
      }
    }
    await Promise.all(updates);

    processed += ids.length;
    state.progress = { current: processed, total: totalWithPhoto, faces, skipped, errors, startTime };
  }

  state.isRunning = false;
}
