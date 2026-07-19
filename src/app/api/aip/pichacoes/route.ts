import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Listar todas as pichações
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const role = (session.user as any).role;
  if (!['SUPER_ADMIN', 'ADMIN', 'OPERATOR'].includes(role)) {
    return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search');
  const municipio = searchParams.get('municipio');
  const distrito = searchParams.get('distrito');
  const faccaoId = searchParams.get('faccaoId');

  try {
    const where: any = {};

    if (municipio && municipio !== 'TODOS') {
      where.municipio = municipio;
    }

    if (distrito && distrito !== 'TODOS') {
      where.distrito = distrito;
    }

    if (faccaoId && faccaoId !== 'TODAS') {
      where.faccaoId = faccaoId === 'SEM_FACCAO' ? null : faccaoId;
    }

    if (search && search.trim() !== '') {
      where.OR = [
        { descricao: { contains: search, mode: 'insensitive' } },
        { endereco: { contains: search, mode: 'insensitive' } },
        { distrito: { contains: search, mode: 'insensitive' } },
      ];
    }

    const pichacoes = await prisma.pichacaoFacciosa.findMany({
      where,
      include: {
        faccao: { select: { id: true, nome: true, sigla: true, cor: true } },
        cadastradoPor: { select: { id: true, name: true, role: true } },
      },
      orderBy: { dataRegistro: 'desc' },
    });

    return NextResponse.json({ pichacoes });
  } catch (error: any) {
    console.error('[PICHACOES GET] Erro:', error);
    return NextResponse.json({ error: 'Erro interno ao listar pichações' }, { status: 500 });
  }
}

// Cadastrar pichação
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const role = (session.user as any).role;
  const userId = (session.user as any).id;

  if (!['SUPER_ADMIN', 'ADMIN', 'OPERATOR'].includes(role)) {
    return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const {
      municipio,
      distrito,
      endereco,
      latitude,
      longitude,
      faccaoId,
      descricao,
      fotos
    } = body;

    if (!municipio) {
      return NextResponse.json({ error: 'O município é obrigatório' }, { status: 400 });
    }
    if (!endereco || endereco.trim() === '') {
      return NextResponse.json({ error: 'O endereço é obrigatório' }, { status: 400 });
    }

    const pichacao = await prisma.pichacaoFacciosa.create({
      data: {
        municipio,
        distrito: distrito || null,
        endereco,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        faccaoId: faccaoId || null,
        descricao: descricao || null,
        fotos: Array.isArray(fotos) ? fotos : [],
        cadastradoPorId: userId,
      },
      include: {
        faccao: { select: { id: true, nome: true, sigla: true, cor: true } },
        cadastradoPor: { select: { id: true, name: true, role: true } },
      }
    });

    return NextResponse.json({ pichacao }, { status: 201 });
  } catch (error: any) {
    console.error('[PICHACOES POST] Erro:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao cadastrar pichação' }, { status: 500 });
  }
}
