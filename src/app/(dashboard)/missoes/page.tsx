import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { MissionCalendar } from '@/components/dashboard/MissionCalendar';

async function getMissions(role: string, groupId?: string) {
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
  return prisma.mission.findMany({
    where: isAdmin ? {} : { groupId: groupId || 'none' },
    include: {
      user: { select: { name: true, avatar: true } },
      group: { select: { name: true, color: true } },
    },
    orderBy: { startDate: 'asc' },
  });
}

async function getGroups() {
  return prisma.group.findMany({ where: { isActive: true } });
}

export default async function MissoesPage() {
  const session = await auth();
  const user = session!.user as any;

  const [missions, groups] = await Promise.all([
    getMissions(user.role, user.groupId),
    getGroups(),
  ]);

  // Convert dates to ISO strings for the client component
  const serializedMissions = missions.map(m => ({
    ...m,
    startDate: m.startDate.toISOString(),
    endDate: m.endDate?.toISOString(),
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-title">Calendário de Missões</h1>
        <p className="text-body text-sm mt-1">Gestão de viagens e deslocamentos operacionais</p>
      </div>
      
      <MissionCalendar 
        initialMissions={serializedMissions as any} 
        currentUser={user}
        groups={groups}
      />
    </div>
  );
}
