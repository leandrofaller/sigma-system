import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

const TAKE_MAX = 100;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const tab = (sp.get('tab') || 'lowscore') as 'lowscore' | 'blurry' | 'pending';
  const skip = Math.max(0, parseInt(sp.get('skip') || '0', 10));
  const take = Math.min(TAKE_MAX, Math.max(1, parseInt(sp.get('take') || '50', 10)));

  // Stats em paralelo — cada contagem usa o mesmo padrão de filtro
  const [total, indexed, noFace, lowScore, blurry, pending] = await Promise.all([
    prisma.apenado.count({ where: { photoPath: { not: null } } }),
    prisma.apenado.count({ where: { faceDescriptor: { startsWith: '[' } } }),
    prisma.apenado.count({ where: { faceDescriptor: 'NONE' } }),
    prisma.apenado.count({
      where: { faceDescriptor: { startsWith: '[' }, detScore: { lt: 0.5 } },
    }),
    prisma.apenado.count({
      where: {
        faceDescriptor: { startsWith: '[' },
        photoQuality: { lt: 50 },
      },
    }),
    prisma.apenado.count({
      where: { faceDescriptor: null, photoPath: { not: null } },
    }),
  ]);

  // Consulta paginada conforme a aba
  const select = {
    id: true,
    name: true,
    matricula: true,
    unidade: true,
    photoPath: true,
    photoQuality: true,
    detScore: true,
  };

  let records: any[];
  let tabTotal: number;

  if (tab === 'lowscore') {
    const where = { faceDescriptor: { startsWith: '[' }, detScore: { lt: 0.5 } };
    [records, tabTotal] = await Promise.all([
      prisma.apenado.findMany({ where, select, skip, take, orderBy: { detScore: 'asc' } }),
      prisma.apenado.count({ where }),
    ]);
  } else if (tab === 'blurry') {
    const where = { faceDescriptor: { startsWith: '[' }, photoQuality: { lt: 50 } };
    [records, tabTotal] = await Promise.all([
      prisma.apenado.findMany({ where, select, skip, take, orderBy: { photoQuality: 'asc' } }),
      prisma.apenado.count({ where }),
    ]);
  } else {
    const where = { faceDescriptor: null, photoPath: { not: null } };
    [records, tabTotal] = await Promise.all([
      prisma.apenado.findMany({ where, select, skip, take, orderBy: { createdAt: 'asc' } }),
      prisma.apenado.count({ where }),
    ]);
  }

  return NextResponse.json({
    stats: { total, indexed, noFace, lowScore, blurry, pending },
    records,
    total: tabTotal,
    skip,
    take,
  });
}
