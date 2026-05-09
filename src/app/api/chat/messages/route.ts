import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const { searchParams } = new URL(req.url);
  const groupId = searchParams.get('groupId');
  const receiverId = searchParams.get('receiverId');
  const since = searchParams.get('since');

  const where: any = {
    isDeleted: false,
    createdAt: since ? { gt: new Date(since) } : undefined,
  };

  if (groupId) {
    where.groupId = groupId;
    where.receiverId = null;
  } else if (receiverId) {
    where.OR = [
      { senderId: user.id, receiverId },
      { senderId: receiverId, receiverId: user.id },
    ];
    where.groupId = null;
  }

  const messages = await prisma.chatMessage.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: 100,
    include: { sender: { select: { id: true, name: true, avatar: true } } },
  });

  // Mark as read
  if (messages.length > 0) {
    const unread = messages.filter((m) => m.senderId !== user.id && !m.readBy.includes(user.id));
    if (unread.length > 0) {
      await prisma.$transaction(
        unread.map((m) =>
          prisma.chatMessage.update({
            where: { id: m.id },
            data: { readBy: { push: user.id } },
          })
        )
      );
    }
  }

  return NextResponse.json(messages);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const body = await req.json();

  if (!body.content?.trim() && !body.fileUrl) {
    return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 });
  }

  const message = await prisma.chatMessage.create({
    data: {
      content: body.content?.trim() || '',
      type: body.type || 'TEXT',
      fileUrl: body.fileUrl,
      fileName: body.fileName,
      senderId: user.id,
      receiverId: body.receiverId || null,
      groupId: body.groupId || null,
    },
    include: { sender: { select: { id: true, name: true, avatar: true } } },
  });

  return NextResponse.json(message, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const { searchParams } = new URL(req.url);
  const groupId = searchParams.get('groupId');
  const receiverId = searchParams.get('receiverId');

  if (!groupId && !receiverId) {
    return NextResponse.json({ error: 'Canal não especificado' }, { status: 400 });
  }

  let where: any;
  if (groupId) {
    where = { groupId, senderId: user.id };
  } else {
    where = {
      OR: [
        { senderId: user.id, receiverId },
        { senderId: receiverId, receiverId: user.id },
      ],
    };
  }

  await prisma.chatMessage.updateMany({ where, data: { isDeleted: true } });
  return NextResponse.json({ success: true });
}
