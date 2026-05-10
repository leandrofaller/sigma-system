import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ReceivedRelintsList } from '@/components/relint/ReceivedRelintsList';

async function getReceivedRelints(role: string, groupId?: string) {
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
  return prisma.receivedRelint.findMany({
    where: isAdmin ? {} : { groupId: groupId ?? 'none' },
    orderBy: { createdAt: 'desc' },
    include: { uploadedBy: true, group: true, folder: true },
  });
}

async function getGroups() {
  return prisma.group.findMany({ where: { isActive: true } });
}

async function getFolders() {
  return prisma.receivedRelintFolder.findMany({ orderBy: { name: 'asc' } });
}

export default async function RelintsRecebidosPage() {
  const session = await auth();
  const user = session!.user as any;
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';

  const [files, groups, folders] = await Promise.all([
    getReceivedRelints(user.role, user.groupId),
    isAdmin ? getGroups() : [],
    getFolders(),
  ]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-title">RELINTs Recebidos</h1>
        <p className="text-body text-sm mt-1">
          Arquivos recebidos de outras agências — {files.length} arquivo{files.length !== 1 ? 's' : ''}
        </p>
      </div>
      <ReceivedRelintsList
        files={files}
        groups={groups}
        folders={folders}
        userId={user.id}
        role={user.role}
      />
    </div>
  );
}
