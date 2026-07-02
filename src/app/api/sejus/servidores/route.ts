import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  const userRole = (session.user as any).role;
  if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN' && userRole !== 'OPERATOR') {
    return NextResponse.json({ error: 'Acesso restrito a administradores e operadores' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam) : 10;
    const search = searchParams.get('search') || '';

    const skip = (page - 1) * limit;

    const where: any = {};
    if (search) {
      const cleanSearch = search.trim();
      where.OR = [
        { nome: { contains: cleanSearch, mode: 'insensitive' } },
        { cpf: { contains: cleanSearch } },
        { matricula: { contains: cleanSearch } }
      ];
    }

    const [servidores, total] = await Promise.all([
      prisma.sejusServidor.findMany({
        where,
        orderBy: { nome: 'asc' },
        skip,
        take: limit,
      }),
      prisma.sejusServidor.count({ where })
    ]);

    return NextResponse.json({
      servidores,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
