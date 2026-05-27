import { prisma } from './db';
import { runIndexBatch } from './arcface-batch';
import { getApenadosDir } from './storage';
import { invalidateFaceCache } from './face-cache';
import { pgvectorAvailable, upsertVector } from './pgvector';

// 100 fotos por batch: buffalo_l carrega uma vez por processo Python (~5s startup).
// Com 130k fotos: 1.300 starts × 5s = ~1.8h overhead vs 4.333 starts × 5s = ~6h com BATCH_SIZE=30.
// Pico de RAM por batch: ~120MB (100 fotos × 1.2MB) — seguro em VPS com ≥2GB.
const BATCH_SIZE = 100;
const MAX_DURATION_MS = 170 * 60 * 1000; // 170 minutos

// Sentinel gravado no banco para fotos sem rosto detectável ou sem arquivo.
// Impede que esses registros sejam reprocessados a cada execução.
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

// Module-level singleton — persiste enquanto o processo Node.js estiver rodando
let state: JobState = {
  isRunning: false,
  timedOut: false,
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

  // Limpa embeddings órfãos: registros sem foto mas com faceDescriptor (foto foi deletada).
  await prisma.apenado.updateMany({
    where: { photoPath: null, faceDescriptor: { not: null } },
    data: { faceDescriptor: null, detScore: null },
  });

  // Reseta registros com null bytes no faceDescriptor (forçam re-indexação limpa).
  // Compara via encode(bytea,'hex') — text funcs como position/REPLACE crasham em \x00.
  await prisma.$executeRaw`
    UPDATE apenados
    SET "faceDescriptor" = NULL
    WHERE "faceDescriptor" IS NOT NULL
      AND strpos(encode("faceDescriptor"::bytea, 'hex'), '00') > 0
  `;

  // Conta total de fotos e já processadas para mostrar progresso real (ex: 600/1000 ao retomar)
  const [totalWithPhoto, alreadyProcessed] = await Promise.all([
    prisma.apenado.count({ where: { photoPath: { not: null } } }),
    prisma.apenado.count({ where: { photoPath: { not: null }, faceDescriptor: { not: null } } }),
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

  // Verifica pgvector uma vez antes do loop — é cacheado, mas evita chamada redundante a cada batch
  const pvecAvail = await pgvectorAvailable();

  while (!stopFlag) {
    if (Date.now() - startTime >= MAX_DURATION_MS) {
      state.timedOut = true;
      break;
    }

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
            data: {
              faceDescriptor: JSON.stringify(r.embedding).replace(/\x00/g, ''),
              ...(typeof r.det_score === 'number' ? { detScore: r.det_score } : {}),
            },
          }),
        );
        // Salva no índice vetorial pgvector se disponível (fire-and-forget)
        if (pvecAvail) upsertVector(r.id, r.embedding);
        faces++;
      } else if (r.no_face || r.no_photo) {
        // Marca com sentinel para não reprocessar em execuções futuras.
        updates.push(
          prisma.apenado.update({
            where: { id: r.id },
            data: { faceDescriptor: FACE_NONE, detScore: null },
          }),
        );
        skipped++;
      } else {
        // Erros de leitura/processamento ficam com faceDescriptor null para retry automático.
        errors++;
      }
    }
    await Promise.all(updates);

    processed += ids.length;
    state.progress = { current: processed, total: totalWithPhoto, faces, skipped, errors, startTime };
  }

  state.isRunning = false;
  // Invalida o cache de embeddings para que a próxima busca reflita os novos dados
  invalidateFaceCache();
}
