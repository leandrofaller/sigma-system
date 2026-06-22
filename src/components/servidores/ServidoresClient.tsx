'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Briefcase,
  Search,
  RefreshCw,
  Loader2,
  Calendar,
  Building2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Play,
  StopCircle,
  ChevronLeft,
  ChevronRight,
  User,
  Phone,
  FileText,
  MapPin,
  Shield,
  FileSpreadsheet
} from 'lucide-react';
import { toast } from 'sonner';

interface Servidor {
  id: string;
  sejusId: number;
  nome: string;
  cpf: string | null;
  matricula: string | null;
  cargo: string | null;
  lotacao: string | null;
  situacao: string | null;
  regime: string | null;
  dataAdmissao: string | null;
  photoPath: string | null;
  faceDescriptor: string | null;
  detScore: number | null;
  photoQuality: number | null;
  createdAt: string;
  updatedAt: string;
}

interface SyncJob {
  id: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'INTERRUPTED';
  tipo: string;
  unidadeNome: string | null;
  total: number;
  processado: number;
  erros: number;
  log: string | null;
  fase: string | null;
  iniciadoEm: string;
}

export function ServidoresClient() {
  const [servidores, setServidores] = useState<Servidor[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  // Detalhe do Servidor selecionado
  const [selected, setSelected] = useState<Servidor | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Controle de Sincronização
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [activeJob, setActiveJob] = useState<SyncJob | null>(null);
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [syncHistory, setSyncHistory] = useState<SyncJob[]>([]);
  const [disparandoSync, setDisparandoSync] = useState(false);

  const sseRef = useRef<EventSource | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  // 1. Carrega a lista de servidores
  const fetchServidores = async (currPage = page, searchTerm = search) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sejus/servidores?page=${currPage}&limit=12&search=${encodeURIComponent(searchTerm)}`);
      if (res.ok) {
        const data = await res.json();
        setServidores(data.servidores);
        setTotal(data.total);
        setTotalPages(data.pages);
      } else {
        toast.error('Erro ao carregar servidores');
      }
    } catch (err) {
      toast.error('Erro de conexão ao carregar servidores');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServidores(page, search);
  }, [page]);

  // Handler para busca
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchServidores(1, search);
  };

  // 2. Carrega detalhes do servidor
  const handleSelectServidor = async (s: Servidor) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/sejus/servidores/${s.id}`);
      if (res.ok) {
        const data = await res.json();
        setSelected(data);
      } else {
        toast.error('Erro ao carregar ficha do servidor');
      }
    } catch (err) {
      toast.error('Erro ao obter dados do servidor');
    } finally {
      setLoadingDetail(false);
    }
  };

  // 3. Gerenciamento do Job de Sync
  const fetchJobsStatus = async () => {
    try {
      const res = await fetch('/api/sejus/sync');
      if (res.ok) {
        const lastJob = await res.json();
        if (lastJob) {
          setSyncHistory([lastJob]);
          if (lastJob.status === 'RUNNING' && (!activeJob || activeJob.status !== 'RUNNING')) {
            setActiveJob(lastJob);
            startSSE(lastJob.id);
          }
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchJobsStatus();
    const interval = setInterval(fetchJobsStatus, 8000);
    return () => {
      clearInterval(interval);
      disconnectSSE();
    };
  }, []);

  const disconnectSSE = () => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
  };

  const startSSE = (jobId: string) => {
    disconnectSSE();
    setSyncLogs([]);

    const es = new EventSource(`/api/sipe/sync/stream?jobId=${jobId}`);
    sseRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'job-status' || data.type === 'progress') {
          setActiveJob((prev) => {
            const next = { ...prev, ...data } as SyncJob;
            if (data.status) next.status = data.status;
            return next;
          });
        }
        if (data.type === 'log' && data.message) {
          const lines = data.message.split('\n');
          setSyncLogs(lines);
        }
      } catch (err) {
        console.error(err);
      }
    };

    es.onerror = () => {
      console.warn('Conexão SSE perdida, tentando reconectar...');
      disconnectSSE();
    };
  };

  // Rola logs para baixo automaticamente
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [syncLogs]);

  // Dispara novo scraping
  const handleStartSync = async () => {
    setDisparandoSync(true);
    const toastId = toast.loading('Iniciando sincronização com o SGP SEJUS...');
    try {
      const res = await fetch('/api/sejus/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro na requisição');
      }

      toast.success('Sincronização iniciada com sucesso!', { id: toastId });
      setActiveJob({
        id: data.jobId,
        status: 'RUNNING',
        tipo: 'SERVIDORES',
        unidadeNome: 'SGP SEJUS - Servidores',
        total: 0,
        processado: 0,
        erros: 0,
        log: '',
        fase: 'Login',
        iniciadoEm: new Date().toISOString(),
      });
      setShowSyncModal(true);
      startSSE(data.jobId);
      fetchJobsStatus();
    } catch (err: any) {
      toast.error(err.message || 'Falha ao iniciar sincronização', { id: toastId });
    } finally {
      setDisparandoSync(false);
    }
  };

  const handleStopSync = async () => {
    const toastId = toast.loading('Solicitando interrupção do scraping...');
    try {
      const res = await fetch('/api/sejus/sync', { method: 'DELETE' });
      if (res.ok) {
        toast.success('Sincronização interrompida!', { id: toastId });
        fetchJobsStatus();
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao parar');
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao tentar parar a sincronização', { id: toastId });
    }
  };

  return (
    <div className="flex-1 space-y-6 p-6 max-w-7xl mx-auto">
      {/* Cabeçalho do módulo */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gradient-to-r from-slate-900 via-zinc-900 to-sky-950 p-6 rounded-2xl border border-sky-900/40 shadow-xl text-white">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-sky-500/20 rounded-xl border border-sky-500/30">
              <Briefcase className="w-6 h-6 text-sky-400" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Servidores SEJUS</h1>
          </div>
          <p className="text-gray-400 text-sm">
            Consulta de vínculos de servidores do SGP e biometria facial. Visível apenas para o Superadmin.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSyncModal(true)}
            className="px-4 py-2 text-sm font-semibold rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700/60 transition-all flex items-center gap-2"
          >
            Monitorar Sincronismo
          </button>
          <button
            onClick={handleStartSync}
            disabled={disparandoSync || activeJob?.status === 'RUNNING'}
            className="px-4 py-2 text-sm font-bold text-white bg-sky-600 hover:bg-sky-700 disabled:bg-sky-600/50 rounded-xl transition-all active:scale-95 shadow-md shadow-sky-600/20 flex items-center gap-2"
          >
            {activeJob?.status === 'RUNNING' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sincronizando...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Sincronizar Servidores
              </>
            )}
          </button>
        </div>
      </div>

      {/* Conteúdo Principal: Tabela e Detalhes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Lado Esquerdo: Lista de Servidores */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700/60 shadow-sm p-4">
            {/* Barra de pesquisa */}
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Pesquisar servidor por Nome, CPF ou Matrícula..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-semibold text-white bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 rounded-xl transition-all"
              >
                Buscar
              </button>
            </form>

            {/* Listagem */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-500">
                <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
                <span className="text-sm">Carregando servidores...</span>
              </div>
            ) : servidores.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-2 text-gray-400">
                <Briefcase className="w-12 h-12 text-gray-300" />
                <span className="text-sm font-medium">Nenhum servidor encontrado.</span>
                <p className="text-xs text-gray-500">Dispare a sincronização para ler dados do SGP SEJUS.</p>
              </div>
            ) : (
              <div className="mt-4 overflow-hidden border border-gray-100 dark:border-gray-700 rounded-xl">
                <div className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-900">
                  {servidores.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => handleSelectServidor(s)}
                      className={`flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800/40 cursor-pointer transition-colors ${
                        selected?.id === s.id ? 'bg-sky-50/40 dark:bg-sky-950/20' : ''
                      }`}
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        {/* Foto */}
                        <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0 flex items-center justify-center border border-gray-200/50 dark:border-gray-700">
                          {s.photoPath ? (
                            <img
                              src={`/api/sejus/servidores/${s.id}/foto`}
                              alt={s.nome}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <User className="w-6 h-6 text-gray-400" />
                          )}
                        </div>

                        {/* Dados textuais */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{s.nome}</p>
                            {s.faceDescriptor && s.faceDescriptor !== 'NONE' && (
                              <span className="inline-flex items-center text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 px-1 rounded border border-emerald-500/20">
                                ArcFace OK
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-400 mt-1">
                            {s.matricula && <span>Matrícula: <span className="font-mono">{s.matricula}</span></span>}
                            {s.cpf && <span>CPF: {s.cpf}</span>}
                            {s.cargo && <span className="truncate max-w-[150px]">{s.cargo}</span>}
                          </div>
                        </div>
                      </div>

                      {/* Situação */}
                      <div className="text-right shrink-0">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          s.situacao?.toLowerCase().includes('ativo')
                            ? 'bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}>
                          {s.situacao || 'Desconhecido'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-700 mt-4 pt-4">
                <span className="text-xs text-gray-500">
                  Página {page} de {totalPages} ({total} servidor(es))
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:hover:bg-transparent transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:hover:bg-transparent transition-all"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Lado Direito: Ficha Detalhada */}
        <div className="lg:col-span-1">
          {loadingDetail ? (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700/60 shadow-sm p-8 flex flex-col items-center justify-center gap-3 text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin text-sky-500" />
              <span className="text-xs">Carregando detalhes...</span>
            </div>
          ) : !selected ? (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700/60 shadow-sm p-8 text-center text-gray-400">
              <Briefcase className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <span className="text-xs font-medium">Selecione um servidor para visualizar a ficha cadastral de vínculo.</span>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700/60 shadow-sm overflow-hidden flex flex-col">
              {/* Cabeçalho da Ficha */}
              <div className="p-4 bg-gradient-to-r from-gray-50 to-sky-50/20 dark:from-gray-800/40 dark:to-gray-800/20 border-b border-gray-100 dark:border-gray-700/80 flex items-center justify-between">
                <span className="text-xs font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider">
                  Vínculo Funcional
                </span>
                <button
                  onClick={() => setSelected(null)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>

              {/* Detalhes do Servidor */}
              <div className="p-4 space-y-6">
                {/* Foto e Nome */}
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-900 border-2 border-sky-500/20 flex-shrink-0 flex items-center justify-center">
                    {selected.photoPath ? (
                      <img
                        src={`/api/sejus/servidores/${selected.id}/foto`}
                        alt={selected.nome}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User className="w-10 h-10 text-gray-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-gray-900 dark:text-white text-base leading-snug truncate">
                      {selected.nome}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      Matrícula: <span className="font-mono font-medium">{selected.matricula || 'N/A'}</span>
                    </p>
                  </div>
                </div>

                {/* Dados do Vínculo */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700/80 pb-1 flex items-center gap-1.5">
                    <FileSpreadsheet className="w-3.5 h-3.5" /> Informações do Contrato
                  </h4>
                  <div className="grid grid-cols-1 gap-2 text-xs">
                    {[
                      ['ID SGP', selected.sejusId],
                      ['CPF', selected.cpf],
                      ['Cargo', selected.cargo],
                      ['Lotação', selected.lotacao],
                      ['Regime', selected.regime],
                      ['Admissão', selected.dataAdmissao],
                      ['Situação', selected.situacao],
                    ].map(([label, value]) => value ? (
                      <div key={label} className="flex justify-between py-1 border-b border-gray-50 dark:border-gray-700/40">
                        <span className="text-gray-500">{label}</span>
                        <span className="font-semibold text-gray-800 dark:text-gray-200">{value}</span>
                      </div>
                    ) : null)}
                  </div>
                </div>

                {/* Reconhecimento Facial */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700/80 pb-1 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5" /> Reconhecimento Facial (ArcFace)
                  </h4>
                  <div className="text-xs space-y-2 bg-gray-50 dark:bg-gray-900/30 p-3 rounded-xl border border-gray-100 dark:border-gray-700 leading-normal">
                    {selected.faceDescriptor && selected.faceDescriptor !== 'NONE' ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Biometria Cadastrada</span>
                        </div>
                        <p className="text-[11px] text-gray-500">
                          Rosto mapeado com sucesso em 512 dimensões. Pontuação de detecção do modelo: {(selected.detScore || 0).toFixed(4)}.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-semibold">
                          <AlertCircle className="w-4 h-4" />
                          <span>Pendente ou Sem Face Mapeada</span>
                        </div>
                        <p className="text-[11px] text-gray-500">
                          Rosto não identificado ou sem foto válida no cadastro. Será analisado novamente no próximo sincronismo.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Sincronização (SSE e Histórico) */}
      {showSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col overflow-hidden border border-gray-100 dark:border-gray-700/80 animate-in fade-in duration-200">
            {/* Header */}
            <div className="p-4 bg-gradient-to-r from-gray-900 to-sky-950 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <RefreshCw className={`w-5 h-5 ${activeJob?.status === 'RUNNING' ? 'animate-spin text-sky-400' : ''}`} />
                  Painel de Sincronização SGP
                </h3>
                <p className="text-xs text-gray-400">Controle e logs de sincronização de servidores.</p>
              </div>
              <button
                onClick={() => {
                  disconnectSSE();
                  setShowSyncModal(false);
                  fetchServidores(page, search);
                }}
                className="text-gray-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Conteúdo do Modal */}
            <div className="flex-1 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-gray-100 dark:divide-gray-700 overflow-hidden">
              {/* Lado Esquerdo: Logs e Status */}
              <div className="flex-1 flex flex-col overflow-hidden p-4">
                {activeJob ? (
                  <div className="flex-1 flex flex-col overflow-hidden space-y-4">
                    {/* Status Card */}
                    <div className="bg-gray-50 dark:bg-gray-900/30 p-4 rounded-xl border border-gray-100 dark:border-gray-700/80 text-xs">
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-semibold text-gray-500 uppercase tracking-wider">Status Atual</span>
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          activeJob.status === 'RUNNING'
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 animate-pulse'
                            : activeJob.status === 'COMPLETED'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                            : activeJob.status === 'FAILED'
                            ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                            : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                        }`}>
                          {activeJob.status}
                        </span>
                      </div>

                      {/* Progresso */}
                      <div className="space-y-2">
                        <div className="flex justify-between text-[11px] text-gray-600 dark:text-gray-400 font-medium">
                          <span>Fase: <span className="text-gray-900 dark:text-white font-bold">{activeJob.fase || 'N/A'}</span></span>
                          {activeJob.total > 0 && (
                            <span>{activeJob.processado}/{activeJob.total} ({activeJob.erros} erro(s))</span>
                          )}
                        </div>

                        {/* Barra de Progresso */}
                        <div className="w-full bg-gray-200 dark:bg-gray-700 h-2.5 rounded-full overflow-hidden">
                          <div
                            className="bg-sky-600 h-full transition-all duration-300"
                            style={{
                              width: `${
                                activeJob.total > 0
                                  ? Math.round((activeJob.processado / activeJob.total) * 100)
                                  : activeJob.status === 'COMPLETED'
                                  ? 100
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      </div>

                      {/* Botão de Controle */}
                      {activeJob.status === 'RUNNING' && (
                        <button
                          onClick={handleStopSync}
                          className="mt-4 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all font-semibold active:scale-95 text-[11px]"
                        >
                          <StopCircle className="w-4 h-4" /> Parar Sincronização
                        </button>
                      )}
                    </div>

                    {/* Console de Logs */}
                    <div className="flex-1 flex flex-col overflow-hidden bg-gray-950 rounded-xl border border-gray-800 p-3 font-mono text-[10px] text-gray-300">
                      <p className="text-gray-500 border-b border-gray-800 pb-1.5 mb-1.5">CONSOLA DE SAÍDA SGP</p>
                      <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                        {syncLogs.length === 0 ? (
                          <p className="text-gray-600 italic">Nenhum log disponível.</p>
                        ) : (
                          syncLogs.map((line, idx) => (
                            <p key={idx} className={line.includes('[ERRO]') ? 'text-red-400' : line.includes('[AVISO]') ? 'text-amber-400' : 'text-sky-400/90'}>
                              {line}
                            </p>
                          ))
                        )}
                        <div ref={logEndRef} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-400">
                    <RefreshCw className="w-10 h-10 text-gray-300 mb-2" />
                    <span className="text-sm font-medium">Nenhuma sincronização de servidores ativa.</span>
                    <button
                      onClick={handleStartSync}
                      disabled={disparandoSync}
                      className="mt-4 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all"
                    >
                      <Play className="w-3.5 h-3.5" /> Iniciar Agora
                    </button>
                  </div>
                )}
              </div>

              {/* Lado Direito: Histórico */}
              <div className="w-full md:w-60 shrink-0 p-4 overflow-y-auto flex flex-col">
                <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
                  Histórico de Sincronismo
                </span>
                <div className="space-y-2 flex-1">
                  {syncHistory.length === 0 ? (
                    <p className="text-xs text-gray-500 italic">Sem registros recentes.</p>
                  ) : (
                    syncHistory.map((j) => (
                      <div
                        key={j.id}
                        onClick={() => {
                          setActiveJob(j);
                          if (j.status === 'RUNNING') startSSE(j.id);
                          else if (j.log) setSyncLogs(j.log.split('\n'));
                          else setSyncLogs([]);
                        }}
                        className={`p-2.5 rounded-lg border text-xs cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${
                          activeJob?.id === j.id
                            ? 'border-sky-500 bg-sky-50/10'
                            : 'border-gray-100 dark:border-gray-700'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] text-gray-400">
                            {new Date(j.iniciadoEm).toLocaleDateString('pt-BR')}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                            j.status === 'COMPLETED'
                              ? 'bg-green-100 dark:bg-green-950/20 text-green-700 dark:text-green-400'
                              : j.status === 'FAILED'
                              ? 'bg-red-100 dark:bg-red-950/20 text-red-700 dark:text-red-400'
                              : 'bg-amber-100 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400'
                          }`}>
                            {j.status}
                          </span>
                        </div>
                        <p className="font-semibold text-gray-700 dark:text-gray-300 truncate">
                          SGP Servidores
                        </p>
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          {j.processado} proc · {j.erros} erro(s)
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
