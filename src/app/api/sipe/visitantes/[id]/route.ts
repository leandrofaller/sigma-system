import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  const role = (session.user as any).role;
  if (role !== 'SUPER_ADMIN' && role !== 'ADMIN' && role !== 'OPERATOR') {
    return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 });
  }

  // Acesso seguro aos parâmetros dinâmicos de rota no Next.js 15+
  const { id } = await params;

  try {
    const visitante = await prisma.sipeVisitante.findUnique({
      where: { id },
      include: {
        entradas: {
          orderBy: { dataEntrada: 'desc' }
        },
        vinculos: {
          include: {
            apenado: true
          }
        }
      }
    });

    if (!visitante) {
      return NextResponse.json({ error: 'Visitante não encontrado' }, { status: 404 });
    }

    return NextResponse.json(visitante);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
