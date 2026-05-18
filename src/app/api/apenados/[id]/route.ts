import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { unlink } from 'fs/promises';
import { join } from 'path';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { name, matricula, unidade, faccao, notes } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
  }

  const apenado = await prisma.apenado.update({
    where: { id },
    data: {
      name: name.trim().toUpperCase(),
      matricula: matricula?.trim() || null,
      unidade: unidade?.trim() || null,
      faccao: faccao?.trim() || null,
      notes: notes?.trim() || null,
    },
  });

  return NextResponse.json(apenado);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const { id } = await params;
  const apenado = await prisma.apenado.findUnique({ where: { id } });
  if (!apenado) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  if (apenado.photoPath) {
    try {
      await unlink(join(process.cwd(), apenado.photoPath));
    } catch {}
  }

  await prisma.apenado.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
