import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatDate } from '@/lib/utils';
import { DashboardCards } from '@/components/dashboard/DashboardCards';
import { RecentRelints } from '@/components/dashboard/RecentRelints';
import { RelintChart } from '@/components/dashboard/RelintChart';
import { RecentMessages } from '@/components/dashboard/RecentMessages';

async function getDashboardData(userId: string, role: string, groupId?: string) {
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
  const groupFilter = isAdmin ? {} : { groupId: groupId ?? 'none' };

  const [totalRelints, publishedRelints, draftRelints, totalUsers, recentRelints, receivedRelints] =
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
    recentRelints,
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
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">
          Bem-vindo, <span className="font-medium text-gray-700">{user.name}</span> —{' '}
          {formatDate(new Date())}
        </p>
      </div>

      <DashboardCards
        totalRelints={data.totalRelints}
        publishedRelints={data.publishedRelints}
        draftRelints={data.draftRelints}
        totalUsers={data.totalUsers}
        receivedRelints={data.receivedRelints}
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

      <RecentRelints relints={data.recentRelints} role={user.role} />
    </div>
  );
}
