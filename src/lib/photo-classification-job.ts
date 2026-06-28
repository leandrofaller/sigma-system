import { prisma } from './db';
import { getApenadoPhotoPath, getApenadosDir } from './storage';
import { runClassifyBatch, type PhotoCategory } from './photo-classifier-batch';

const BATCH_SIZE = 40;
const MAX_DURATION_MS = 170 * 60 * 1000;

export interface ClassificationProgress {
  current: number;
  total: number;
  classified: number;
  errors: number;
  byCategory: Record<string, number>;
  startTime: number;
}

interface JobState {
  isRunning: boolean;
  progress: ClassificationProgress;
  error: string;
  mode: 'none_only' | 'all' | 'stale';
}

let state: JobState = {
  isRunning: false,
  progress: {
    current: 0,
    total: 0,
    classified: 0,
    errors: 0,
    byCategory: {},
    startTime: 0,
  },
  error: '',
  mode: 'none_only',
};
let stopFlag = false;

export function getClassificationState(): JobState {
  return state;
}

export function stopClassificationJob(): void {
  stopFlag = true;
}

export function startClassificationJob(
  mode: 'none_only' | 'all' | 'stale' = 'none_only',
): void {
  if (state.isRunning) return;
  state.isRunning = true;
  state.error = '';
  state.mode = mode;
  stopFlag = false;

  runLoop(mode).catch((err) => {
    state.error = err?.message ?? 'Erro desconhecido';
    state.isRunning = false;
  });
}

async function buildWhere(mode: JobState['mode']) {
  const base = { photoPath: { not: null } } as const;
  if (mode === 'none_only') {
    return { ...base, faceDescriptor: 'NONE' as const };
  }
  if (mode === 'stale') {
    return {
      ...base,
      OR: [{ photoClassifiedAt: null }, { photoCategory: null }],
    };
  }
  return base;
}

async function fetchComplementHints(apenadoIds: string[]): Promise<Record<string, string>> {
  if (apenadoIds.length === 0) return {};
  const rows = await prisma.sipeFotoComplementar.findMany({
    where: {
      apenadoLocalId: { in: apenadoIds },
      descricao: { not: null },
    },
    select: { apenadoLocalId: true, descricao: true },
  });
  const hints: Record<string, string> = {};
  for (const r of rows) {
    if (!r.apenadoLocalId || !r.descricao) continue;
    hints[r.apenadoLocalId] = hints[r.apenadoLocalId]
      ? `${hints[r.apenadoLocalId]}; ${r.descricao}`
      : r.descricao;
  }
  return hints;
}

function bumpCategory(cat: string) {
  state.progress.byCategory[cat] = (state.progress.byCategory[cat] ?? 0) + 1;
}

async function runLoop(mode: JobState['mode']): Promise<void> {
  const where = await buildWhere(mode);
  const total = await prisma.apenado.count({ where });
  const startTime = Date.now();

  state.progress = {
    current: 0,
    total,
    classified: 0,
    errors: 0,
    byCategory: {},
    startTime,
  };

  let cursor = '';

  while (!stopFlag) {
    if (Date.now() - startTime >= MAX_DURATION_MS) break;

    const records = await prisma.apenado.findMany({
      where: {
        ...where,
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: { id: true, photoPath: true },
      take: BATCH_SIZE,
      orderBy: { id: 'asc' },
    });

    if (records.length === 0) break;

    const photoPaths: Record<string, string> = {};
    for (const r of records) {
      if (r.photoPath) photoPaths[r.id] = getApenadoPhotoPath(r.photoPath);
    }

    const complementHints = await fetchComplementHints(records.map((r) => r.id));

    let results;
    try {
      results = await runClassifyBatch(
        records.map((r) => r.id),
        getApenadosDir(),
        photoPaths,
        complementHints,
      );
    } catch (err: any) {
      state.progress.errors += records.length;
      state.progress.current += records.length;
      state.error = err?.message ?? 'Erro no classificador';
      cursor = records[records.length - 1].id;
      continue;
    }

    const updates: Promise<unknown>[] = [];
    const now = new Date();

    for (const res of results) {
      if (res.done || !res.id) continue;
      if (res.error) {
        state.progress.errors++;
        continue;
      }
      if (!res.category) continue;

      updates.push(
        prisma.apenado.update({
          where: { id: res.id },
          data: {
            photoCategory: res.category as PhotoCategory,
            photoCategoryConf: res.confidence ?? null,
            photoCategoryReason: res.reason ?? null,
            photoClassifiedAt: now,
            ...(res.ocr_text ? { ocrText: res.ocr_text } : {}),
          },
        }),
      );
      bumpCategory(res.category);
      state.progress.classified++;
    }

    await Promise.all(updates);
    state.progress.current += records.length;
    cursor = records[records.length - 1].id;
  }

  state.isRunning = false;
}