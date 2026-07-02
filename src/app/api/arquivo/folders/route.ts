import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';

  const { searchParams } = new URL(req.url);
  const groupFilter = searchParams.get('groupId');

  const where = isAdmin
    ? groupFilter ? { groupId: groupFilter } : {}
    : { groupId: user.groupId ?? null };

  const folders = await prisma.arquivoFolder.findMany({
    where,
    orderBy: { name: 'asc' },
  });
  return NextResponse.json(folders);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';

  const body = await req.json();
  const { name, color } = body;
  if (!name?.trim()) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 });

  // Admin pode criar pasta para qualquer grupo; OPERATOR cria no próprio grupo
  const groupId = isAdmin ? (body.groupId || null) : (user.groupId || null);

  const folder = await prisma.arquivoFolder.create({
    data: { name: name.trim(), color: color || '#6172f3', groupId },
  });
  return NextResponse.json(folder, { status: 201 });
}
