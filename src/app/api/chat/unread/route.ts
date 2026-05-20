import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const user = session.user as any;
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';

  const direct = await prisma.chatMessage.count({
    where: {
      receiverId: user.id,
      senderId: { not: user.id },
      isDeleted: false,
      NOT: { readBy: { has: user.id } },
    },
  });

  let groupCount = 0;
  if (isAdmin) {
    const allGroups = await prisma.group.findMany({ select: { id: true }, where: { isActive: true } });
    groupCount = await prisma.chatMessage.count({
      where: {
        groupId: { in: allGroups.map((g) => g.id) },
        senderId: { not: user.id },
        isDeleted: false,
        NOT: { readBy: { has: user.id } },
      },
    });
  } else if (user.groupId) {
    groupCount = await prisma.chatMessage.count({
      where: {
        groupId: user.groupId,
        senderId: { not: user.id },
        isDeleted: false,
        NOT: { readBy: { has: user.id } },
      },
    });
  }

  return NextResponse.json({ count: direct + groupCount });
}
