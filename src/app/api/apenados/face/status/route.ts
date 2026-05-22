import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const [total, indexed, withPhoto, noFace] = await Promise.all([
    prisma.apenado.count(),
    // Indexados com embedding real (exclui sentinel 'NONE')
    prisma.apenado.count({ where: { faceDescriptor: { not: null }, NOT: { faceDescriptor: 'NONE' } } }),
    prisma.apenado.count({ where: { photoPath: { not: null } } }),
    // Fotos sem rosto detectável (marcadas com sentinel)
    prisma.apenado.count({ where: { faceDescriptor: 'NONE' } }),
  ]);

  return NextResponse.json({
    total,
    indexed,
    withPhoto,
    noFace,
    remaining: withPhoto - indexed - noFace,
  });
}
