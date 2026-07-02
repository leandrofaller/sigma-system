import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
  const { id } = await params;

  const existing = await prisma.arquivoFolder.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Pasta não encontrada' }, { status: 404 });

  if (!isAdmin && existing.groupId !== user.groupId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const { name, color } = await req.json();
  const updateData: { name?: string; color?: string } = {};
  if (name?.trim()) updateData.name = name.trim();
  if (color) updateData.color = color;
  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 });
  }

  const folder = await prisma.arquivoFolder.update({ where: { id }, data: updateData });
  return NextResponse.json(folder);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
  const { id } = await params;

  const existing = await prisma.arquivoFolder.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Pasta não encontrada' }, { status: 404 });

  if (!isAdmin && existing.groupId !== user.groupId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  // Desvincula arquivos antes de deletar a pasta
  await prisma.arquivoFile.updateMany({ where: { folderId: id }, data: { folderId: null } });
  await prisma.arquivoFolder.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
