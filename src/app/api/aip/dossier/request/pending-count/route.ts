import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const user = session.user as any;
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';

  if (!isAdmin) {
    return NextResponse.json({ count: 0, latest: null });
  }

  try {
    const [count, latest] = await Promise.all([
      prisma.dossierRequest.count({
        where: { status: 'PENDING' }
      }),
      prisma.dossierRequest.findFirst({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { name: true } },
          apenado: { select: { nome: true } }
        }
      })
    ]);

    return NextResponse.json({ count, latest });
  } catch (err: any) {
    console.error('Error counting pending dossier requests:', err);
    return NextResponse.json({ error: 'Erro ao contar solicitações pendentes' }, { status: 500 });
  }
}
