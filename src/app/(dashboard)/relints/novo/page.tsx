import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { RelintEditor } from '@/components/relint/RelintEditor';

async function getTemplates() {
  return prisma.relintTemplate.findMany({ where: { isActive: true } });
}

async function getGroups(role: string, groupId?: string) {
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
    return prisma.group.findMany({ where: { isActive: true } });
  }
  if (!groupId) return [];
  return prisma.group.findMany({ where: { id: groupId } });
}

export default async function NovoRelintPage() {
  const session = await auth();
  const user = session!.user as any;
  const [templates, groups] = await Promise.all([
    getTemplates(),
    getGroups(user.role, user.groupId),
  ]);

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-title">Novo Relatório de Inteligência</h1>
        <p className="text-body text-sm mt-1">
          Preencha os campos e visualize o documento em tempo real
        </p>
      </div>
      <RelintEditor
        templates={templates}
        groups={groups}
        userId={user.id}
        userRole={user.role}
        defaultGroupId={user.groupId}
      />
    </div>
  );
}
