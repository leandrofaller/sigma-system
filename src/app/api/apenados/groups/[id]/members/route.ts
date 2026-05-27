import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function requireAdmin() {
  const session = await auth();
  if (!session) return { error: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) };
  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return { error: NextResponse.json({ error: 'Acesso negado' }, { status: 403 }) };
  }
  return { user };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id: groupId } = await params;
  const body = await req.json().catch(() => ({}));
  const { apenadoId, similarity } = body as { apenadoId: string; similarity?: number };

  if (!apenadoId) return NextResponse.json({ error: 'apenadoId obrigatório' }, { status: 400 });

  const group = await prisma.apenadoGroup.findUnique({ where: { id: groupId } });
  if (!group) return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 404 });

  await prisma.apenadoGroupMember.upsert({
    where: { groupId_apenadoId: { groupId, apenadoId } },
    create: { groupId, apenadoId, similarity: typeof similarity === 'number' ? similarity : null },
    update: {},
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id: groupId } = await params;
  const body = await req.json().catch(() => ({}));
  const { apenadoId } = body as { apenadoId: string };

  if (!apenadoId) return NextResponse.json({ error: 'apenadoId obrigatório' }, { status: 400 });

  await prisma.apenadoGroupMember.deleteMany({
    where: { groupId, apenadoId },
  });

  return NextResponse.json({ ok: true });
}
