import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { warmServidorFaceCache, getServidorCacheStatus } from '@/lib/servidor-face-cache';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  // Inicia aquecimento do cache de servidores em background
  warmServidorFaceCache();

  const [total, indexed, withPhoto, noFace] = await Promise.all([
    prisma.sejusServidor.count(),
    prisma.sejusServidor.count({ where: { faceDescriptor: { not: null }, NOT: { faceDescriptor: 'NONE' } } }),
    prisma.sejusServidor.count({ where: { photoPath: { not: null } } }),
    prisma.sejusServidor.count({ where: { faceDescriptor: 'NONE' } }),
  ]);

  const cache = getServidorCacheStatus();
  return NextResponse.json({
    total,
    indexed,
    withPhoto,
    noFace,
    remaining: withPhoto - indexed - noFace,
    cacheStatus: { loaded: cache.loaded, loading: cache.loading, count: cache.count },
  });
}
