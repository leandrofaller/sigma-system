import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/admin/face-auth — lista todos os usuários com status facial
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const currentUser = session.user as any;
  if (currentUser.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito ao Super Administrador.' }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      faceDescriptor: true,
      faceRegisteredAt: true,
      lastLogin: true,
      group: { select: { id: true, name: true } },
    },
  });

  // Retorna sem expor o descriptor em si — apenas se tem ou não
  return NextResponse.json(
    users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      hasFace: !!u.faceDescriptor,
      faceRegisteredAt: u.faceRegisteredAt ?? null,
      lastLogin: u.lastLogin ?? null,
      group: u.group,
    }))
  );
}
