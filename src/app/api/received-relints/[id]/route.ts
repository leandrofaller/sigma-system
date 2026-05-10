import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { unlink } from 'fs/promises';
import { join } from 'path';

function uploadsBase() {
  return process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const body = await req.json();
  const file = await prisma.receivedRelint.update({
    where: { id: params.id },
    data: { folderId: body.folderId ?? null },
    include: { uploadedBy: { select: { name: true } }, group: { select: { name: true } }, folder: true },
  });
  return NextResponse.json(file);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const file = await prisma.receivedRelint.findUnique({ where: { id: params.id } });
  if (!file) return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });

  // Try to delete the local file
  if (file.filename) {
    try {
      await unlink(join(uploadsBase(), 'received', file.filename));
    } catch {
      // File may not exist on disk, continue anyway
    }
  }

  await prisma.receivedRelint.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
