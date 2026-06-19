import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ForcaTarefaDashboardWrapper } from '@/components/forca-tarefa/ForcaTarefaDashboardWrapper';

async function getRelatorios(role: string, groupId?: string) {
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
  return prisma.relatorioForcaTarefa.findMany({
    where: isAdmin ? {} : { groupId: groupId ?? '' },
    orderBy: { createdAt: 'desc' },
    include: { author: true, group: true },
  });
}

export default async function RelatoriosForcaTarefaPage() {
  const session = await auth();
  const user = session!.user as any;
  const relatorios = await getRelatorios(user.role, user.groupId);
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-title">
            {isAdmin ? 'Painel de Impacto Prisional (RIP/IIP)' : 'Relatórios Semanais de Força-Tarefa'}
          </h1>
          <p className="text-body text-sm mt-1">
            {isAdmin 
              ? 'Métricas estratégicas e classificação automática dos relatórios semanais de forças-tarefa.' 
              : 'Acompanhamento de servidores em forças-tarefa, FICCO, GAECO e operações integradas.'}
          </p>
        </div>
      </div>
      
      <ForcaTarefaDashboardWrapper
        relatorios={relatorios}
        user={{
          id: user.id,
          name: user.name,
          role: user.role,
          groupId: user.groupId,
          groupName: user.groupName,
        }}
      />
    </div>
  );
}
