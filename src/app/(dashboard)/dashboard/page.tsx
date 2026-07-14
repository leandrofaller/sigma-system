import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatDate } from '@/lib/utils';
import { DashboardCards } from '@/components/dashboard/DashboardCards';
import { RecentRelints } from '@/components/dashboard/RecentRelints';
import { RelintChart } from '@/components/dashboard/RelintChart';
import { RecentMessages } from '@/components/dashboard/RecentMessages';
import { OngoingMissions } from '@/components/dashboard/OngoingMissions';
import { OnlineUsersPanel } from '@/components/dashboard/OnlineUsersPanel';
import Link from 'next/link';

async function getDashboardData(user: { id: string; name: string; role: string; groupId?: string }) {
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
  const groupFilter = isAdmin ? {} : { groupId: user.groupId ?? '' };
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

  const [
    totalRelints, publishedRelints, draftRelints, totalUsers,
    recentRelints, receivedRelints, totalDebriefings, ongoingMissions,
    onlineUsers, completedMissionsWithoutDebriefing
  ] = await Promise.all([
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
    prisma.receivedRelint.count({ where: isAdmin ? {} : { groupId: user.groupId ?? null } }),
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
    prisma.mission.findMany({
      where: {
        status: 'COMPLETED',
        debriefing: null,
      },
      include: { group: true, user: true },
      orderBy: { endedAt: 'desc' },
    }),
  ]);

  const userNormalizedName = user.name ? user.name.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
  const userParts = userNormalizedName.split(' ').filter(Boolean);
  
  const pendingDebriefings = completedMissionsWithoutDebriefing.filter(m => {
    return m.participants.some(p => {
      const pNormalized = p.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const pParts = pNormalized.split(' ').filter(Boolean);
      if (userNormalizedName.includes(pNormalized) || pNormalized.includes(userNormalizedName)) return true;
      const ignoreWords = ['DE', 'DA', 'DO', 'DOS', 'DAS', 'E', 'O', 'A'];
      const userMeaningfulParts = userParts.filter(w => !ignoreWords.includes(w));
      const pMeaningfulParts = pParts.filter(w => !ignoreWords.includes(w));
      return pMeaningfulParts.some(pw => userMeaningfulParts.includes(pw));
    });
  }).map(m => ({
    id: m.id,
    title: m.title,
    destination: m.destination,
    endedAt: m.endedAt ? m.endedAt.toISOString() : null,
  }));

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
    pendingDebriefings,
    relintsPerMonth: relintsPerMonth.map((r) => ({
      month: r.month,
      count: Number(r.count),
    })),
  };
}

export default async function DashboardPage() {
  const session = await auth();
  const user = session!.user as any;
  const data = await getDashboardData(user);

  return (
    <div className="space-y-6 animate-fade-in">
      {data.pendingDebriefings.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 p-4 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-amber-800 dark:text-amber-400 flex items-center gap-2">
              ⚠️ Debriefing Pendente de Viagem
            </h3>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Você participou de {data.pendingDebriefings.length} viagem(ns) finalizada(s) que ainda não possui(em) Debriefing registrado. Por favor, registre o Debriefing para formalizar a missão.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.pendingDebriefings.map((m: any) => (
              <Link
                key={m.id}
                href={`/debriefings/novo?missionId=${m.id}`}
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs px-3 py-1.5 rounded-xl font-semibold shadow-sm transition-all whitespace-nowrap active:scale-95"
              >
                Registrar: {m.title.slice(0, 20)}{m.title.length > 20 ? '...' : ''}
              </Link>
            ))}
          </div>
        </div>
      )}

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
