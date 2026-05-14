import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatDate } from '@/lib/utils';
import { DashboardCards } from '@/components/dashboard/DashboardCards';
import { RecentRelints } from '@/components/dashboard/RecentRelints';
import { RelintChart } from '@/components/dashboard/RelintChart';
import { RecentMessages } from '@/components/dashboard/RecentMessages';
import { OngoingMissions } from '@/components/dashboard/OngoingMissions';
import { OnlineUsersPanel } from '@/components/dashboard/OnlineUsersPanel';

async function getDashboardData(userId: string, role: string, groupId?: string) {
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
  const groupFilter = isAdmin ? {} : { groupId: groupId ?? 'none' };
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

  const [totalRelints, publishedRelints, draftRelints, totalUsers, recentRelints, receivedRelints, totalDebriefings, ongoingMissions, onlineUsers] =
    await Promise.all([
      prisma.relint.count({ where: groupFilter }),
      prisma.relint.count({ where: { ...groupFilter, status: 'PUBLISHED' } }),
      prisma.relint.count({ where: { ...groupFilter, status: 'DRAFT' } }),
      isAdmin ? prisma.user.count({ where: { isActive: true } }) : 0,
      prisma.relint.findMany({
        where: groupFilter,
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { author: true, group: true },
      }),
      prisma.receivedRelint.count({ where: isAdmin ? {} : { groupId: groupId ?? 'none' } }),
      prisma.debriefing.count({ where: groupFilter }),
      prisma.mission.findMany({
        where: { status: 'IN_PROGRESS' },
        include: { group: true, user: true },
        orderBy: { startDate: 'desc' },
      }),
      isAdmin
        ? prisma.user.findMany({
            where: { isActive: true, lastSeenAt: { gte: fiveMinAgo } },
            select: { id: true, name: true, email: true, lastSeenAt: true },
            orderBy: { lastSeenAt: 'desc' },
          })
        : [],
    ]);

  const relintsPerMonth = await prisma.$queryRaw<{ month: string; count: bigint }[]>`
    SELECT TO_CHAR(date, 'MM/YYYY') as month, COUNT(*) as count
    FROM relints
    WHERE date >= NOW() - INTERVAL '6 months'
    GROUP BY TO_CHAR(date, 'MM/YYYY')
    ORDER BY MIN(date) ASC
  `;

  return {
    totalRelints,
    publishedRelints,
    draftRelints,
    totalUsers,
    receivedRelints,
    totalDebriefings,
    ongoingMissions,
    recentRelints,
    onlineUsers,
    relintsPerMonth: relintsPerMonth.map((r) => ({
      month: r.month,
      count: Number(r.count),
    })),
  };
}

export default async function DashboardPage() {
  const session = await auth();
  const user = session!.user as any;
  const data = await getDashboardData(user.id, user.role, user.groupId);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-title">Dashboard</h1>
        <p className="text-body text-sm mt-1">
          Bem-vindo, <span className="font-medium text-gray-700 dark:text-gray-300">{user.name}</span> —{' '}
          {formatDate(new Date())}
        </p>
      </div>

      <DashboardCards
        totalRelints={data.totalRelints}
        publishedRelints={data.publishedRelints}
        draftRelints={data.draftRelints}
        totalUsers={data.totalUsers}
        receivedRelints={data.receivedRelints}
        totalDebriefings={data.totalDebriefings}
        role={user.role}
      />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RelintChart data={data.relintsPerMonth} />
        </div>
        <div>
          <RecentMessages userId={user.id} />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 flex flex-col gap-6">
          <OngoingMissions missions={data.ongoingMissions as any} />
          {(user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') && (
            <OnlineUsersPanel
              users={data.onlineUsers.map((u) => ({
                ...u,
                lastSeenAt: (u.lastSeenAt as Date).toISOString(),
              }))}
            />
          )}
        </div>
        <div className="lg:col-span-2">
          <RecentRelints relints={data.recentRelints} role={user.role} />
        </div>
      </div>
    </div>
  );
}
