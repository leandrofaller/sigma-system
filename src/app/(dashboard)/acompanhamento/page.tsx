import Link from 'next/link';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Activity, Calendar, MapPin, Users, ChevronRight, ClipboardCheck } from 'lucide-react';

export default async function AcompanhamentoPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const user = session.user as any;
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';

  // Missões visíveis: do usuário, do mesmo grupo, ou admin vê todas
  const missions = await prisma.mission.findMany({
    where: isAdmin ? {} : {
      OR: [
        { userId: user.id },
        { groupId: user.groupId || undefined },
      ],
    },
    orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
    include: {
      user: { select: { name: true } },
      group: { select: { name: true, color: true } },
      _count: { select: { boardLists: true } },
      boardLists: {
        select: {
          cards: {
            select: { id: true, _count: { select: { comments: true } } },
          },
        },
      },
    },
  });

  const enriched = missions.map(m => {
    const totalCards = m.boardLists.reduce((acc, l) => acc + l.cards.length, 0);
    const totalComments = m.boardLists.reduce((acc, l) =>
      acc + l.cards.reduce((s, c) => s + c._count.comments, 0), 0);
    return { ...m, totalCards, totalComments };
  });

  const inProgress = enriched.filter(m => m.status === 'IN_PROGRESS');
  const planned = enriched.filter(m => m.status === 'PLANNED');
  const others = enriched.filter(m => m.status === 'COMPLETED' || m.status === 'CANCELLED');

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-title">Acompanhamento de Missões</h1>
        <p className="text-body text-sm mt-1">
          Quadros colaborativos em tempo real para cada missão
        </p>
      </div>

      <Section title="Em Curso" missions={inProgress} highlight />
      <Section title="Planejadas" missions={planned} />
      {others.length > 0 && <Section title="Concluídas / Canceladas" missions={others} muted />}

      {missions.length === 0 && (
        <div className="card p-12 text-center">
          <ClipboardCheck className="w-12 h-12 text-subtle mx-auto mb-3" />
          <h3 className="text-lg font-bold text-title">Nenhuma missão para acompanhar</h3>
          <p className="text-sm text-subtle mt-1">
            Crie uma missão no <Link href="/missoes" className="text-sigma-600 underline">Calendário</Link> para começar.
          </p>
        </div>
      )}
    </div>
  );
}

function Section({
  title, missions, highlight, muted,
}: { title: string; missions: any[]; highlight?: boolean; muted?: boolean }) {
  if (missions.length === 0) return null;

  return (
    <section>
      <h2 className={`text-xs font-bold uppercase tracking-wider mb-3 px-1 flex items-center gap-2 ${
        highlight ? 'text-orange-600 dark:text-orange-400' : 'text-subtle'
      }`}>
        {highlight && <Activity className="w-3.5 h-3.5 animate-pulse" />}
        {title} <span className="font-normal opacity-60">({missions.length})</span>
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {missions.map(m => (
          <Link
            key={m.id}
            href={`/missoes/${m.id}/quadro`}
            className={`card p-4 hover:shadow-lg hover:border-sigma-300 dark:hover:border-sigma-700 transition-all group ${
              muted ? 'opacity-70 hover:opacity-100' : ''
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-title text-sm truncate group-hover:text-sigma-600">{m.title}</h3>
                <p className="text-xs text-subtle mt-0.5 flex items-center gap-1">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{m.destination}</span>
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-subtle group-hover:text-sigma-600 group-hover:translate-x-1 transition-transform flex-shrink-0" />
            </div>

            <div className="flex items-center gap-3 text-[11px] text-subtle mt-3">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {format(new Date(m.startDate), "dd MMM", { locale: ptBR })}
              </span>
              {m.group && (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.group.color || '#6172f3' }} />
                  {m.group.name}
                </span>
              )}
              <span className="flex items-center gap-1 ml-auto">
                <Users className="w-3 h-3" /> {m.user.name?.split(' ')[0]}
              </span>
            </div>

            {(m.totalCards > 0 || m.totalComments > 0) && (
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 text-[11px]">
                {m.totalCards > 0 && (
                  <span className="text-body font-semibold">
                    {m.totalCards} card{m.totalCards !== 1 ? 's' : ''}
                  </span>
                )}
                {m.totalComments > 0 && (
                  <span className="text-subtle">
                    {m.totalComments} coment.
                  </span>
                )}
              </div>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
