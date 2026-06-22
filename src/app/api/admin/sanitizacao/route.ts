import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getSanitizationState, startSanitizationJob, stopSanitizationJob } from '@/lib/sanitization-job';

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const user = session.user as any;
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { searchParams } = req.nextUrl;
    
    // Retorna apenas o status e progresso do job se solicitado
    if (searchParams.get('jobStatus') === 'true') {
      return NextResponse.json(getSanitizationState());
    }

    // Parâmetros de paginação e filtros
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const limit = parseInt(searchParams.get('limit') ?? '20', 10);
    const status = searchParams.get('status') ?? undefined; // 'NO_FACE', 'LOW_QUALITY', 'DUPLICATE', 'ERROR', etc.
    const search = searchParams.get('search') ?? '';

    const skip = (page - 1) * limit;

    // Constrói a query de busca no banco
    const whereClause: any = {};
    
    // Filtro por status
    if (status && status !== 'ALL') {
      whereClause.status = status;
    } else {
      // Por padrão, não mostra os que já foram CLEAN, APPROVED ou REJECTED
      whereClause.status = {
        in: ['NO_FACE', 'LOW_QUALITY', 'DUPLICATE', 'ERROR'],
      };
    }

    // Busca por termo (nome ou matricula do apenado relacionado)
    if (search) {
      whereClause.apenado = {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { matricula: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    // Busca com paginação e inclusão dos dados do apenado local
    const [items, total] = await Promise.all([
      prisma.imageSanitization.findMany({
        where: whereClause,
        include: {
          apenado: {
            select: {
              name: true,
              matricula: true,
              unidade: true,
              faccao: true,
              photoPath: true,
            },
          },
        },
        orderBy: { analyzedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.imageSanitization.count({ where: whereClause }),
    ]);

    return NextResponse.json({
      items,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Erro interno' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const user = session.user as any;
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === 'start') {
      const state = getSanitizationState();
      if (state.isRunning) {
        return NextResponse.json({ error: 'O job já está em execução.' }, { status: 409 });
      }
      startSanitizationJob();
      return NextResponse.json({ started: true });
    } 
    
    if (action === 'stop') {
      stopSanitizationJob();
      return NextResponse.json({ stopped: true });
    }

    return NextResponse.json({ error: 'Ação inválida. Use "start" ou "stop".' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Erro interno' }, { status: 500 });
  }
}
