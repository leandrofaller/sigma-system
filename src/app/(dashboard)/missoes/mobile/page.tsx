import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { MobileMissionView } from '@/components/dashboard/MobileMissionView';

export default async function MissoesMobilePage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const user = session.user as any;

  const [missions, groups] = await Promise.all([
    prisma.mission.findMany({
      where: { userId: user.id },
      include: {
        group: { select: { id: true, name: true, color: true } },
      },
      orderBy: { startDate: 'desc' },
      take: 30,
    }),
    prisma.group.findMany({
      where: { isActive: true },
      select: { id: true, name: true, color: true },
    }),
  ]);

  const serialized = missions.map(m => ({
    ...m,
    startDate: m.startDate.toISOString(),
    endDate: m.endDate?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  }));

  return (
    <MobileMissionView
      initialMissions={serialized as any}
      groups={groups}
      currentUser={{
        id: user.id,
        name: user.name,
        groupId: user.groupId,
      }}
    />
  );
}
