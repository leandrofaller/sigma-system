import { prisma } from './db';
import { runIndexBatch } from './arcface-batch';
import * as path from 'path';
import { upsertVisitanteVector } from './pgvector';
import { invalidateVisitanteFaceCache } from './visitante-face-cache';

export async function runVisitantesIndexing(jobId: string, visitanteIds: string[]): Promise<void> {
  const baseDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
  const visitantesDir = path.join(baseDir, 'visitantes');

  // Coleta as informações físicas de cada visitante em lotes para evitar estouro de parâmetros da query no Postgres
  const visitantes: Array<{ id: string; photoPath: string | null }> = [];
  const chunkSize = 1000;
  for (let i = 0; i < visitanteIds.length; i += chunkSize) {
    const chunk = visitanteIds.slice(i, i + chunkSize);
    const chunkVisitantes = await prisma.sipeVisitante.findMany({
      where: {
        id: { in: chunk },
        photoPath: { not: null },
        faceDescriptor: null,
      },
      select: { id: true, photoPath: true },
    });
    visitantes.push(...chunkVisitantes);
  }

  if (visitantes.length === 0) return;

  const ids = visitantes.map((v) => v.id);
  const photoPaths: Record<string, string> = {};
  
  for (const v of visitantes) {
    if (v.photoPath) {
      // v.photoPath geralmente é "uploads/visitantes/visitante-13715.webp"
      // Resolvemos o caminho físico absoluto
      const relativePath = v.photoPath.startsWith('uploads/')
        ? v.photoPath.substring(8)
        : v.photoPath;
      photoPaths[v.id] = path.join(baseDir, relativePath);
    }
  }

  console.log(`[ARCFACE VISITANTES] Indexando ${ids.length} visitante(s)...`);
  try {
    const results = await runIndexBatch(ids, visitantesDir, photoPaths);
    const updates: Promise<any>[] = [];

    for (const r of results) {
      if (r.done) continue;
      if (!r.id) continue;

      if (r.embedding && Array.isArray(r.embedding) && r.embedding.length === 512) {
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
      } else if (r.no_face || r.no_photo) {
        updates.push(
          prisma.sipeVisitante.update({
            where: { id: r.id },
            data: {
              faceDescriptor: 'NONE',
              detScore: null,
            },
          })
        );
        updates.push(
          prisma.$executeRawUnsafe(
            `UPDATE sipe_visitantes SET "faceVector" = NULL WHERE id = $1`,
            r.id
          ).catch(() => {})
        );
      }
    }

    await Promise.all(updates);
    invalidateVisitanteFaceCache();
    console.log(`[ARCFACE VISITANTES] Indexação concluída para ${updates.length} visitante(s).`);
  } catch (err) {
    console.error('[ARCFACE VISITANTES] Erro na indexação facial de visitantes:', err);
  }
}
