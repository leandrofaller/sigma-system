import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  if ((session.user as any).role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito ao Superadmin' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const servidor = await prisma.sejusServidor.findUnique({
      where: { id }
    });

    if (!servidor) {
      return NextResponse.json({ error: 'Servidor não encontrado' }, { status: 404 });
    }

    return NextResponse.json(servidor);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
