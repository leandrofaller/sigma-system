import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canAccessChatGroup, canAccessDirectChat } from '@/lib/chat-auth';

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
    if (!(await canAccessChatGroup(groupId, user))) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }
    where.groupId = groupId;
    where.receiverId = null;
  } else if (receiverId) {
    if (!(await canAccessDirectChat(receiverId, user))) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }
    where.OR = [
      { senderId: user.id, receiverId },
      { senderId: receiverId, receiverId: user.id },
    ];
    where.groupId = null;
  } else {
    return NextResponse.json({ error: 'Canal não especificado' }, { status: 400 });
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

  if (body.fileUrl) {
    return NextResponse.json({ error: 'Use o endpoint de upload para enviar arquivos' }, { status: 400 });
  }

  if (body.groupId && body.receiverId) {
    return NextResponse.json({ error: 'Canal inválido' }, { status: 400 });
  }
  if (!body.groupId && !body.receiverId) {
    return NextResponse.json({ error: 'Canal não especificado' }, { status: 400 });
  }

  if (body.groupId && !(await canAccessChatGroup(body.groupId, user))) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  if (body.receiverId && !(await canAccessDirectChat(body.receiverId, user))) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const message = await prisma.chatMessage.create({
    data: {
      content: body.content?.trim() || '',
      type: 'TEXT',
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
    if (!(await canAccessChatGroup(groupId, user))) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }
    where = { groupId };
  } else {
    if (!receiverId || !(await canAccessDirectChat(receiverId, user))) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }
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
