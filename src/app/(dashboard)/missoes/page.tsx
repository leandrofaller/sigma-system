import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { MissionCalendar } from '@/components/dashboard/MissionCalendar';
import { MobileMissionView } from '@/components/dashboard/MobileMissionView';
import { headers } from 'next/headers';

export default async function MissoesPage() {
  const session = await auth();
  const user = session!.user as any;

  // Detectar dispositivo móvel a partir do User-Agent
  const headersList = await headers();
  const ua = headersList.get('user-agent') || '';
  const isMobile = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);

  // Buscar grupos ativos
  const groups = await prisma.group.findMany({ where: { isActive: true } });

  // Buscar missões condicionalmente
  let missions;
  if (isMobile) {
    const nameParts = user.name ? user.name.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(' ').filter(Boolean) : [];
    missions = await prisma.mission.findMany({
      where: {
        OR: [
          { userId: user.id },
          {
            participants: {
              hasSome: nameParts
            }
          }
        ]
      },
      include: {
        group: { select: { id: true, name: true, color: true } },
      },
      orderBy: { startDate: 'desc' },
      take: 30,
    });
  } else {
    missions = await prisma.mission.findMany({
      where: { status: { not: 'CANCELLED' } },
      include: {
        user: { select: { name: true, avatar: true } },
        group: { select: { name: true, color: true } },
      },
      orderBy: { startDate: 'asc' },
    });
  }

  // Serializar datas
  const serializedMissions = missions.map(m => ({
    ...m,
    startDate: m.startDate.toISOString(),
    endDate: m.endDate?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  }));

  if (isMobile) {
    return (
      <MobileMissionView
        initialMissions={serializedMissions as any}
        groups={groups}
        currentUser={{
          id: user.id,
          name: user.name,
          groupId: user.groupId,
        }}
      />
    );
  }

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
