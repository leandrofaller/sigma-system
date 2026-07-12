import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const [total, indexed, withPhoto, noFace] = await Promise.all([
    prisma.sipeVisitante.count(),
    // Indexados com embedding real do Antelopev2 (exclui sentinel 'NONE')
    prisma.sipeVisitante.count({
      where: {
        faceDescriptorAdvanced: { not: null },
        NOT: { faceDescriptorAdvanced: 'NONE' },
      },
    }),
    prisma.sipeVisitante.count({ where: { photoPath: { not: null } } }),
    // Fotos sem rosto detectável no Antelopev2
    prisma.sipeVisitante.count({ where: { faceDescriptorAdvanced: 'NONE' } }),
  ]);

  return NextResponse.json({
    total,
    indexed,
    withPhoto,
    noFace,
    remaining: withPhoto - indexed - noFace,
  });
}
