import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { RelintEditor } from '@/components/relint/RelintEditor';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

async function getData(id: string, userId: string, role: string, groupId?: string) {
  const [relint, templates, groups] = await Promise.all([
    prisma.relint.findUnique({ where: { id }, include: { author: true, group: true } }),
    prisma.relintTemplate.findMany({ where: { isActive: true } }),
    role === 'SUPER_ADMIN' || role === 'ADMIN'
      ? prisma.group.findMany({ where: { isActive: true } })
      : groupId
        ? prisma.group.findMany({ where: { id: groupId } })
        : Promise.resolve([]),
  ]);
  return { relint, templates, groups };
}

export default async function EditarRelintPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect('/login');

  const user = session.user as any;
  const { id } = await params;
  const { relint, templates, groups } = await getData(id, user.id, user.role, user.groupId);

  if (!relint) notFound();

  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
  if (!isAdmin && relint.authorId !== user.id) redirect('/relints');

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/relints/${relint.id}`}
          className="p-2 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-subtle">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-title">Editar RELINT</h1>
          <p className="text-body text-sm mt-1">{relint.number}</p>
        </div>
      </div>
      <RelintEditor
        templates={templates}
        groups={groups}
        userId={user.id}
        userRole={user.role}
        defaultGroupId={user.groupId}
        initialData={{
          id: relint.id,
          number: relint.number,
          date: relint.date,
          subject: relint.subject,
          diffusion: relint.diffusion,
          classification: relint.classification,
          groupId: relint.groupId,
          status: relint.status,
          content: relint.content,
        }}
      />
    </div>
  );
}
