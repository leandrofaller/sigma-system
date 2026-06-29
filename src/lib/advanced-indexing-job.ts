import { prisma } from './db';
import { runAdvancedIndexBatch } from './advanced-face-batch';
import { invalidateAdvancedFaceCache } from './advanced-face-cache';
import { pgvectorAdvancedAvailable, upsertVectorAdvanced } from './pgvector';
import { getApenadosDir, getApenadoPhotoPath } from './storage';

const BATCH_SIZE = 100;
const DELAY_BETWEEN_BATCHES_MS = 2000; // 2 segundos de pausa entre lotes para aliviar CPU na VPS
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
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

  // Reseta descriptors avançados corrompidos (null bytes).
  await prisma.$executeRaw`
    UPDATE apenados
    SET "faceDescriptorAdvanced" = NULL
    WHERE "faceDescriptorAdvanced" IS NOT NULL
      AND "faceDescriptorAdvanced" != 'NONE'
      AND strpos(encode("faceDescriptorAdvanced"::bytea, 'hex'), '00') > 0
  `;

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
      select: { id: true, photoPath: true },
      take: BATCH_SIZE,
      orderBy: { createdAt: 'asc' },
    });

    if (records.length === 0) break;

    const ids = records.map((r) => r.id);
    const photoPaths: Record<string, string> = {};
    for (const r of records) {
      if (r.photoPath) photoPaths[r.id] = getApenadoPhotoPath(r.photoPath);
    }

    let results;
    try {
      results = await runAdvancedIndexBatch(ids, uploadsDir, photoPaths);
    } catch (batchErr: unknown) {
      const msg = batchErr instanceof Error ? batchErr.message : String(batchErr);
      console.error('[advanced-indexing] Falha no lote Python:', msg);
      state.error = msg;
      break;
    }

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
        // Erro transitório: mantém null para retry (mesmo comportamento do ArcFace clássico).
        errors++;
      }
    }
    await Promise.all(updates);

    processed += ids.length;
    state.progress = { current: processed, total: totalWithPhoto, faces, skipped, errors, startTime };

    // Evita sobrecarga de CPU na VPS entre lotes de processamento
    await delay(DELAY_BETWEEN_BATCHES_MS);
  }

  state.isRunning = false;
  invalidateAdvancedFaceCache();
}
