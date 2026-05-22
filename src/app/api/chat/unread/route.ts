import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export interface UnreadChannel {
  type: 'direct' | 'group';
  id: string;
  name: string;
  unread: number;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const user = session.user as any;
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';

  // ── Diretas: agrupa por remetente ─────────────────────────────────────────
  const directGroups = await prisma.chatMessage.groupBy({
    by: ['senderId'],
    where: {
      receiverId: user.id,
      senderId: { not: user.id },
      isDeleted: false,
      NOT: { readBy: { has: user.id } },
    },
    _count: { id: true },
  });

  const directChannels: UnreadChannel[] = [];
  if (directGroups.length > 0) {
    const senders = await prisma.user.findMany({
      where: { id: { in: directGroups.map((g) => g.senderId) } },
      select: { id: true, name: true },
    });
    const senderMap = new Map(senders.map((s) => [s.id, s.name]));
    for (const g of directGroups) {
      directChannels.push({
        type: 'direct',
        id: g.senderId,
        name: senderMap.get(g.senderId) ?? 'Usuário',
        unread: g._count.id,
      });
    }
  }

  // ── Grupos: agrupa por grupo ───────────────────────────────────────────────
  let accessibleGroupIds: string[] = [];
  if (isAdmin) {
    const all = await prisma.group.findMany({ select: { id: true }, where: { isActive: true } });
    accessibleGroupIds = all.map((g) => g.id);
  } else if (user.groupId) {
    accessibleGroupIds = [user.groupId];
  }

  const groupChannels: UnreadChannel[] = [];
  if (accessibleGroupIds.length > 0) {
    const groupGroups = await prisma.chatMessage.groupBy({
      by: ['groupId'],
      where: {
        groupId: { in: accessibleGroupIds },
        senderId: { not: user.id },
        isDeleted: false,
        NOT: { readBy: { has: user.id } },
      },
      _count: { id: true },
    });

    if (groupGroups.length > 0) {
      const gids = groupGroups.map((g) => g.groupId!).filter(Boolean);
      const groups = await prisma.group.findMany({
        where: { id: { in: gids } },
        select: { id: true, name: true },
      });
      const groupMap = new Map(groups.map((g) => [g.id, g.name]));
      for (const g of groupGroups) {
        if (!g.groupId) continue;
        groupChannels.push({
          type: 'group',
          id: g.groupId,
          name: groupMap.get(g.groupId) ?? 'Grupo',
          unread: g._count.id,
        });
      }
    }
  }

  const channels = [...directChannels, ...groupChannels];
  const count = channels.reduce((s, c) => s + c.unread, 0);

  return NextResponse.json({ count, channels });
}
