import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { DebriefingsList } from '@/components/debriefing/DebriefingsList';

async function getDebriefings(role: string, groupId?: string) {
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
  return prisma.debriefing.findMany({
    where: isAdmin ? {} : { groupId: groupId ?? 'none' },
    orderBy: { createdAt: 'desc' },
    include: { author: true, group: true },
  });
}

export default async function DebriefingsPage() {
  const session = await auth();
  const user = session!.user as any;
  const debriefings = await getDebriefings(user.role, user.groupId);

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
      <DebriefingsList debriefings={debriefings} role={user.role} userId={user.id} />
    </div>
  );
}
