import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, message } = body;

    if (!name || !email) {
      return NextResponse.json({ error: 'Nome e e-mail são obrigatórios' }, { status: 400 });
    }

    const existing = await prisma.accessRequest.findFirst({
      where: { email, status: 'PENDING' },
    });
    if (existing) {
      return NextResponse.json({ error: 'Já existe uma solicitação pendente para este e-mail' }, { status: 409 });
    }

    const request = await prisma.accessRequest.create({
      data: { name, email, message },
    });

    return NextResponse.json(request, { status: 201 });
  } catch (err: any) {
    console.error('[access-requests POST]', err);
    // Table may not exist yet on this environment
    if (err?.code === 'P2021' || err?.message?.includes('does not exist')) {
      return NextResponse.json(
        { error: 'Sistema de solicitações não está disponível. Execute a migração do banco de dados.' },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: 'Erro interno ao processar solicitação.' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || 'PENDING';

  const requests = await prisma.accessRequest.findMany({
    where: { status },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(requests);
}
