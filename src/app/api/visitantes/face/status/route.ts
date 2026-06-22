import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { warmVisitanteFaceCache, getVisitanteCacheStatus } from '@/lib/visitante-face-cache';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  // Inicia aquecimento do cache de visitantes em background
  warmVisitanteFaceCache();

  const [total, indexed, withPhoto, noFace] = await Promise.all([
    prisma.sipeVisitante.count(),
    prisma.sipeVisitante.count({ where: { faceDescriptor: { not: null }, NOT: { faceDescriptor: 'NONE' } } }),
    prisma.sipeVisitante.count({ where: { photoPath: { not: null } } }),
    prisma.sipeVisitante.count({ where: { faceDescriptor: 'NONE' } }),
  ]);

  const cache = getVisitanteCacheStatus();
  return NextResponse.json({
    total,
    indexed,
    withPhoto,
    noFace,
    remaining: withPhoto - indexed - noFace,
    cacheStatus: { loaded: cache.loaded, loading: cache.loading, count: cache.count },
  });
}
