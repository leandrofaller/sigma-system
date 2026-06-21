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
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam) : undefined;
    const search = searchParams.get('search') || '';

    const skip = limit ? (page - 1) * limit : undefined;

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
          vinculos: {
            include: {
              apenado: {
                select: {
                  id: true,
                  nome: true,
                  photoPath: true
                }
              }
            }
          },
          _count: {
            select: { entradas: true }
          }
        }
      }),
      prisma.sipeVisitante.count({ where })
    ]);

    // Mapeia o resultado no formato esperado pelo frontend SipeVisitantesPanel
    const mappedVisitantes = visitantes.map((v) => {
      const primeiroVinculo = v.vinculos.find((vin) => vin.ativo) || v.vinculos[0];
      
      return {
        id: v.id,
        visitanteId: v.id,
        nomeVisitante: v.nome,
        cpfVisitante: v.cpf,
        parentescoVisitante: v.parentesco,
        ativoVisitante: primeiroVinculo ? primeiroVinculo.ativo : true,
        photoPath: v.photoPath,
        descricao: v.carteirinha ? `Carteirinha: ${v.carteirinha}` : null,
        apenado: primeiroVinculo?.apenado
          ? {
              id: primeiroVinculo.apenado.id,
              nome: primeiroVinculo.apenado.nome,
              photoPath: primeiroVinculo.apenado.photoPath
            }
          : {
              id: '',
              nome: 'Não informado',
              photoPath: null
            }
      };
    });

    return NextResponse.json({
      visitantes: mappedVisitantes,
      total,
      pages: limit ? Math.ceil(total / limit) : 1,
      currentPage: page
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
