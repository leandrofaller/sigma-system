import { prisma } from './db';
import { runAuditBatch } from './photo-audit';
import { getApenadosDir } from './storage';

const BATCH_SIZE = 20;

export interface AuditProgress {
  current: number;
  total: number;
  withFace: number;
  withOcr: number;
  errors: number;
  startTime: number;
}

interface AuditState {
  isRunning: boolean;
  progress: AuditProgress;
  error: string;
}

let state: AuditState = {
  isRunning: false,
  progress: { current: 0, total: 0, withFace: 0, withOcr: 0, errors: 0, startTime: 0 },
  error: '',
};
let stopFlag = false;

export function getAuditState(): AuditState {
  return state;
}

export function stopAudit(): void {
  stopFlag = true;
}

export function startAudit(): void {
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
  const uploadsDir = getApenadosDir();

  const [totalWithPhoto, alreadyProcessed] = await Promise.all([
    prisma.apenado.count({ where: { photoPath: { not: null } } }),
    prisma.apenado.count({ where: { photoPath: { not: null }, ocrText: { not: null } } }),
  ]);

  const startTime = Date.now();
  state.progress = {
    current: alreadyProcessed,
    total: totalWithPhoto,
    withFace: 0,
    withOcr: 0,
    errors: 0,
    startTime,
  };

  let processed = alreadyProcessed;
  let withFace = 0;
  let withOcr = 0;
  let errors = 0;

  while (!stopFlag) {
    const records = await prisma.apenado.findMany({
      where: { photoPath: { not: null }, ocrText: null },
      select: { id: true },
      take: BATCH_SIZE,
      orderBy: { createdAt: 'asc' },
    });

    if (records.length === 0) break;

    const ids = records.map((r) => r.id);
    const results = await runAuditBatch(ids, uploadsDir);

    const updates: Promise<any>[] = [];
    for (const r of results) {
      if (r.done) continue;
      if (!r.id) continue;

      if (r.no_photo) {
        updates.push(
          prisma.apenado.update({ where: { id: r.id }, data: { ocrText: '' } }),
        );
      } else if (r.error) {
        errors++;
      } else {
        if ((r.faces ?? 0) > 0) withFace++;
        if (r.ocr_name) withOcr++;
        updates.push(
          prisma.apenado.update({
            where: { id: r.id },
            data: {
              ocrText: r.ocr_text ?? '',
              ocrName: r.ocr_name || null,
            },
          }),
        );
      }
    }

    await Promise.all(updates);
    processed += ids.length;
    state.progress = { current: processed, total: totalWithPhoto, withFace, withOcr, errors, startTime };
  }

  state.isRunning = false;
}
