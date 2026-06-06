import { prisma } from './db';
import { runAdvancedIndexBatch } from './advanced-face-batch';
import { invalidateAdvancedFaceCache } from './advanced-face-cache';
import { pgvectorAdvancedAvailable, upsertVectorAdvanced } from './pgvector';

const BATCH_SIZE = 100;
const MAX_DURATION_MS = 170 * 60 * 1000; // 170 minutos

export const FACE_NONE = 'NONE';

export interface AdvancedJobProgress {
  current: number;
  total: number;
  faces: number;
  skipped: number;
  errors: number;
  startTime: number;
}

interface AdvancedJobState {
  isRunning: boolean;
  timedOut: boolean;
  progress: AdvancedJobProgress;
  error: string;
}

let state: AdvancedJobState = {
  isRunning: false,
  timedOut: false,
  progress: { current: 0, total: 0, faces: 0, skipped: 0, errors: 0, startTime: 0 },
  error: '',
};
let stopFlag = false;

export function getAdvancedJobState(): AdvancedJobState {
  return state;
}

export function stopAdvancedJob(): void {
  stopFlag = true;
}

export function startAdvancedJob(): void {
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

  // Limpa embeddings órfãos
  await prisma.apenado.updateMany({
    where: { photoPath: null, faceDescriptorAdvanced: { not: null } },
    data: { faceDescriptorAdvanced: null, advancedDetScore: null, advancedQualityScore: null, advancedLivenessScore: null },
  });

  // Conta total com foto e já processados
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

  const pvecAvail = await pgvectorAdvancedAvailable();

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
    const results = await runAdvancedIndexBatch(ids, uploadsDir);

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
              advancedDetScore: r.det_score ?? null,
              advancedQualityScore: r.quality_score ?? null,
              advancedLivenessScore: r.liveness_score ?? null
            },
          }),
        );
        if (pvecAvail) upsertVectorAdvanced(r.id, r.embedding);
        faces++;
      } else if (r.no_face || r.no_photo) {
        updates.push(
          prisma.apenado.update({
            where: { id: r.id },
            data: { 
              faceDescriptorAdvanced: FACE_NONE,
              advancedDetScore: null,
              advancedQualityScore: null,
              advancedLivenessScore: null
            },
          }),
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
  invalidateAdvancedFaceCache();
}
