import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST /api/users/[id]/face — cadastra o faceDescriptor do usuário
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const { id } = await params;
  const sessionUserId = (session.user as any).id;
  const sessionRole = (session.user as any).role;

  // Permite: o próprio usuário, ADMIN ou SUPER_ADMIN
  const isOwnProfile = sessionUserId === id;
  const isAdmin = sessionRole === 'ADMIN' || sessionRole === 'SUPER_ADMIN';
  if (!isOwnProfile && !isAdmin) {
    return NextResponse.json({ error: 'Permissão negada.' }, { status: 403 });
  }

  let body: { faceDescriptor?: number[]; faceImage?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const { faceDescriptor, faceImage } = body;
  if (!Array.isArray(faceDescriptor) || faceDescriptor.length !== 128) {
    return NextResponse.json(
      { error: 'Descriptor facial inválido. Esperado array de 128 números.' },
      { status: 400 }
    );
  }

  // Verifica que todos são números válidos
  if (!faceDescriptor.every((v) => typeof v === 'number' && isFinite(v))) {
    return NextResponse.json(
      { error: 'Descriptor facial contém valores inválidos.' },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
  }

  await prisma.user.update({
    where: { id },
    data: {
      faceDescriptor: JSON.stringify(faceDescriptor),
      faceRegisteredAt: new Date(),
      avatar: faceImage || undefined,
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId: sessionUserId,
      action: 'FACE_REGISTERED',
      entity: 'User',
      entityId: id,
      details: { registeredBy: sessionUserId },
    },
  }).catch(() => {});

  return NextResponse.json({ success: true, message: 'Face cadastrada com sucesso.' });
}

// DELETE /api/users/[id]/face — remove o faceDescriptor do usuário
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const { id } = await params;
  const sessionUserId = (session.user as any).id;
  const sessionRole = (session.user as any).role;

  const isOwnProfile = sessionUserId === id;
  const isAdmin = sessionRole === 'ADMIN' || sessionRole === 'SUPER_ADMIN';
  if (!isOwnProfile && !isAdmin) {
    return NextResponse.json({ error: 'Permissão negada.' }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
  }

  await prisma.user.update({
    where: { id },
    data: { faceDescriptor: null, faceRegisteredAt: null, avatar: null },
  });

  await prisma.auditLog.create({
    data: {
      userId: sessionUserId,
      action: 'FACE_REMOVED',
      entity: 'User',
      entityId: id,
      details: { removedBy: sessionUserId },
    },
  }).catch(() => {});

  return NextResponse.json({ success: true, message: 'Cadastro facial removido.' });
}

// GET /api/users/[id]/face — verifica se o usuário tem face cadastrada
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const { id } = await params;
  const sessionUserId = (session.user as any).id;
  const sessionRole = (session.user as any).role;

  const isOwnProfile = sessionUserId === id;
  const isAdmin = sessionRole === 'ADMIN' || sessionRole === 'SUPER_ADMIN';
  if (!isOwnProfile && !isAdmin) {
    return NextResponse.json({ error: 'Permissão negada.' }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: { faceDescriptor: true, faceRegisteredAt: true, avatar: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
  }

  return NextResponse.json({
    hasFace: !!user.faceDescriptor,
    registeredAt: user.faceRegisteredAt ?? null,
    avatar: user.avatar ?? null,
  });
}
