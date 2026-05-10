import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { RelintsList } from '@/components/relint/RelintsList';

async function getRelints(role: string, groupId?: string) {
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
  return prisma.relint.findMany({
    where: isAdmin ? {} : { groupId: groupId ?? 'none' },
    orderBy: { createdAt: 'desc' },
    include: { author: true, group: true },
  });
}

export default async function RelintsPage() {
  const session = await auth();
  const user = session!.user as any;
  const relints = await getRelints(user.role, user.groupId);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-title">Relatórios de Inteligência</h1>
          <p className="text-body text-sm mt-1">
            {relints.length} relatório{relints.length !== 1 ? 's' : ''} encontrado{relints.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
      <RelintsList relints={relints} role={user.role} userId={user.id} />
    </div>
  );
}
