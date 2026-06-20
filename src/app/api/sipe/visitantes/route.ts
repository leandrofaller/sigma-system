import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  if ((session.user as any).role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito ao Superadmin' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const search = searchParams.get('search') || '';

    const skip = (page - 1) * limit;

    const where: any = {};
    if (search) {
      const cleanSearch = search.trim();
      where.OR = [
        { nome: { contains: cleanSearch, mode: 'insensitive' } },
        { cpf: { contains: cleanSearch } },
        { carteirinha: { contains: cleanSearch } }
      ];
    }

    const [visitantes, total] = await Promise.all([
      prisma.sipeVisitante.findMany({
        where,
        orderBy: { nome: 'asc' },
        skip,
        take: limit,
        include: {
          _count: {
            select: { entradas: true }
          }
        }
      }),
      prisma.sipeVisitante.count({ where })
    ]);

    return NextResponse.json({
      visitantes,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
