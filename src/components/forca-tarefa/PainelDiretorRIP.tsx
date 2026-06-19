'use client';

import { useState, useMemo, useEffect } from 'react';
import { 
  ShieldAlert, 
  AlertTriangle, 
  Users, 
  MapPin, 
  Activity, 
  FileText, 
  CheckCircle, 
  Eye, 
  Filter, 
  Calendar, 
  Search, 
  X,
  ChevronDown,
  Info
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { RelatorioForcaTarefaPreview } from './RelatorioForcaTarefaPreview';
import { IIP_FACTORS } from '@/lib/iip';

interface Props {
  relatorios: any[];
  sessionUser: {
    id: string;
    name: string;
    role: string;
  };
}

const MUNICIPIOS_RO = [
  'Porto Velho',
  'Ji-Paraná',
  'Ariquemes',
  'Cacoal',
  'Vilhena',
  'Guajará-Mirim',
  'Rolim de Moura',
  'Jaru',
  'Ouro Preto do Oeste',
  'Pimenta Bueno',
  'Espigão do Oeste',
  'Machadinho do Oeste',
  'Alta Floresta do Oeste',
  'Buritis',
  'Presidente Médici'
];

const FACCOES_LIST = ['PCC', 'CV', 'TDR', 'Comando Vermelho local', 'Grupo independente', 'Não identificado'];

export function PainelDiretorRIP({ relatorios: initialRelatorios, sessionUser }: Props) {
  const [relatorios, setRelatorios] = useState<any[]>(initialRelatorios);
  const [selectedRelatorio, setSelectedRelatorio] = useState<any | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Estados dos filtros
  const [search, setSearch] = useState('');
  const [filtroMunicipio, setFiltroMunicipio] = useState('');
  const [filtroFaccao, setFiltroFaccao] = useState('');
  const [filtroNivel, setFiltroNivel] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroAlerta, setFiltroAlerta] = useState('ALL'); // ALL, ATIVO, RESOLVIDO, SEM_ALERTA
  const [periodoInicio, setPeriodoInicio] = useState('');
  const [periodoFim, setPeriodoFim] = useState('');

  // Formulário do Diretor no Modal
  const [ripStatus, setRipStatus] = useState('PENDENTE');
  const [providencias, setProvidencias] = useState('');
  const [observacoesAip, setObservacoesAip] = useState('');
  const [alertaResolvido, setAlertaResolvido] = useState(false);

  // Carregar dados no modal ao selecionar
  const handleOpenAudit = (relatorio: any) => {
    setSelectedRelatorio(relatorio);
    setRipStatus(relatorio.ripStatus || 'PENDENTE');
    setProvidencias(relatorio.providencias || '');
    setObservacoesAip(relatorio.observacoesAip || '');
    setAlertaResolvido(relatorio.alertaResolvido || false);
    setIsAuditing(true);
  };

  const handleSaveAudit = async () => {
    if (!selectedRelatorio) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/forca-tarefa/${selectedRelatorio.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ripStatus,
          providencias,
          observacoesAip,
          alertaResolvido
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao salvar auditoria');
      }

      const updated = await res.json();
      
      // Atualizar lista local
      setRelatorios((prev) =>
        prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r))
      );
      
      setIsAuditing(false);
      setSelectedRelatorio(null);
    } catch (err: any) {
      alert(err.message || 'Erro ao atualizar dados do RIP.');
    } finally {
      setSaving(false);
    }
  };

  // Filtragem e ordenação decrescente do Ranking pelo Score IIP
  const filteredRelatorios = useMemo(() => {
    let result = [...relatorios];

    // Busca textual ampla
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.number.toLowerCase().includes(s) ||
          r.forcaTarefa.toLowerCase().includes(s) ||
          (r.author?.name || '').toLowerCase().includes(s) ||
          (r.content?.identificacao?.servidor || '').toLowerCase().includes(s)
      );
    }

    // Filtros estruturados
    if (filtroMunicipio) {
      result = result.filter((r) => r.municipio === filtroMunicipio);
    }
    if (filtroFaccao) {
      result = result.filter((r) => (r.faccoes || []).includes(filtroFaccao));
    }
    if (filtroNivel) {
      result = result.filter((r) => r.iipLevel === filtroNivel);
    }
    if (filtroStatus) {
      result = result.filter((r) => r.ripStatus === filtroStatus);
    }

    // Filtro de Alertas
    if (filtroAlerta === 'ATIVO') {
      result = result.filter((r) => r.alertaAtivo && !r.alertaResolvido);
    } else if (filtroAlerta === 'RESOLVIDO') {
      result = result.filter((r) => r.alertaAtivo && r.alertaResolvido);
    } else if (filtroAlerta === 'SEM_ALERTA') {
      result = result.filter((r) => !r.alertaAtivo);
    }

    // Filtro de datas de referência
    if (periodoInicio) {
      const start = new Date(periodoInicio);
      result = result.filter((r) => new Date(r.periodoInicio) >= start);
    }
    if (periodoFim) {
      const end = new Date(periodoFim);
      result = result.filter((r) => new Date(r.periodoFim) <= end);
    }

    // Ordenação decrescente do IIP Score (Ranking)
    return result.sort((a, b) => b.iipScore - a.iipScore);
  }, [relatorios, search, filtroMunicipio, filtroFaccao, filtroNivel, filtroStatus, filtroAlerta, periodoInicio, periodoFim]);

  // Alertas críticos ativos (alertaAtivo = true && alertaResolvido = false)
  const alertasCriticosAtivos = useMemo(() => {
    return relatorios.filter((r) => r.alertaAtivo && !r.alertaResolvido);
  }, [relatorios]);

  // Dashboards / Métricas acumuladas
  const stats = useMemo(() => {
    let totalOperacoes = 0;
    const faccoesSet = new Set<string>();
    let totalAlertas = 0;
    let totalCriticos = 0;

    relatorios.forEach((r) => {
      // Soma participações operacionais
      const po = r.content?.participacaoOperacional;
      if (po) {
        totalOperacoes += (po.inteligencia || 0) + (po.ostensiva || 0) + (po.mandados || 0) + (po.monitoramento || 0);
      }
      // Facções
      if (r.faccoes) {
        r.faccoes.forEach((f: string) => faccoesSet.add(f));
      }
      // Alertas
      if (r.alertaAtivo) {
        totalAlertas++;
      }
      if (r.iipLevel === 'CRITICAL') {
        totalCriticos++;
      }
    });

    return {
      totalOperacoes,
      faccoesMonitoradas: faccoesSet.size,
      totalAlertas,
      totalCriticos,
    };
  }, [relatorios]);

  return (
    <div className="space-y-6">
      
      {/* 1. SEÇÃO DE ALERTAS CRÍTICOS ATIVOS (Destaque Vermelho) */}
      {alertasCriticosAtivos.length > 0 && (
        <div className="card border-l-4 border-l-red-600 bg-red-50 dark:bg-red-950/20 p-5 shadow-sm animate-pulse-slow">
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400" />
            <h2 className="text-sm font-bold text-red-800 dark:text-red-300 uppercase tracking-wider">
              Alertas Críticos Ativos ({alertasCriticosAtivos.length})
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {alertasCriticosAtivos.slice(0, 4).map((alerta) => {
              const rftFactors = alerta.iipFactors || [];
              const criticalFactors = IIP_FACTORS.filter(f => f.critico && rftFactors.includes(f.id));
              
              return (
                <div key={alerta.id} className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-red-100 dark:border-red-900/50 flex flex-col justify-between shadow-xs">
                  <div>
                    <div className="flex justify-between items-start gap-2 mb-1">
                      <span className="text-xs font-mono font-bold text-title">{alerta.number}</span>
                      <span className="text-[10px] font-black text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded-md bg-red-50 dark:bg-red-500/10">
                        Score {alerta.iipScore}
                      </span>
                    </div>
                    <div className="text-[11px] text-body">
                      <strong>Servidor:</strong> {alerta.content?.identificacao?.servidor || alerta.author?.name} | <strong>FT:</strong> {alerta.forcaTarefa}
                    </div>
                    <div className="text-[11px] text-subtle mt-1.5">
                      <strong>Fatores Críticos:</strong> {criticalFactors.map(f => f.label).join(', ') || 'Score Alto (>=40)'}
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button 
                      onClick={() => handleOpenAudit(alerta)}
                      className="flex items-center gap-1.5 text-[10px] font-bold text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Eye className="w-3 h-3" /> Tratar Ocorrência
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. CARD DE MÉTRICAS CONSOLIDADAS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total de Relatórios', val: relatorios.length, icon: FileText, color: 'text-blue-500 bg-blue-500/10' },
          { label: 'Ações Operacionais', val: stats.totalOperacoes, icon: Activity, color: 'text-green-500 bg-green-500/10' },
          { label: 'Grupos/Facções no Radar', val: stats.faccoesMonitoradas, icon: Users, color: 'text-purple-500 bg-purple-500/10' },
          { label: 'Fatores de Risco Máximo', val: stats.totalCriticos, icon: AlertTriangle, color: 'text-amber-500 bg-amber-500/10' },
        ].map((c) => (
          <div key={c.label} className="card p-4 flex items-center justify-between shadow-xs">
            <div>
              <span className="block text-[10px] font-bold text-subtle uppercase tracking-wider">{c.label}</span>
              <span className="text-xl font-black text-title mt-1 block">{c.val}</span>
            </div>
            <div className={`p-3 rounded-xl ${c.color}`}>
              <c.icon className="w-5 h-5" />
            </div>
          </div>
        ))}
      </div>

      {/* 3. FILTROS E PESQUISA DO RANKING */}
      <div className="card p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-title uppercase tracking-wider">
            <Filter className="w-4 h-4 text-sigma-600" />
            Filtros do Painel Gerencial
          </div>
          <button 
            onClick={() => {
              setSearch(''); setFiltroMunicipio(''); setFiltroFaccao(''); setFiltroNivel(''); setFiltroStatus('');
              setFiltroAlerta('ALL'); setPeriodoInicio(''); setPeriodoFim('');
            }}
            className="text-[10px] font-bold text-subtle hover:text-title uppercase tracking-wider"
          >
            Limpar Filtros
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="w-4 h-4 text-subtle absolute left-3 top-2.5" />
            <input 
              type="text" 
              placeholder="Buscar RFT, Força-Tarefa..." 
              value={search} 
              onChange={(e) => setSearch(e.target.value)}
              className="w-full input-base pl-9 pr-3 py-2 text-xs" 
            />
          </div>

          <div>
            <select 
              value={filtroMunicipio} 
              onChange={(e) => setFiltroMunicipio(e.target.value)}
              className="w-full input-base px-3 py-2 text-xs"
            >
              <option value="">Todos os Municípios</option>
              {MUNICIPIOS_RO.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div>
            <select 
              value={filtroFaccao} 
              onChange={(e) => setFiltroFaccao(e.target.value)}
              className="w-full input-base px-3 py-2 text-xs"
            >
              <option value="">Todas as Facções</option>
              {FACCOES_LIST.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          <div>
            <select 
              value={filtroNivel} 
              onChange={(e) => setFiltroNivel(e.target.value)}
              className="w-full input-base px-3 py-2 text-xs"
            >
              <option value="">Todos os Níveis de Impacto</option>
              <option value="LOW">Baixo Impacto</option>
              <option value="MEDIUM">Médio Impacto</option>
              <option value="HIGH">Alto Impacto</option>
              <option value="CRITICAL">Impacto Crítico</option>
            </select>
          </div>

          <div>
            <select 
              value={filtroStatus} 
              onChange={(e) => setFiltroStatus(e.target.value)}
              className="w-full input-base px-3 py-2 text-xs"
            >
              <option value="">Todos os Status de Análise</option>
              <option value="PENDENTE">Pendente</option>
              <option value="EM_ANALISE">Em Análise</option>
              <option value="ENCAMINHADO">Encaminhado</option>
              <option value="CONCLUIDO">Concluído</option>
            </select>
          </div>

          <div>
            <select 
              value={filtroAlerta} 
              onChange={(e) => setFiltroAlerta(e.target.value)}
              className="w-full input-base px-3 py-2 text-xs"
            >
              <option value="ALL">Qualquer ocorrência (com/sem alertas)</option>
              <option value="ATIVO">Apenas Alertas Críticos Ativos</option>
              <option value="RESOLVIDO">Apenas Alertas Críticos Resolvidos</option>
              <option value="SEM_ALERTA">Apenas Sem Alertas</option>
            </select>
          </div>

          <div className="flex items-center gap-2 sm:col-span-2">
            <div className="flex-1 flex items-center gap-1.5 border border-gray-200 dark:border-gray-800 rounded-xl px-2.5 py-1 text-xs">
              <Calendar className="w-3.5 h-3.5 text-subtle" />
              <input type="date" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} className="bg-transparent text-[11px] w-full border-0 p-0 focus:ring-0 text-body" />
            </div>
            <span className="text-subtle text-[10px] uppercase font-bold">Até</span>
            <div className="flex-1 flex items-center gap-1.5 border border-gray-200 dark:border-gray-800 rounded-xl px-2.5 py-1 text-xs">
              <Calendar className="w-3.5 h-3.5 text-subtle" />
              <input type="date" value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)} className="bg-transparent text-[11px] w-full border-0 p-0 focus:ring-0 text-body" />
            </div>
          </div>
        </div>
      </div>

      {/* 4. TABELA DO RANKING DE IMPACTO PRISIONAL (RIP) */}
      <div className="card shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <h2 className="text-xs font-bold text-title uppercase tracking-wider flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-sigma-600" />
            Ranking de Impacto Prisional (RIP)
          </h2>
          <span className="text-[10px] text-subtle font-mono">{filteredRelatorios.length} itens correspondentes</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 dark:bg-gray-800/10 border-b border-gray-100 dark:border-gray-800 text-[10px] font-bold text-subtle uppercase tracking-wider">
                <th className="py-3 px-4 text-center">Posição</th>
                <th className="py-3 px-4">Relatório</th>
                <th className="py-3 px-4">Força-Tarefa / Servidor</th>
                <th className="py-3 px-4">Atuação / Facções</th>
                <th className="py-3 px-4 text-center">Pontuação IIP</th>
                <th className="py-3 px-4">Nível</th>
                <th className="py-3 px-4">Status RIP</th>
                <th className="py-3 px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredRelatorios.map((r, idx) => {
                const iipLevelClass = 
                  r.iipLevel === 'CRITICAL' ? 'bg-red-500/10 text-red-600 dark:text-red-400 font-bold border-red-500/20' :
                  r.iipLevel === 'HIGH' ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 font-bold border-orange-500/20' :
                  r.iipLevel === 'MEDIUM' ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 font-bold border-yellow-500/20' :
                  'bg-green-500/10 text-green-600 dark:text-green-400 font-bold border-green-500/20';

                const statusColor = 
                  r.ripStatus === 'CONCLUIDO' ? 'bg-green-500/10 text-green-600 dark:text-green-400' :
                  r.ripStatus === 'ENCAMINHADO' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' :
                  r.ripStatus === 'EM_ANALISE' ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 animate-pulse' :
                  'bg-gray-100 dark:bg-gray-800 text-subtle border-gray-200 dark:border-gray-700';

                return (
                  <tr key={r.id} className="border-b border-gray-50 dark:border-gray-800/40 hover:bg-gray-50/30 dark:hover:bg-gray-800/10 transition-colors text-xs text-body">
                    <td className="py-3.5 px-4 text-center font-bold text-subtle">
                      {idx + 1}º
                    </td>
                    <td className="py-3.5 px-4">
                      <div>
                        <span className="font-mono font-bold text-title">{r.number}</span>
                        <span className="block text-[10px] text-subtle mt-0.5">
                          Ref: {formatDate(new Date(r.periodoInicio))} a {formatDate(new Date(r.periodoFim))}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div>
                        <span className="font-semibold text-title">{r.forcaTarefa}</span>
                        <span className="block text-[10px] text-subtle">{r.content?.identificacao?.servidor || r.author?.name}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div>
                        <span className="flex items-center gap-1 font-semibold text-title">
                          <MapPin className="w-3.5 h-3.5 text-sigma-500 shrink-0" />
                          {r.municipio}
                        </span>
                        <span className="block text-[10px] text-subtle mt-0.5">
                          {r.faccoes && r.faccoes.length > 0 ? r.faccoes.join(', ') : 'Sem facções'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex flex-col items-center">
                        <span className="text-sm font-black text-title">{r.iipScore}</span>
                        {r.alertaAtivo && !r.alertaResolvido && (
                          <span className="inline-flex items-center px-1 rounded bg-red-500/10 text-red-500 text-[8px] font-bold mt-0.5 tracking-wider uppercase">
                            Alerta
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] border ${iipLevelClass}`}>
                        {r.iipLevel === 'CRITICAL' ? 'CRÍTICO' :
                         r.iipLevel === 'HIGH' ? 'ALTO' :
                         r.iipLevel === 'MEDIUM' ? 'MÉDIO' : 'BAIXO'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold border ${statusColor}`}>
                        {r.ripStatus === 'CONCLUIDO' ? 'Concluído' :
                         r.ripStatus === 'ENCAMINHADO' ? 'Encaminhado' :
                         r.ripStatus === 'EM_ANALISE' ? 'Em Análise' : 'Pendente'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button 
                        onClick={() => handleOpenAudit(r)}
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-sigma-600 hover:text-sigma-700 bg-sigma-500/10 hover:bg-sigma-500/25 px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" /> Analisar
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredRelatorios.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-subtle text-xs italic">
                    Nenhum relatório de força-tarefa encontrado com os critérios de filtro selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. MODAL DE AUDITORIA, AÇÃO E ANÁLISE DO DIRETOR */}
      {isAuditing && selectedRelatorio && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-gray-100 dark:border-gray-800">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/40 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-title flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-500" />
                  Auditoria & Tratamento Gerencial - {selectedRelatorio.number}
                </h3>
                <p className="text-[11px] text-subtle mt-0.5">Analise o RFT, classifique o status institucional e adote as providências de inteligência.</p>
              </div>
              <button 
                onClick={() => { setIsAuditing(false); setSelectedRelatorio(null); }}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-subtle hover:text-body transition-colors"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Modal Body - Dividido em 2 colunas: Esquerda (Preview do RFT), Direita (Painel do Diretor) */}
            <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-5 p-6 gap-6 min-h-0">
              {/* Coluna da Esquerda: Preview RFT A4 (3/5 de largura) */}
              <div className="lg:col-span-3 overflow-y-auto max-h-full border border-gray-100 dark:border-gray-800 rounded-xl pr-2 scrollbar-thin">
                <RelatorioForcaTarefaPreview form={selectedRelatorio} />
              </div>

              {/* Coluna da Direita: Ações Gerenciais do Diretor (2/5 de largura) */}
              <div className="lg:col-span-2 space-y-5 flex flex-col justify-between max-h-full overflow-y-auto">
                <div className="space-y-4">
                  {/* Painel do IIP Atual no Modal */}
                  <div className="p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/10 space-y-3">
                    <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-2">
                      <span className="text-xs font-bold text-title uppercase">Score Automático do RFT</span>
                      <span className="text-sm font-black text-sigma-600">{selectedRelatorio.iipScore} pts</span>
                    </div>
                    <div className="text-xs text-body space-y-1.5">
                      <div><strong>Nível de Risco IIP:</strong> <span className="font-bold text-title">{selectedRelatorio.iipLevel}</span></div>
                      <div><strong>Município:</strong> <span className="font-semibold text-title">{selectedRelatorio.municipio}</span></div>
                      <div><strong>Operador Emissor:</strong> {selectedRelatorio.content?.identificacao?.servidor || selectedRelatorio.author?.name}</div>
                    </div>
                  </div>

                  {/* Formulário de Providências */}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-bold text-subtle uppercase tracking-wider mb-1.5">
                        Status da Análise RIP *
                      </label>
                      <select 
                        value={ripStatus} 
                        onChange={(e) => setRipStatus(e.target.value)}
                        className="w-full input-base px-3 py-2 text-xs"
                      >
                        <option value="PENDENTE">Pendente (Recebido)</option>
                        <option value="EM_ANALISE">Em Análise Técnica</option>
                        <option value="ENCAMINHADO">Encaminhado à Direção</option>
                        <option value="CONCLUIDO">Concluído / Arquivado</option>
                      </select>
                    </div>

                    {/* Checkbox para dar baixa em Alerta */}
                    {selectedRelatorio.alertaAtivo && (
                      <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer select-none transition-all ${
                        alertaResolvido 
                          ? 'bg-green-50/40 border-green-500/20 text-green-800 dark:text-green-300' 
                          : 'bg-red-50/40 border-red-500/20 text-red-800 dark:text-red-300'
                      }`}>
                        <input
                          type="checkbox"
                          checked={alertaResolvido}
                          onChange={(e) => setAlertaResolvido(e.target.checked)}
                          className="rounded text-green-600 focus:ring-green-500 mt-0.5"
                        />
                        <div>
                          <span className="block text-xs font-bold">Marcar Alerta como Resolvido / Baixa</span>
                          <span className="block text-[10px] text-subtle mt-0.5">
                            {alertaResolvido 
                              ? 'O alerta crítico correspondente foi resolvido e arquivado.' 
                              : 'O alerta permanece ativo na fila de urgência do painel principal.'}
                          </span>
                        </div>
                      </label>
                    )}

                    <div>
                      <label className="block text-[11px] font-bold text-subtle uppercase tracking-wider mb-1.5">
                        Providências Adotadas *
                      </label>
                      <textarea
                        rows={4}
                        value={providencias}
                        onChange={(e) => setProvidencias(e.target.value)}
                        placeholder="Descreva as providências operacionais tomadas (ex: produção de relatório técnico, acionamento do setor de buscas, difusão à agência coirmã)..."
                        className="w-full input-base p-3 text-xs"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-subtle uppercase tracking-wider mb-1.5">
                        Observações Internas (AIP)
                      </label>
                      <textarea
                        rows={2}
                        value={observacoesAip}
                        onChange={(e) => setObservacoesAip(e.target.value)}
                        placeholder="Histórico ou anotações de análise complementar de inteligência (uso restrito interno)..."
                        className="w-full input-base p-3 text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Modal Footer Buttons */}
                <div className="pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-2">
                  <button 
                    onClick={() => { setIsAuditing(false); setSelectedRelatorio(null); }}
                    className="text-xs font-bold text-body border border-gray-200 dark:border-gray-800 px-4 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleSaveAudit}
                    disabled={saving || !providencias}
                    className="flex items-center gap-2 text-xs font-bold text-white bg-sigma-600 hover:bg-sigma-700 px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50 shadow-sm"
                  >
                    {saving && <span className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent" />}
                    Salvar Providências
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
