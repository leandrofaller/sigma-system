import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { unlink } from 'fs/promises';
import { join } from 'path';

function uploadsBase() {
  return process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
  const { id } = await params;

  const existing = await prisma.arquivoFile.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });

  // Usuário só pode mover arquivos do próprio grupo
  if (!isAdmin && existing.groupId !== user.groupId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const body = await req.json();
  const file = await prisma.arquivoFile.update({
    where: { id },
    data: { folderId: body.folderId ?? null },
    include: {
      uploadedBy: { select: { name: true } },
      group: { select: { name: true } },
      folder: true,
    },
  });
  return NextResponse.json(file);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
  const { id } = await params;

  const file = await prisma.arquivoFile.findUnique({ where: { id } });
  if (!file) return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });

  // Admin pode deletar qualquer arquivo; OPERATOR apenas os próprios
  if (!isAdmin && file.uploadedById !== user.id) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  if (file.filename) {
    try {
      await unlink(join(uploadsBase(), 'arquivo', file.filename));
    } catch {
      // Arquivo pode não existir no disco; continua de qualquer forma
    }
  }

  await prisma.arquivoFile.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
