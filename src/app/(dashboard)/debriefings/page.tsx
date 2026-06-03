import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { DebriefingsList } from '@/components/debriefing/DebriefingsList';

async function getDebriefings(role: string, groupId?: string | null) {
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
  return prisma.debriefing.findMany({
    where: isAdmin ? {} : { groupId: groupId ?? null },
    orderBy: { createdAt: 'desc' },
    include: { author: true, group: true },
  });
}

export default async function DebriefingsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const user = session.user as any;

  let debriefings: Awaited<ReturnType<typeof getDebriefings>> = [];
  let dbError: string | null = null;

  try {
    debriefings = await getDebriefings(user.role, user.groupId);
  } catch (err: any) {
    dbError = err?.message ?? 'Erro desconhecido ao carregar debriefings.';
    console.error('[DebriefingsPage] Erro ao buscar debriefings:', err);
  }

  if (dbError) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="text-2xl font-bold text-title">Debriefings</h1>
        <div className="card p-8 text-center border-red-200 dark:border-red-800">
          <p className="text-red-600 dark:text-red-400 font-semibold mb-2">Erro ao carregar debriefings</p>
          <p className="text-subtle text-sm font-mono">{dbError}</p>
          <p className="text-subtle text-xs mt-3">
            Se o erro persistir, reinicie o servidor para que as migrações de banco sejam aplicadas.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-title">Debriefings</h1>
          <p className="text-body text-sm mt-1">
            {debriefings.length} debriefing{debriefings.length !== 1 ? 's' : ''} encontrado{debriefings.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
      <DebriefingsList debriefings={debriefings} role={user.role} userId={user.id} userGroupId={user.groupId} />
    </div>
  );
}
