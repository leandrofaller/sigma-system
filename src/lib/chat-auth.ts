import { prisma } from './db';

export function isChatAdmin(user: { role?: string }) {
  return user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
}

export async function canAccessChatGroup(
  groupId: string,
  user: { role?: string; groupId?: string | null }
) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, isActive: true },
  });
  if (!group?.isActive) return false;
  return isChatAdmin(user) || user.groupId === groupId;
}

export async function canAccessDirectChat(receiverId: string, user: { id: string }) {
  if (receiverId === user.id) return false;
  const receiver = await prisma.user.findUnique({
    where: { id: receiverId },
    select: { id: true, isActive: true },
  });
  return !!receiver?.isActive;
}

export async function canAccessChatMessage(
  messageId: string,
  user: { id: string; role?: string; groupId?: string | null }
) {
  const message = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    select: { senderId: true, receiverId: true, groupId: true },
  });
  if (!message) return false;
  if (message.groupId) return canAccessChatGroup(message.groupId, user);
  return message.senderId === user.id || message.receiverId === user.id;
}
