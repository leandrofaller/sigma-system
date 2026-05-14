import Link from 'next/link';
import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { ArrowLeft } from 'lucide-react';
import { canAccessMissionBoard } from '@/lib/board-auth';
import { MissionBoard } from '@/components/dashboard/board/MissionBoard';

export default async function MissionBoardPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const user = session.user as any;

  const access = await canAccessMissionBoard(params.id, user);
  if (!access.ok) {
    if (access.status === 404) notFound();
    redirect('/acompanhamento');
  }

  // Lista usuários disponíveis para atribuição: admin vê todos, demais veem mesmo grupo + a si próprio
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
  const allUsers = await prisma.user.findMany({
    where: isAdmin ? { isActive: true } : {
      isActive: true,
      OR: [{ id: user.id }, { groupId: user.groupId || undefined }],
    },
    select: { id: true, name: true, avatar: true },
    orderBy: { name: 'asc' },
  });

  return (
    <div className="flex flex-col h-[calc(100dvh-7rem)]">
      <Link
        href="/acompanhamento"
        className="inline-flex items-center gap-2 text-sm text-subtle hover:text-sigma-600 transition-colors mb-3 self-start"
      >
        <ArrowLeft className="w-4 h-4" /> Voltar ao Acompanhamento
      </Link>

      <div className="flex-1 min-h-0">
        <MissionBoard
          missionId={params.id}
          missionTitle={access.mission.title}
          currentUser={{ id: user.id, name: user.name }}
          allUsers={allUsers}
        />
      </div>
    </div>
  );
}
