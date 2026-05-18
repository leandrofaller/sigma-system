import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  // Sem cap forçado — o frontend controla o loop em lotes
  const limit = Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || '200', 10));

  const records = await prisma.apenado.findMany({
    where: { photoPath: { not: null }, faceDescriptor: null },
    select: { id: true },
    take: limit,
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ ids: records.map((r) => r.id) });
}
