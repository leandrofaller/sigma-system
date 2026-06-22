import { prisma } from './db';
import { runIndexBatch } from './arcface-batch';
import * as path from 'path';
import { upsertServidorVector } from './pgvector';
import { invalidateServidorFaceCache } from './servidor-face-cache';

export async function runServidoresIndexing(jobId: string, servidorIds: string[]): Promise<void> {
  const baseDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
  const servidoresDir = path.join(baseDir, 'servidores');

  // Coleta as informações físicas de cada servidor
  const servidores = await prisma.sejusServidor.findMany({
    where: {
      id: { in: servidorIds },
      photoPath: { not: null },
      faceDescriptor: null,
    },
    select: { id: true, photoPath: true },
  });

  if (servidores.length === 0) return;

  const ids = servidores.map((s) => s.id);
  const photoPaths: Record<string, string> = {};
  
  for (const s of servidores) {
    if (s.photoPath) {
      // s.photoPath geralmente é "uploads/servidores/servidor-xxxx.webp"
      // Resolvemos o caminho físico absoluto
      const relativePath = s.photoPath.startsWith('uploads/')
        ? s.photoPath.substring(8)
        : s.photoPath;
      photoPaths[s.id] = path.join(baseDir, relativePath);
    }
  }

  console.log(`[ARCFACE SERVIDORES] Indexando ${ids.length} servidor(es)...`);
  try {
    const results = await runIndexBatch(ids, servidoresDir, photoPaths);
    const updates: Promise<any>[] = [];

    for (const r of results) {
      if (r.done) continue;
      if (!r.id) continue;

      if (r.embedding && Array.isArray(r.embedding) && r.embedding.length === 512) {
        updates.push(
          prisma.sejusServidor.update({
            where: { id: r.id },
            data: {
              faceDescriptor: JSON.stringify(r.embedding).replace(/\x00/g, ''),
              detScore: r.det_score ?? null,
            },
          })
        );
        updates.push(upsertServidorVector(r.id, r.embedding));
      } else if (r.no_face || r.no_photo) {
        updates.push(
          prisma.sejusServidor.update({
            where: { id: r.id },
            data: {
              faceDescriptor: 'NONE',
              detScore: null,
            },
          })
        );
        updates.push(
          prisma.$executeRawUnsafe(
            `UPDATE sejus_servidores SET "faceVector" = NULL WHERE id = $1`,
            r.id
          ).catch(() => {})
        );
      }
    }

    await Promise.all(updates);
    invalidateServidorFaceCache();
    console.log(`[ARCFACE SERVIDORES] Indexação concluída para ${updates.length} servidor(es).`);
  } catch (err) {
    console.error('[ARCFACE SERVIDORES] Erro na indexação facial de servidores:', err);
  }
}
