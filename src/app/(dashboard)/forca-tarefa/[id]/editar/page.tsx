import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { RelatorioForcaTarefaEditor } from '@/components/forca-tarefa/RelatorioForcaTarefaEditor';

async function getGroups(role: string, groupId?: string) {
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
    return prisma.group.findMany({ where: { isActive: true } });
  }
  if (!groupId) return [];
  return prisma.group.findMany({ where: { id: groupId } });
}

async function getRelatorio(id: string, role: string, groupId?: string) {
  const relatorio = await prisma.relatorioForcaTarefa.findUnique({
    where: { id },
  });
  if (!relatorio) return null;

  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
  if (!isAdmin && relatorio.groupId !== groupId) return null;

  return relatorio;
}

export default async function EditarRelatorioForcaTarefaPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect('/login');

  const user = session.user as any;
  const { id } = await params;
  
  const [relatorio, groups] = await Promise.all([
    getRelatorio(id, user.role, user.groupId),
    getGroups(user.role, user.groupId),
  ]);

  if (!relatorio) notFound();

  // Permissões de edição
  const canEdit = user.role === 'SUPER_ADMIN' || 
                  user.role === 'ADMIN' || 
                  (relatorio.groupId === user.groupId && user.groupName !== 'NI/AIP/JI-PARANÁ') ||
                  relatorio.authorId === user.id;

  if (!canEdit) redirect('/forca-tarefa');

  // Mapear datas para strings compatíveis com <input type="date">
  const mappedRelatorio = {
    ...relatorio,
    date: new Date(relatorio.date).toISOString().split('T')[0],
    periodoInicio: new Date(relatorio.periodoInicio).toISOString().split('T')[0],
    periodoFim: new Date(relatorio.periodoFim).toISOString().split('T')[0],
  };

  return (
    <div className="animate-fade-in font-sans">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-title">Editar Relatório de Força-Tarefa</h1>
        <p className="text-body text-sm mt-1">
          Ajuste as informações operacionais semanais do relatório {relatorio.number}.
        </p>
      </div>
      <RelatorioForcaTarefaEditor
        groups={groups}
        userId={user.id}
        userName={user.name || ''}
        userRole={user.role}
        defaultGroupId={user.groupId}
        initialData={mappedRelatorio}
      />
    </div>
  );
}
