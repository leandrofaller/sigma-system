import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const { messageId, emoji } = await req.json();

  if (!messageId || !emoji) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
  }

  const message = await prisma.chatMessage.findUnique({ where: { id: messageId } });
  if (!message) return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 });

  const reactions = ((message.reactions as Record<string, string[]>) ?? {});
  const users: string[] = reactions[emoji] ?? [];

  let newReactions: Record<string, string[]>;
  if (users.includes(user.id)) {
    const remaining = users.filter((id) => id !== user.id);
    newReactions = { ...reactions };
    if (remaining.length === 0) delete newReactions[emoji];
    else newReactions[emoji] = remaining;
  } else {
    newReactions = { ...reactions, [emoji]: [...users, user.id] };
  }

  await prisma.chatMessage.update({
    where: { id: messageId },
    data: { reactions: newReactions },
  });

  return NextResponse.json({ reactions: newReactions });
}
