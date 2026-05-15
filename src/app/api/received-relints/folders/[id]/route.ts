import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const { name, color } = await req.json();
  const updateData: { name?: string; color?: string } = {};
  if (name?.trim()) updateData.name = name.trim();
  if (color) updateData.color = color;
  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 });
  }

  const folder = await prisma.receivedRelintFolder.update({
    where: { id: (await params).id },
    data: updateData,
  });
  return NextResponse.json(folder);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  // Unassign files before deleting the folder
  await prisma.receivedRelint.updateMany({
    where: { folderId: (await params).id },
    data: { folderId: null },
  });
  await prisma.receivedRelintFolder.delete({ where: { id: (await params).id } });
  return NextResponse.json({ success: true });
}
