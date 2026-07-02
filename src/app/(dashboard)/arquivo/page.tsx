import { Suspense } from 'react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ArquivoList } from '@/components/arquivo/ArquivoList';

async function getArquivoFiles(role: string, groupId?: string) {
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
  return prisma.arquivoFile.findMany({
    where: isAdmin ? {} : { groupId: groupId ?? null },
    orderBy: { createdAt: 'desc' },
    include: { uploadedBy: true, group: true, folder: true },
  });
}

async function getGroups() {
  return prisma.group.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
}

async function getArquivoFolders(role: string, groupId?: string) {
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
  return prisma.arquivoFolder.findMany({
    where: isAdmin ? {} : { groupId: groupId ?? null },
    orderBy: { name: 'asc' },
  });
}

export default async function ArquivoPage() {
  const session = await auth();
  const user = session!.user as any;
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';

  const [files, groups, folders] = await Promise.all([
    getArquivoFiles(user.role, user.groupId),
    isAdmin ? getGroups() : Promise.resolve([]),
    getArquivoFolders(user.role, user.groupId),
  ]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-title">Arquivo</h1>
        <p className="text-body text-sm mt-1">
          Documentos e arquivos do grupo — {files.length} arquivo{files.length !== 1 ? 's' : ''}
        </p>
      </div>
      <Suspense>
        <ArquivoList
          files={files as any}
          groups={groups}
          folders={folders}
          userId={user.id}
          role={user.role}
          userGroupId={user.groupId ?? null}
        />
      </Suspense>
    </div>
  );
}
