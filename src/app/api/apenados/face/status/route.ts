import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { warmFaceCache, getCacheStatus } from '@/lib/face-cache';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  // Inicia aquecimento do cache de embeddings em background (não bloqueia a resposta)
  warmFaceCache();

  const [total, indexed, withPhoto, noFace] = await Promise.all([
    prisma.apenado.count(),
    // Indexados com embedding real (exclui sentinel 'NONE')
    prisma.apenado.count({ where: { faceDescriptor: { not: null }, NOT: { faceDescriptor: 'NONE' } } }),
    prisma.apenado.count({ where: { photoPath: { not: null } } }),
    // Fotos sem rosto detectável (marcadas com sentinel)
    prisma.apenado.count({ where: { faceDescriptor: 'NONE' } }),
  ]);

  const cache = getCacheStatus();
  return NextResponse.json({
    total,
    indexed,
    withPhoto,
    noFace,
    remaining: withPhoto - indexed - noFace,
    cacheStatus: { loaded: cache.loaded, loading: cache.loading, count: cache.count },
  });
}
