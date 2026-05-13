import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { MissionReport } from '@/components/dashboard/MissionReport';

export default async function MissoesRelatorioPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const user = session.user as any;
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';

  const [missions, groups, users] = await Promise.all([
    prisma.mission.findMany({
      where: isAdmin ? {} : { userId: user.id },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        group: { select: { id: true, name: true, color: true } },
      },
      orderBy: { startDate: 'desc' },
    }),
    prisma.group.findMany({ where: { isActive: true }, select: { id: true, name: true, color: true } }),
    isAdmin
      ? prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);

  const serialized = missions.map(m => ({
    ...m,
    startDate: m.startDate.toISOString(),
    endDate: m.endDate?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-title">Relatório de Viagens</h1>
        <p className="text-body text-sm mt-1">
          {isAdmin
            ? `Resumo consolidado de todas as viagens registradas — ${missions.length} no total`
            : `Resumo das suas viagens registradas — ${missions.length} no total`}
        </p>
      </div>

      <MissionReport
        missions={serialized as any}
        groups={groups}
        users={users}
        isAdmin={isAdmin}
        currentUserId={user.id}
      />
    </div>
  );
}
