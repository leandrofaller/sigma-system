import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getLocalFile } from '@/lib/storage';
import path from 'path';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse('Não autorizado', { status: 401 });
  }

  const currentUser = session.user as any;
  if (currentUser.role !== 'SUPER_ADMIN') {
    return new NextResponse('Acesso restrito ao Super Administrador', { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const logId = searchParams.get('id');

    if (!logId) {
      return new NextResponse('ID do log é obrigatório', { status: 400 });
    }

    const log = await prisma.auditLog.findUnique({
      where: { id: logId },
    });

    if (!log) {
      return new NextResponse('Log não encontrado', { status: 404 });
    }

    const details = log.details as any;
    if (!details || !details.photoPath) {
      return new NextResponse('Foto não disponível ou removida', { status: 404 });
    }

    const absolutePath = path.join(process.cwd(), details.photoPath);
    const buffer = await getLocalFile(absolutePath);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err: any) {
    return new NextResponse('Erro ao carregar imagem: ' + err.message, { status: 500 });
  }
}
