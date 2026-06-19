import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const currentUser = session.user as any;
  if (currentUser.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito ao Super Administrador.' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    const whereClause: any = {
      action: 'FACE_LOGIN_ATTEMPT',
    };

    if (userId) {
      whereClause.userId = userId;
    }

    const logs = await prisma.auditLog.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: 100, // Limita aos últimos 100 para evitar sobrecarga
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json(logs);
  } catch (err: any) {
    return NextResponse.json({ error: 'Erro ao obter logs de auditoria: ' + err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const currentUser = session.user as any;
  if (currentUser.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito ao Super Administrador.' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const logId = searchParams.get('id');

    if (!logId) {
      return NextResponse.json({ error: 'ID do log é obrigatório.' }, { status: 400 });
    }

    const log = await prisma.auditLog.findUnique({
      where: { id: logId },
    });

    if (!log) {
      return NextResponse.json({ error: 'Log não encontrado.' }, { status: 404 });
    }

    const details = log.details as any;
    if (details && details.photoPath) {
      const { deleteLocalFile } = await import('@/lib/storage');
      const path = await import('path');
      const absolutePath = path.join(process.cwd(), details.photoPath);
      await deleteLocalFile(absolutePath);

      // Atualiza o details removendo o photoPath
      const updatedDetails = { ...details, photoPath: null };
      await prisma.auditLog.update({
        where: { id: logId },
        data: { details: updatedDetails },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: 'Erro ao remover foto de login: ' + err.message }, { status: 500 });
  }
}
