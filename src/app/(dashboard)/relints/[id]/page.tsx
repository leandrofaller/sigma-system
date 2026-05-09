import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import { RelintPreview } from '@/components/relint/RelintPreview';
import { ArrowLeft, Pencil } from 'lucide-react';
import { formatDate } from '@/lib/utils';

async function getRelint(id: string, userId: string, role: string, groupId?: string) {
  const relint = await prisma.relint.findUnique({
    where: { id },
    include: { author: true, group: true },
  });
  if (!relint) return null;

  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
  if (!isAdmin && relint.groupId !== groupId) return null;

  return relint;
}

export default async function RelintViewPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) redirect('/login');

  const user = session.user as any;
  const relint = await getRelint(params.id, user.id, user.role, user.groupId);

  if (!relint) notFound();

  const content = (relint.content as any) ?? {};

  const form = {
    number: relint.number,
    date: new Date(relint.date).toISOString().split('T')[0],
    subject: relint.subject,
    diffusion: relint.diffusion,
    classification: relint.classification,
    content: {
      introduction: content.introduction ?? '',
      body: content.body ?? '',
      conclusion: content.conclusion ?? '',
      recommendations: content.recommendations ?? '',
      diffusionPrev: content.diffusionPrev ?? '***',
      reference: content.reference ?? '***',
      annexes: content.annexes ?? '***',
    },
  };

  const canEdit = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || relint.authorId === user.id;

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/relints"
            className="p-2 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-subtle">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-title">{relint.number}</h1>
            <p className="text-sm text-subtle mt-0.5">{relint.subject}</p>
          </div>
        </div>
        {canEdit && (
          <Link href={`/relints/${relint.id}/editar`}
            className="flex items-center gap-2 text-sm font-medium bg-sigma-600 hover:bg-sigma-700 text-white px-4 py-2 rounded-xl transition-colors shadow-sm">
            <Pencil className="w-4 h-4" /> Editar
          </Link>
        )}
      </div>

      <RelintPreview form={form} />
    </div>
  );
}
