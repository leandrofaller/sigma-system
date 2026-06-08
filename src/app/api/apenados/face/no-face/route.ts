import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'advanced';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '12', 10)));
  const offset = (page - 1) * limit;

  const whereCondition = type === 'classic'
    ? { faceDescriptor: 'NONE' }
    : { faceDescriptorAdvanced: 'NONE' };

  try {
    const [total, records] = await Promise.all([
      prisma.apenado.count({ where: whereCondition }),
      prisma.apenado.findMany({
        where: whereCondition,
        select: {
          id: true,
          name: true,
          matricula: true,
          unidade: true,
          photoPath: true,
        },
        orderBy: { name: 'asc' },
        skip: offset,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      records,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro ao buscar registros sem rosto' }, { status: 500 });
  }
}
