import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import { RelatorioForcaTarefaPreview } from '@/components/forca-tarefa/RelatorioForcaTarefaPreview';
import { ArrowLeft, Pencil } from 'lucide-react';

async function getRelatorio(id: string, role: string, groupId?: string) {
  const relatorio = await prisma.relatorioForcaTarefa.findUnique({
    where: { id },
    include: { author: true, group: true },
  });
  if (!relatorio) return null;

  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
  if (!isAdmin && relatorio.groupId !== groupId) return null;

  return relatorio;
}

export default async function RelatorioForcaTarefaViewPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect('/login');

  const user = session.user as any;
  const { id } = await params;
  const relatorio = await getRelatorio(id, user.role, user.groupId);

  if (!relatorio) notFound();

  const content = (relatorio.content as any) ?? {};

  const form = {
    number: relatorio.number,
    date: relatorio.date ? new Date(relatorio.date).toISOString().split('T')[0] : '',
    periodoInicio: relatorio.periodoInicio ? new Date(relatorio.periodoInicio).toISOString().split('T')[0] : '',
    periodoFim: relatorio.periodoFim ? new Date(relatorio.periodoFim).toISOString().split('T')[0] : '',
    forcaTarefa: relatorio.forcaTarefa,
    status: relatorio.status,
    author: relatorio.author,
    group: relatorio.group,
    municipio: relatorio.municipio,
    faccoes: relatorio.faccoes,
    iipScore: relatorio.iipScore,
    iipLevel: relatorio.iipLevel,
    ripStatus: relatorio.ripStatus,
    iipFactors: relatorio.iipFactors,
    alertaAtivo: relatorio.alertaAtivo,
    alertaResolvido: relatorio.alertaResolvido,
    providencias: relatorio.providencias,
    observacoesAip: relatorio.observacoesAip,
    content: {
      identificacao: {
        servidor: content.identificacao?.servidor || relatorio.author?.name || '',
        matricula: content.identificacao?.matricula || '',
        unidadeOrigem: content.identificacao?.unidadeOrigem || '',
      },
      resumoExecutivo: content.resumoExecutivo || '',
      participacaoOperacional: {
        inteligencia: content.participacaoOperacional?.inteligencia ?? 0,
        ostensiva: content.participacaoOperacional?.ostensiva ?? 0,
        mandados: content.participacaoOperacional?.mandados ?? 0,
        monitoramento: content.participacaoOperacional?.monitoramento ?? 0,
        reunioes: content.participacaoOperacional?.reunioes ?? 0,
        outras: content.participacaoOperacional?.outras ?? 0,
      },
      alvosEstrategicos: {
        categorias: content.alvosEstrategicos?.categorias || [],
        descricao: content.alvosEstrategicos?.descricao || '',
      },
      faccoesRelacionadas: {
        categorias: content.faccoesRelacionadas?.categorias || [],
        observacoes: content.faccoesRelacionadas?.observacoes || '',
      },
      impactosSistemaPrisional: content.impactosSistemaPrisional || '',
      produtosInteligencia: {
        relatorios: content.produtosInteligencia?.relatorios ?? 0,
        informes: content.produtosInteligencia?.informes ?? 0,
        alertas: content.produtosInteligencia?.alertas ?? 0,
        analises: content.produtosInteligencia?.analises ?? 0,
        outros: content.produtosInteligencia?.outros ?? 0,
      },
      resultadosRelevantes: {
        categorias: content.resultadosRelevantes?.categorias || [],
        descricao: content.resultadosRelevantes?.descricao || '',
      },
      avaliacaoRisco: {
        classificacao: content.avaliacaoRisco?.classificacao || 'BAIXO',
        justificativa: content.avaliacaoRisco?.justificativa || '',
      },
      demandasAip: content.demandasAip || '',
      observacoesDiretor: content.observacoesDiretor || '',
    },
  };

  const canEdit = user.role === 'SUPER_ADMIN' || 
                  user.role === 'ADMIN' || 
                  (relatorio.groupId === user.groupId && user.groupName !== 'NI/AIP/JI-PARANÁ') ||
                  relatorio.authorId === user.id;

  return (
    <div className="animate-fade-in space-y-4 font-sans">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/forca-tarefa"
            className="p-2 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-subtle">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-title">{relatorio.number}</h1>
            <p className="text-sm text-subtle mt-0.5">{relatorio.forcaTarefa}</p>
          </div>
        </div>
        {canEdit && (
          <Link href={`/forca-tarefa/${relatorio.id}/editar`}
            className="flex items-center gap-2 text-sm font-semibold bg-sigma-600 hover:bg-sigma-700 text-white px-4 py-2.5 rounded-xl transition-colors shadow-sm">
            <Pencil className="w-4 h-4" /> Editar
          </Link>
        )}
      </div>

      <RelatorioForcaTarefaPreview form={form as any} />
    </div>
  );
}
