'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShieldAlert, Loader2, Play, Square, RefreshCw, Check, Trash2, Search,
  AlertTriangle, Filter, ClipboardList, CheckCircle, Image as ImageIcon,
  ChevronLeft, ChevronRight, Ban
} from 'lucide-react';

interface LogRecord {
  id: string;
  photoPath: string;
  originalPath: string;
  status: 'NO_FACE' | 'LOW_QUALITY' | 'DUPLICATE' | 'ERROR';
  reason: string | null;
  score: number | null;
  hashPerceptual: string | null;
  duplicateOfId: string | null;
  analyzedAt: string;
  apenado: {
    name: string;
    matricula: string | null;
    unidade: string | null;
    faccao: string | null;
    photoPath: string | null;
  } | null;
}

interface Pagination {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

interface JobProgress {
  current: number;
  total: number;
  clean: number;
  noFace: number;
  lowQuality: number;
  duplicate: number;
  errors: number;
  startTime: number;
}

interface JobState {
  isRunning: boolean;
  progress: JobProgress;
  error: string;
}

export function SanitizationPanel() {
  const [logs, setLogs] = useState<LogRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeStatus, setActiveStatus] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [jobState, setJobState] = useState<JobState | null>(null);
  const [startingJob, setStartingJob] = useState(false);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Busca o status atual do job de sanitização
  const fetchJobStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/sanitizacao?jobStatus=true');
      if (!res.ok) return;
      const data: JobState = await res.json();
      setJobState(data);
      if (!data.isRunning && pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
        // Se o job terminou, atualiza a lista
        fetchLogs();
      }
    } catch {}
  }, []);

  // Inicia polling se o job estiver rodando
  useEffect(() => {
    if (jobState?.isRunning) {
      if (!pollingRef.current) {
        pollingRef.current = setInterval(fetchJobStatus, 2000);
      }
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [jobState?.isRunning, fetchJobStatus]);

  // Carrega a listagem de quarentena
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const statusParam = activeStatus === 'ALL' ? 'ALL' : activeStatus;
      const res = await fetch(
        `/api/admin/sanitizacao?page=${currentPage}&status=${statusParam}&search=${encodeURIComponent(searchTerm)}`
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLogs(data.items);
      setPagination(data.pagination);
    } catch {
      alert('Erro ao carregar registros de sanitização.');
    } finally {
      setLoading(false);
    }
  }, [currentPage, activeStatus, searchTerm]);

  // Executa a busca inicial e quando filtros mudam
  useEffect(() => {
    fetchLogs();
    fetchJobStatus();
  }, [currentPage, activeStatus, fetchLogs, fetchJobStatus]);

  // Handler de Busca Textual
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchLogs();
  };

  // Iniciar/Parar Processamento em Lote
  const handleToggleJob = async () => {
    setStartingJob(true);
    try {
      const action = jobState?.isRunning ? 'stop' : 'start';
      const res = await fetch('/api/admin/sanitizacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro operacional');

      // Atualiza status local
      await fetchJobStatus();
      if (action === 'start') {
        // inicia polling imediatamente
        fetchJobStatus();
      }
    } catch (err: any) {
      alert(err.message || 'Erro ao alterar estado do job.');
    } finally {
      setStartingJob(false);
    }
  };

  // Decisão manual de auditoria: Aprovar ou Rejeitar imagem
  const handleAuditorDecision = async (id: string, action: 'approve' | 'reject') => {
    if (action === 'reject') {
      const record = logs.find(item => item.id === id);
      const isMainPhoto = record && record.originalPath && record.apenado && record.originalPath === record.apenado.photoPath;
      const confirmMsg = isMainPhoto
        ? '⚠️ ALERTA CRÍTICO: Esta foto está ativa na FICHA PRINCIPAL do apenado!\nSe você rejeitar e apagar, a ficha dele ficará sem foto.\n\nDeseja mesmo prosseguir e apagar permanentemente?'
        : 'Tem certeza de que deseja descartar permanentemente esta imagem? O arquivo físico será removido do disco.';
      
      if (!confirm(confirmMsg)) {
        return;
      }
    }
    setProcessingId(id);
    try {
      const res = await fetch(`/api/admin/sanitizacao/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Erro na requisição');
      }
      // Remove o log localmente
      setLogs((prev) => prev.filter((item) => item.id !== id));
      if (pagination) {
        setPagination({ ...pagination, total: pagination.total - 1 });
      }
    } catch (err: any) {
      alert(err.message || 'Erro ao aplicar ação de auditoria.');
    } finally {
      setProcessingId(null);
    }
  };

  // Cálculo da porcentagem do progresso
  const getProgressPercentage = () => {
    if (!jobState?.progress || jobState.progress.total === 0) return 0;
    return Math.round((jobState.progress.current / jobState.progress.total) * 100);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-title">Higienização & Quarentena de Imagens</h2>
          <p className="text-sm text-subtle mt-0.5">
            Mantenha o banco de imagens livre de fotos sem rosto, duplicadas ou de baixa qualidade de forma controlada.
          </p>
        </div>
      </div>

      {/* Control Card (Job de Processamento em Lote) */}
      <div className="card p-6">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${jobState?.isRunning ? 'bg-amber-500/10 text-amber-500 animate-pulse' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-title">Análise Completa da Base de Dados</p>
              <p className="text-xs text-subtle">Processamento assíncrono em lote de todas as fotos de apenados.</p>
            </div>
          </div>
          <button
            onClick={handleToggleJob}
            disabled={startingJob}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold transition-all shadow-sm active:scale-95 ${
              jobState?.isRunning
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-sigma-600 hover:bg-sigma-700 text-white'
            } disabled:opacity-50`}
          >
            {startingJob ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : jobState?.isRunning ? (
              <>
                <Square className="w-4 h-4" /> Pausar Análise
              </>
            ) : (
              <>
                <Play className="w-4 h-4" /> Iniciar Higienização
              </>
            )}
          </button>
        </div>

        {/* Job running stats / progress */}
        {jobState && (jobState.isRunning || jobState.progress.current > 0) && (
          <div className="mt-5 space-y-4">
            <div className="flex justify-between text-sm flex-wrap gap-2">
              <span className="font-medium text-title">
                {jobState.isRunning ? 'Análise em andamento...' : 'Última análise concluída'}
              </span>
              <span className="text-subtle font-mono">
                {jobState.progress.current} / {jobState.progress.total} fotos processadas ({getProgressPercentage()}%)
              </span>
            </div>

            {/* Progress Bar */}
            <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${jobState.isRunning ? 'bg-amber-500' : 'bg-green-500'}`}
                style={{ width: `${getProgressPercentage()}%` }}
              />
            </div>

            {/* Metrics cards grid */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2">
              <div className="p-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl text-center border border-gray-100 dark:border-gray-800">
                <p className="text-lg font-bold text-green-600 dark:text-green-400">{jobState.progress.clean}</p>
                <p className="text-[10px] font-medium text-subtle uppercase mt-0.5">Válidas (Clean)</p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl text-center border border-gray-100 dark:border-gray-800">
                <p className="text-lg font-bold text-red-500">{jobState.progress.noFace}</p>
                <p className="text-[10px] font-medium text-subtle uppercase mt-0.5">Sem Rosto</p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl text-center border border-gray-100 dark:border-gray-800">
                <p className="text-lg font-bold text-yellow-500">{jobState.progress.lowQuality}</p>
                <p className="text-[10px] font-medium text-subtle uppercase mt-0.5">Baixa Qualidade</p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl text-center border border-gray-100 dark:border-gray-800">
                <p className="text-lg font-bold text-blue-500">{jobState.progress.duplicate}</p>
                <p className="text-[10px] font-medium text-subtle uppercase mt-0.5">Duplicadas</p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl text-center border border-gray-100 dark:border-gray-800">
                <p className="text-lg font-bold text-gray-500">{jobState.progress.errors}</p>
                <p className="text-[10px] font-medium text-subtle uppercase mt-0.5">Erros</p>
              </div>
            </div>
            
            {jobState.error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{jobState.error}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Quarentine Review Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h3 className="font-semibold text-title flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-sigma-500" />
            Fotos Sob Revisão Manual ({pagination?.total ?? 0})
          </h3>
        </div>

        {/* Filters and Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm">
          {/* Status Tab Filters */}
          <div className="flex flex-wrap gap-1.5">
            {([
              { key: 'ALL', label: 'Todas' },
              { key: 'NO_FACE', label: 'Sem Rosto' },
              { key: 'LOW_QUALITY', label: 'Qualidade Baixa' },
              { key: 'DUPLICATE', label: 'Duplicadas' },
              { key: 'ERROR', label: 'Erros de Leitura' }
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => { setActiveStatus(key); setCurrentPage(1); }}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                  activeStatus === key
                    ? 'bg-sigma-600 border-sigma-600 text-white shadow-sm'
                    : 'border-gray-200 dark:border-gray-800 text-subtle hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <form onSubmit={handleSearch} className="relative flex-1 sm:max-w-xs">
            <input
              type="text"
              placeholder="Buscar por apenado..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs input-base"
            />
            <Search className="w-3.5 h-3.5 text-subtle absolute left-3 top-1/2 -translate-y-1/2" />
          </form>
        </div>

        {/* Loading Spinner */}
        {loading && (
          <div className="flex items-center justify-center py-20 card">
            <Loader2 className="w-8 h-8 text-sigma-600 animate-spin" />
          </div>
        )}

        {/* Empty State */}
        {!loading && logs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center card gap-3">
            <div className="w-14 h-14 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center">
              <CheckCircle className="w-7 h-7" />
            </div>
            <div>
              <p className="font-semibold text-title">Quarentena limpa!</p>
              <p className="text-xs text-subtle mt-0.5">Nenhuma imagem inadequada está aguardando revisão.</p>
            </div>
            <button
              onClick={fetchLogs}
              className="flex items-center gap-1.5 text-xs text-sigma-600 hover:text-sigma-700 font-semibold"
            >
              <RefreshCw className="w-3 h-3" /> Atualizar
            </button>
          </div>
        )}

        {/* Grid of Quarentined Cards */}
        {!loading && logs.length > 0 && (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {logs.map((log) => {
              const statusBadges = {
                NO_FACE: { label: 'Sem Rosto', color: 'bg-red-500/10 text-red-500 border-red-500/20', icon: Ban },
                LOW_QUALITY: { label: 'Baixa Qualidade', color: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20', icon: AlertTriangle },
                DUPLICATE: { label: 'Duplicada', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', icon: ImageIcon },
                ERROR: { label: 'Erro', color: 'bg-gray-500/10 text-gray-500 border-gray-500/20', icon: AlertTriangle }
              };
              const badge = statusBadges[log.status] || { label: log.status, color: 'bg-gray-100 text-gray-500', icon: AlertTriangle };
              const Icon = badge.icon;
              const isProcessing = processingId === log.id;

              return (
                <div key={log.id} className="card overflow-hidden flex flex-col justify-between border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md hover:border-gray-200 dark:hover:border-gray-700 transition-all duration-200">
                  
                  {/* Photo area */}
                  <div className="aspect-square w-full bg-gray-100 dark:bg-gray-800 relative overflow-hidden flex-shrink-0">
                    <img
                      src={`/api/admin/sanitizacao/${log.id}`}
                      alt={log.apenado?.name || 'Apenado'}
                      loading="lazy"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Fallback em caso de falha de carregamento
                        e.currentTarget.style.display = 'none';
                        const parent = e.currentTarget.parentElement;
                        if (parent) {
                          const placeholder = document.createElement('div');
                          placeholder.className = 'w-full h-full flex items-center justify-center text-gray-400 text-xs font-medium';
                          placeholder.innerText = 'Foto indisponível';
                          parent.appendChild(placeholder);
                        }
                      }}
                    />
                    
                    {/* Badge de status */}
                    <div className="absolute top-2 left-2 flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border shadow-sm backdrop-blur-md bg-white/95 dark:bg-gray-900/95">
                      <span className={`flex items-center gap-1 ${badge.color}`}>
                        <Icon className="w-2.5 h-2.5" />
                        {badge.label}
                      </span>
                    </div>

                    {/* Badge de Foto da Ficha Principal */}
                    {log.originalPath && log.apenado && log.originalPath === log.apenado.photoPath && (
                      <div className="absolute top-2 right-2 flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border shadow-sm backdrop-blur-md bg-purple-50 dark:bg-purple-950/80 border-purple-200 dark:border-purple-800 text-purple-600 dark:text-purple-400">
                        <CheckCircle className="w-2.5 h-2.5 text-purple-500" />
                        Ficha Ativa
                      </div>
                    )}

                    {isProcessing && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
                        <Loader2 className="w-8 h-8 text-white animate-spin" />
                      </div>
                    )}
                  </div>

                  {/* Body Info */}
                  <div className="p-3.5 flex-1 flex flex-col justify-between space-y-3">
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-title line-clamp-1 uppercase">
                        {log.apenado?.name || 'Apenado Sem Nome'}
                      </h4>
                      {log.apenado?.matricula && (
                        <p className="text-[10px] font-mono text-subtle">{log.apenado.matricula}</p>
                      )}
                      {log.apenado?.unidade && (
                        <p className="text-[10px] text-body line-clamp-1">{log.apenado.unidade}</p>
                      )}
                    </div>

                    {/* Detalhe do Motivo da falha */}
                    <div className="p-2.5 bg-gray-50 dark:bg-gray-800/40 rounded-lg border border-gray-100 dark:border-gray-800 text-[10px] text-body">
                      <p className="font-semibold text-title flex items-center gap-1 mb-0.5">
                        <AlertTriangle className="w-3 h-3 text-amber-500" />
                        Motivo do Descarte:
                      </p>
                      <p className="text-subtle leading-normal">{log.reason || 'Análise inconclusiva'}</p>
                      {log.score !== null && (
                        <p className="text-gray-500 mt-1 font-mono">Score obtido: {log.score}</p>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => handleAuditorDecision(log.id, 'approve')}
                        disabled={isProcessing}
                        className="flex-1 flex items-center justify-center gap-1 text-[11px] font-semibold text-white bg-green-600 hover:bg-green-700 px-2 py-1.5 rounded-lg active:scale-95 transition-all shadow-sm"
                        title="Aprovar e enviar para a base de indexação do ArcFace"
                      >
                        <Check className="w-3.5 h-3.5" /> Aprovar
                      </button>
                      <button
                        onClick={() => handleAuditorDecision(log.id, 'reject')}
                        disabled={isProcessing}
                        className="flex-1 flex items-center justify-center gap-1 text-[11px] font-semibold text-white bg-red-600 hover:bg-red-700 px-2 py-1.5 rounded-lg active:scale-95 transition-all shadow-sm"
                        title="Rejeitar e apagar permanentemente"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Rejeitar
                      </button>
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        )}

        {/* Pagination bar */}
        {!loading && pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-800 flex-wrap gap-3">
            <span className="text-xs text-subtle">
              Mostrando {logs.length} de {pagination.total} registros
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-850 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center text-body disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setCurrentPage(p)}
                  className={`w-8 h-8 rounded-lg text-xs font-semibold border ${
                    currentPage === p
                      ? 'bg-sigma-600 border-sigma-600 text-white'
                      : 'border-gray-200 dark:border-gray-850 hover:bg-gray-50 dark:hover:bg-gray-800 text-body'
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage((p) => Math.min(pagination.pages, p + 1))}
                disabled={currentPage === pagination.pages}
                className="w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-850 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center text-body disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
