import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import { DebriefingPreview } from '@/components/debriefing/DebriefingPreview';
import { ArrowLeft, Pencil } from 'lucide-react';

async function getDebriefing(id: string, role: string, groupId?: string) {
  const debriefing = await prisma.debriefing.findUnique({
    where: { id },
    include: { author: true, group: true },
  });
  if (!debriefing) return null;

  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
  if (!isAdmin && debriefing.groupId !== groupId) return null;

  return debriefing;
}

export default async function DebriefingViewPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect('/login');

  const user = session.user as any;
  const { id } = await params;
  const debriefing = await getDebriefing(id, user.role, user.groupId);

  if (!debriefing) notFound();

  const content = (debriefing.content as any) ?? {};

  const form = {
    number: debriefing.number,
    date: new Date(debriefing.date).toISOString().split('T')[0],
    missionDate: debriefing.missionDate
      ? new Date(debriefing.missionDate).toISOString().split('T')[0]
      : '',
    missionCode: debriefing.missionCode ?? '',
    operationType: debriefing.operationType ?? '',
    operatives: debriefing.operatives ?? '',
    handler: debriefing.handler ?? '',
    location: debriefing.location ?? '',
    subject: debriefing.subject,
    diffusion: debriefing.diffusion,
    classification: debriefing.classification,
    content: {
      body: content.body ?? '',
      agentAssessment: content.agentAssessment ?? '',
      conclusions: content.conclusions ?? '',
      recommendations: content.recommendations ?? '',
    },
  };

  const canEdit = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || debriefing.authorId === user.id;

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/debriefings"
            className="p-2 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-subtle">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-title">{debriefing.number}</h1>
            <p className="text-sm text-subtle mt-0.5">{debriefing.subject}</p>
          </div>
        </div>
        {canEdit && (
          <Link href={`/debriefings/${debriefing.id}/editar`}
            className="flex items-center gap-2 text-sm font-medium bg-sigma-600 hover:bg-sigma-700 text-white px-4 py-2 rounded-xl transition-colors shadow-sm">
            <Pencil className="w-4 h-4" /> Editar
          </Link>
        )}
      </div>

      <DebriefingPreview form={form} />
    </div>
  );
}
