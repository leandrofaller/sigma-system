import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
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
