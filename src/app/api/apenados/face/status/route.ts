import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const [total, indexed, withPhoto] = await Promise.all([
    prisma.apenado.count(),
    prisma.apenado.count({ where: { faceDescriptor: { not: null } } }),
    prisma.apenado.count({ where: { photoPath: { not: null } } }),
  ]);

  return NextResponse.json({
    total,
    indexed,
    withPhoto,
    remaining: withPhoto - indexed,
  });
}
