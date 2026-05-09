import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ChatWindow } from '@/components/chat/ChatWindow';

async function getContacts(userId: string, role: string) {
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
  return prisma.user.findMany({
    where: { isActive: true, id: { not: userId } },
    select: { id: true, name: true, email: true, role: true, group: true, avatar: true, lastLogin: true },
    ...(isAdmin ? {} : {}),
  });
}

async function getGroups(role: string, groupId?: string) {
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
    return prisma.group.findMany({ where: { isActive: true } });
  }
  return groupId ? prisma.group.findMany({ where: { id: groupId } }) : [];
}

export default async function ChatPage() {
  const session = await auth();
  const user = session!.user as any;

  const [contacts, groups] = await Promise.all([
    getContacts(user.id, user.role),
    getGroups(user.role, user.groupId),
  ]);

  return (
    <div className="animate-fade-in h-[calc(100vh-10rem)]">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-title">Chat Interno</h1>
        <p className="text-body text-sm mt-1">Comunicação segura e compartimentada</p>
      </div>
      <ChatWindow
        currentUser={user}
        contacts={contacts as any}
        groups={groups}
      />
    </div>
  );
}
