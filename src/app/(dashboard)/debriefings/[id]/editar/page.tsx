import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { DebriefingEditor } from '@/components/debriefing/DebriefingEditor';

async function getGroups(role: string, groupId?: string) {
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
    return prisma.group.findMany({ where: { isActive: true } });
  }
  if (!groupId) return [];
  return prisma.group.findMany({ where: { id: groupId } });
}

export default async function EditarDebriefingPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect('/login');

  const user = session.user as any;
  const { id } = await params;

  const debriefing = await prisma.debriefing.findUnique({
    where: { id },
    include: { author: true, group: true },
  });

  if (!debriefing) notFound();

  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
  const canEdit = isAdmin || debriefing.authorId === user.id;
  if (!canEdit) redirect('/debriefings');

  const groups = await getGroups(user.role, user.groupId);

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-title">Editar Debriefing</h1>
        <p className="text-body text-sm mt-1">{debriefing.number}</p>
      </div>
      <DebriefingEditor
        groups={groups}
        userId={user.id}
        userRole={user.role}
        defaultGroupId={user.groupId}
        initialData={debriefing}
      />
    </div>
  );
}
