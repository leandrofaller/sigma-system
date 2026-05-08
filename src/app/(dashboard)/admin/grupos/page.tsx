import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { GroupsTable } from '@/components/admin/GroupsTable';

async function getGroups() {
  return prisma.group.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { users: true, relints: true } } },
  });
}

export default async function GruposPage() {
  const session = await auth();
  const user = session!.user as any;

  if (user.role !== 'SUPER_ADMIN') {
    redirect('/dashboard');
  }

  const groups = await getGroups();

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Grupos / Setores</h1>
        <p className="text-gray-500 text-sm mt-1">
          {groups.length} grupo{groups.length !== 1 ? 's' : ''} configurado{groups.length !== 1 ? 's' : ''}
        </p>
      </div>
      <GroupsTable groups={groups as any} />
    </div>
  );
}
