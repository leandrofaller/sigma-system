import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { RelatorioForcaTarefaEditor } from '@/components/forca-tarefa/RelatorioForcaTarefaEditor';

async function getGroups(role: string, groupId?: string) {
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
    return prisma.group.findMany({ where: { isActive: true } });
  }
  if (!groupId) return [];
  return prisma.group.findMany({ where: { id: groupId } });
}

export default async function NovoRelatorioForcaTarefaPage() {
  const session = await auth();
  const user = session!.user as any;
  const groups = await getGroups(user.role, user.groupId);

  return (
    <div className="animate-fade-in font-sans">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-title">Novo Relatório de Força-Tarefa</h1>
        <p className="text-body text-sm mt-1">
          Registre as atividades operacionais semanais integrando forças-tarefa.
        </p>
      </div>
      <RelatorioForcaTarefaEditor
        groups={groups}
        userId={user.id}
        userName={user.name || ''}
        userRole={user.role}
        defaultGroupId={user.groupId}
      />
    </div>
  );
}
