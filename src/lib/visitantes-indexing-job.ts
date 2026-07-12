import { prisma } from './db';
import { runIndexBatch } from './arcface-batch';
import * as path from 'path';
import { upsertVisitanteVector, upsertVisitanteVectorAdvanced } from './pgvector';
import { invalidateVisitanteFaceCache } from './visitante-face-cache';

const BATCH_SIZE = 100;
const MAX_DURATION_MS = 170 * 60 * 1000; // 170 minutos

export const FACE_NONE = 'NONE';

export interface VisitanteJobProgress {
  current: number;
  total: number;
  faces: number;
  skipped: number;
  errors: number;
  startTime: number;
}

interface VisitanteJobState {
  isRunning: boolean;
  timedOut: boolean;
  progress: VisitanteJobProgress;
  error: string;
}

let state: VisitanteJobState = {
  isRunning: false,
  timedOut: false,
  progress: { current: 0, total: 0, faces: 0, skipped: 0, errors: 0, startTime: 0 },
  error: '',
};

let stopFlag = false;
let activeModel: 'buffalo' | 'antelope' = 'buffalo';

export function getVisitanteJobState(): VisitanteJobState {
  return state;
}

export function stopVisitanteJob(): void {
  stopFlag = true;
}

export function startVisitanteJob(model: 'buffalo' | 'antelope' = 'buffalo'): void {
  if (state.isRunning) return;
  state.isRunning = true;
  state.timedOut = false;
  state.error = '';
  stopFlag = false;
  activeModel = model;

  runLoop().catch((err) => {
    state.error = err?.message ?? 'Erro desconhecido';
    state.isRunning = false;
  });
}

async function runLoop(): Promise<void> {
  const baseDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
  const visitantesDir = path.join(baseDir, 'visitantes');

  const isAntelope = activeModel === 'antelope';

  // Limpa embeddings órfãos: registros sem foto mas com faceDescriptor (foto foi deletada).
  if (isAntelope) {
    await prisma.sipeVisitante.updateMany({
      where: { photoPath: null, faceDescriptorAdvanced: { not: null } },
      data: { faceDescriptorAdvanced: null, detScore: null },
    });
  } else {
    await prisma.sipeVisitante.updateMany({
      where: { photoPath: null, faceDescriptor: { not: null } },
      data: { faceDescriptor: null, detScore: null },
    });
  }

  // Reseta registros com null bytes no faceDescriptor correspondente (forçam re-indexação limpa).
  if (isAntelope) {
    await prisma.$executeRaw`
      UPDATE sipe_visitantes
      SET "faceDescriptorAdvanced" = NULL
      WHERE "faceDescriptorAdvanced" IS NOT NULL
        AND strpos(encode("faceDescriptorAdvanced"::bytea, 'hex'), '00') > 0
    `;
  } else {
    await prisma.$executeRaw`
      UPDATE sipe_visitantes
      SET "faceDescriptor" = NULL
      WHERE "faceDescriptor" IS NOT NULL
        AND strpos(encode("faceDescriptor"::bytea, 'hex'), '00') > 0
    `;
  }

  // Conta total de fotos e já processadas para mostrar progresso real
  const [totalWithPhoto, alreadyProcessed] = await Promise.all([
    prisma.sipeVisitante.count({ where: { photoPath: { not: null } } }),
    isAntelope
      ? prisma.sipeVisitante.count({ where: { photoPath: { not: null }, faceDescriptorAdvanced: { not: null } } })
      : prisma.sipeVisitante.count({ where: { photoPath: { not: null }, faceDescriptor: { not: null } } }),
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

  while (!stopFlag) {
    if (Date.now() - startTime >= MAX_DURATION_MS) {
      state.timedOut = true;
      break;
    }

    const records = await prisma.sipeVisitante.findMany({
      where: {
        photoPath: { not: null },
        ...(isAntelope ? { faceDescriptorAdvanced: null } : { faceDescriptor: null }),
      },
      select: { id: true, photoPath: true },
      take: BATCH_SIZE,
      orderBy: { createdAt: 'asc' },
    });

    if (records.length === 0) break;

    const ids = records.map((r) => r.id);
    const photoPaths: Record<string, string> = {};

    for (const r of records) {
      if (r.photoPath) {
        const relativePath = r.photoPath.startsWith('uploads/')
          ? r.photoPath.substring(8)
          : r.photoPath;
        photoPaths[r.id] = path.join(baseDir, relativePath);
      }
    }

    const results = await runIndexBatch(ids, visitantesDir, photoPaths, activeModel);

    const updates: Promise<any>[] = [];
    for (const r of results) {
      if (r.done) continue;
      if (!r.id) continue;

      if (r.embedding && Array.isArray(r.embedding) && r.embedding.length === 512) {
        if (isAntelope) {
          updates.push(
            prisma.sipeVisitante.update({
              where: { id: r.id },
              data: {
                faceDescriptorAdvanced: JSON.stringify(r.embedding).replace(/\x00/g, ''),
                detScore: r.det_score ?? null,
              },
            })
          );
          updates.push(upsertVisitanteVectorAdvanced(r.id, r.embedding));
        } else {
          updates.push(
            prisma.sipeVisitante.update({
              where: { id: r.id },
              data: {
                faceDescriptor: JSON.stringify(r.embedding).replace(/\x00/g, ''),
                detScore: r.det_score ?? null,
              },
            })
          );
          updates.push(upsertVisitanteVector(r.id, r.embedding));
        }
        faces++;
      } else if (r.no_face || r.no_photo) {
        if (isAntelope) {
          updates.push(
            prisma.sipeVisitante.update({
              where: { id: r.id },
              data: { faceDescriptorAdvanced: FACE_NONE, detScore: null },
            })
          );
          updates.push(
            prisma.$executeRawUnsafe(
              `UPDATE sipe_visitantes SET "faceVectorAdvanced" = NULL WHERE id = $1`,
              r.id
            ).catch(() => {})
          );
        } else {
          updates.push(
            prisma.sipeVisitante.update({
              where: { id: r.id },
              data: { faceDescriptor: FACE_NONE, detScore: null },
            })
          );
          updates.push(
            prisma.$executeRawUnsafe(
              `UPDATE sipe_visitantes SET "faceVector" = NULL WHERE id = $1`,
              r.id
            ).catch(() => {})
          );
        }
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
  invalidateVisitanteFaceCache();
}
