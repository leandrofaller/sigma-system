'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Users,
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
  X,
} from 'lucide-react';
import { toast } from 'sonner';

interface Visitante {
  id: string;
  nome: string;
  cpf: string | null;
  carteirinha: string | null;
  certidaoNascimento: string | null;
  dataNascimento: string | null;
  sexo: string | null;
  telefone: string | null;
  naturalidade: string | null;
  dataCarteirinha: string | null;
  nomeMae: string | null;
  nomePai: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidadeUf: string | null;
  photoPath: string | null;
  _count?: {
    entradas: number;
  };
}

interface Entrada {
  id: string;
  tipo: string | null;
  nomeApenado: string | null;
  unidadePrisional: string | null;
  dataEntrada: string | null;
  dia: string | null;
  situacao: string | null;
}

interface Vinculo {
  id: string;
  apenado: {
    id: string;
    nome: string;
    unidade: string | null;
    photoPath: string | null;
  };
}

interface VisitanteDetalhe extends Visitante {
  entradas: Entrada[];
  vinculos: Vinculo[];
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

export function VisitantesClient() {
  const [visitantes, setVisitantes] = useState<Visitante[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  // Detalhe do Visitante selecionado
  const [selected, setSelected] = useState<VisitanteDetalhe | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [zoomedPhoto, setZoomedPhoto] = useState<{ url: string; nome: string } | null>(null);

  // Controle de Sincronização
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [activeJob, setActiveJob] = useState<SyncJob | null>(null);
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [syncHistory, setSyncHistory] = useState<SyncJob[]>([]);
  const [disparandoSync, setDisparandoSync] = useState(false);

  const sseRef = useRef<EventSource | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  // 1. Carrega a lista de visitantes
  const fetchVisitantes = async (currPage = page, searchTerm = search) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sipe/visitantes?page=${currPage}&limit=12&search=${encodeURIComponent(searchTerm)}`);
      if (res.ok) {
        const data = await res.json();
        setVisitantes(data.visitantes);
        setTotal(data.total);
        setTotalPages(data.pages);
      } else {
        toast.error('Erro ao carregar visitantes');
      }
    } catch (err) {
      toast.error('Erro de conexão ao carregar visitantes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVisitantes(page, search);
  }, [page]);

  // Fechar modal de zoom com a tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setZoomedPhoto(null);
      }
    };
    if (zoomedPhoto) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [zoomedPhoto]);

  // Handler para busca com debounce opcional ou direta
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchVisitantes(1, search);
  };

  // 2. Carrega detalhes do visitante
  const handleSelectVisitante = async (v: Visitante) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/sipe/visitantes/${v.id}`);
      if (res.ok) {
        const data = await res.json();
        setSelected(data);
      } else {
        toast.error('Erro ao carregar ficha do visitante');
      }
    } catch (err) {
      toast.error('Erro ao obter dados do visitante');
    } finally {
      setLoadingDetail(false);
    }
  };

  // 3. Gerenciamento do Job de Sync
  const fetchJobsStatus = async () => {
    try {
      const res = await fetch('/api/sipe/sync');
      if (res.ok) {
        const data = await res.json();
        // Filtra para mostrar apenas histórico do tipo VISITANTES
        const list = data.filter((j: any) => j.tipo === 'VISITANTES') as SyncJob[];
        setSyncHistory(list);

        // Se houver um job rodando, conecta SSE
        const running = list.find((j) => j.status === 'RUNNING');
        if (running && (!activeJob || activeJob.status !== 'RUNNING')) {
          startSSE(running.id);
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
    const toastId = toast.loading('Disparando sincronização de visitantes...');
    try {
      const res = await fetch('/api/sipe/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'VISITANTES',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro na requisição');
      }

      toast.success('Sincronização iniciada com sucesso!', { id: toastId });
      setActiveJob({
        id: data.jobId,
        status: 'RUNNING',
        tipo: 'VISITANTES',
        unidadeNome: 'Sincronização de Visitantes',
        total: 0,
        processado: 0,
        erros: 0,
        log: '',
        fase: 'Iniciando',
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
    const toastId = toast.loading('Solicitando parada do scraping...');
    try {
      await fetch('/api/sipe/sync/stop', { method: 'POST' });
      toast.success('Comando de parada enviado!', { id: toastId });
      fetchJobsStatus();
    } catch (err) {
      toast.error('Erro ao tentar parar a sincronização', { id: toastId });
    }
  };

  return (
    <div className="flex-1 space-y-6 p-6 max-w-7xl mx-auto">
      {/* Cabeçalho do módulo */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gradient-to-r from-gray-900 via-slate-900 to-indigo-950 p-6 rounded-2xl border border-indigo-900/40 shadow-xl text-white">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 rounded-xl border border-indigo-500/30">
              <Users className="w-6 h-6 text-indigo-400" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Visitantes do SIPE</h1>
          </div>
          <p className="text-gray-400 text-sm">
            Gestão, scraping e biometria facial ArcFace de visitantes e controle de entradas registradas.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSyncModal(true)}
            className="px-4 py-2 text-sm font-semibold rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700/60 transition-all flex items-center gap-2"
          >
            Histórico de Sync
          </button>
          <button
            onClick={handleStartSync}
            disabled={disparandoSync || activeJob?.status === 'RUNNING'}
            className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 rounded-xl transition-all active:scale-95 shadow-md shadow-indigo-600/20 flex items-center gap-2"
          >
            {activeJob?.status === 'RUNNING' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sincronizando...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Sincronizar Visitantes
              </>
            )}
          </button>
        </div>
      </div>

      {/* Conteúdo Principal: Tabela e Detalhes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Lado Esquerdo: Lista de Visitantes */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700/60 shadow-sm p-4">
            {/* Barra de pesquisa */}
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Pesquisar visitante por Nome, CPF ou Carteirinha..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
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
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                <span className="text-sm">Carregando visitantes...</span>
              </div>
            ) : visitantes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-2 text-gray-400">
                <Users className="w-12 h-12 text-gray-300" />
                <span className="text-sm font-medium">Nenhum visitante encontrado.</span>
                <p className="text-xs text-gray-500">Execute a sincronização para importar dados do SIPE.</p>
              </div>
            ) : (
              <div className="mt-4 overflow-hidden border border-gray-100 dark:border-gray-700 rounded-xl">
                <div className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-900">
                  {visitantes.map((v) => (
                    <div
                      key={v.id}
                      onClick={() => handleSelectVisitante(v)}
                      className={`flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800/40 cursor-pointer transition-colors ${
                        selected?.id === v.id ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''
                      }`}
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        {/* Foto */}
                        <div
                          onClick={(e) => {
                            if (v.photoPath) {
                              e.stopPropagation();
                              setZoomedPhoto({
                                url: `/api/sipe/visitantes/${v.id}/foto`,
                                nome: v.nome,
                              });
                            }
                          }}
                          className={`w-12 h-12 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0 flex items-center justify-center border border-gray-200/50 dark:border-gray-700 transition-all duration-200 ${
                            v.photoPath
                              ? 'cursor-zoom-in hover:scale-105 hover:border-indigo-500'
                              : ''
                          }`}
                        >
                          {v.photoPath ? (
                            <img
                              src={`/api/sipe/visitantes/${v.id}/foto`}
                              alt={v.nome}
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
                          <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{v.nome}</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-400 mt-1">
                            {v.carteirinha && <span>Cart: <span className="font-mono">{v.carteirinha}</span></span>}
                            {v.cpf && <span>CPF: {v.cpf}</span>}
                            {v.dataNascimento && <span>Nasc: {v.dataNascimento}</span>}
                          </div>
                        </div>
                      </div>

                      {/* Contador de visitas / Situação */}
                      <div className="text-right shrink-0">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                          {v._count?.entradas || 0} visitas
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
                  Página {page} de {totalPages} ({total} visitante(s))
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

        {/* Lado Direito: Ficha Detalhada do Visitante Selecionado */}
        <div className="lg:col-span-1">
          {loadingDetail ? (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700/60 shadow-sm p-8 flex flex-col items-center justify-center gap-3 text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
              <span className="text-xs">Carregando detalhes...</span>
            </div>
          ) : !selected ? (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700/60 shadow-sm p-8 text-center text-gray-400">
              <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <span className="text-xs font-medium">Selecione um visitante para visualizar a ficha detalhada e o histórico.</span>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700/60 shadow-sm overflow-hidden flex flex-col">
              {/* Cabeçalho da Ficha */}
              <div className="p-4 bg-gradient-to-r from-gray-50 to-indigo-50/20 dark:from-gray-800/40 dark:to-gray-800/20 border-b border-gray-100 dark:border-gray-700/80 flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                  Ficha do Visitante
                </span>
                <button
                  onClick={() => setSelected(null)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>

              {/* Informações da Ficha */}
              <div className="p-4 space-y-6">
                {/* Foto e Nome */}
                <div className="flex items-center gap-4">
                  <div
                    onClick={() => {
                      if (selected.photoPath) {
                        setZoomedPhoto({
                          url: `/api/sipe/visitantes/${selected.id}/foto`,
                          nome: selected.nome,
                        });
                      }
                    }}
                    className={`w-20 h-20 rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-900 border-2 border-indigo-500/20 flex-shrink-0 flex items-center justify-center transition-all duration-200 ${
                      selected.photoPath
                        ? 'cursor-zoom-in hover:scale-105 hover:border-indigo-500'
                        : ''
                    }`}
                  >
                    {selected.photoPath ? (
                      <img
                        src={`/api/sipe/visitantes/${selected.id}/foto`}
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
                      Carteirinha: <span className="font-mono font-medium">{selected.carteirinha}</span>
                    </p>
                  </div>
                </div>

                {/* Dados Pessoais */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700/80 pb-1 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" /> Dados Pessoais
                  </h4>
                  <div className="grid grid-cols-1 gap-2 text-xs">
                    {[
                      ['CPF', selected.cpf],
                      ['Data Nasc.', selected.dataNascimento],
                      ['Sexo', selected.sexo],
                      ['Naturalidade', selected.naturalidade],
                      ['Certidão Nasc.', selected.certidaoNascimento],
                      ['Emissão Cart.', selected.dataCarteirinha],
                    ].map(([label, value]) => value ? (
                      <div key={label} className="flex justify-between py-1 border-b border-gray-50 dark:border-gray-700/40">
                        <span className="text-gray-500">{label}</span>
                        <span className="font-semibold text-gray-800 dark:text-gray-200">{value}</span>
                      </div>
                    ) : null)}
                  </div>
                </div>

                {/* Filiação e Contato */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700/80 pb-1 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5" /> Filiação & Contato
                  </h4>
                  <div className="text-xs space-y-2">
                    {selected.telefone && (
                      <div className="flex gap-2 text-gray-700 dark:text-gray-300">
                        <span className="font-semibold shrink-0">Tel:</span>
                        <span>{selected.telefone}</span>
                      </div>
                    )}
                    {selected.nomeMae && (
                      <div className="flex gap-2 text-gray-700 dark:text-gray-300">
                        <span className="font-semibold shrink-0">Mãe:</span>
                        <span>{selected.nomeMae}</span>
                      </div>
                    )}
                    {selected.nomePai && (
                      <div className="flex gap-2 text-gray-700 dark:text-gray-300">
                        <span className="font-semibold shrink-0">Pai:</span>
                        <span>{selected.nomePai}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Endereço */}
                {(selected.logradouro || selected.cidadeUf) && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700/80 pb-1 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" /> Endereço Residencial
                    </h4>
                    <p className="text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/30 p-2.5 rounded-lg border border-gray-100 dark:border-gray-700 leading-normal">
                      {selected.logradouro}
                      {selected.numero && `, Nº ${selected.numero}`}
                      {selected.bairro && ` - Bairro ${selected.bairro}`}
                      {selected.cidadeUf && ` - ${selected.cidadeUf}`}
                    </p>
                  </div>
                )}

                {/* Vínculos */}
                {selected.vinculos && selected.vinculos.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700/80 pb-1 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" /> Apenados Vinculados
                    </h4>
                    <div className="space-y-2">
                      {selected.vinculos.map((v) => (
                        <div key={v.id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-900/30 p-2 rounded-lg border border-gray-100 dark:border-gray-700 text-xs">
                          <div className="w-8 h-8 rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-800 flex-shrink-0 flex items-center justify-center text-gray-400 select-none">
                            {v.apenado.photoPath ? (
                              <img
                                src={`/api/sipe/apenados/${v.apenado.id}/foto`}
                                alt={v.apenado.nome}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <User className="w-4 h-4" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-gray-800 dark:text-gray-200 truncate">{v.apenado.nome}</p>
                            {v.apenado.unidade && <p className="text-[10px] text-gray-400 truncate">{v.apenado.unidade}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Histórico de Entradas */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700/80 pb-1 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" /> Histórico de Entradas ({selected.entradas?.length || 0})
                  </h4>
                  {selected.entradas?.length === 0 ? (
                    <p className="text-xs text-gray-500 italic">Nenhum registro de entrada encontrado.</p>
                  ) : (
                    <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                      {selected.entradas.map((e) => (
                        <div key={e.id} className="p-3 bg-gray-50 dark:bg-gray-800/30 rounded-xl border border-gray-100 dark:border-gray-700 text-xs">
                          <div className="flex justify-between items-start mb-1 flex-wrap gap-2">
                            <span className="font-bold text-[10px] bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">
                              {e.tipo}
                            </span>
                            <span className="text-[10px] text-gray-400 font-mono shrink-0">
                              {e.dataEntrada ? new Date(e.dataEntrada).toLocaleString('pt-BR') : 'Sem data'}
                            </span>
                          </div>
                          {e.nomeApenado && (
                            <p className="text-gray-700 dark:text-gray-300 font-medium">
                              Visita a: <span className="font-semibold text-gray-900 dark:text-white">{e.nomeApenado}</span>
                            </p>
                          )}
                          {e.unidadePrisional && (
                            <p className="text-gray-500 flex items-center gap-1 mt-1 text-[11px]">
                              <Building2 className="w-3 h-3 text-gray-400 shrink-0" />
                              <span className="truncate">{e.unidadePrisional}</span>
                            </p>
                          )}
                          {e.situacao && (
                            <div className="flex items-center gap-1.5 mt-1.5">
                              {e.situacao.toLowerCase() === 'ok' ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                              ) : (
                                <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              )}
                              <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">
                                Situação: {e.situacao}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
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
            <div className="p-4 bg-gradient-to-r from-gray-900 to-indigo-950 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <RefreshCw className={`w-5 h-5 ${activeJob?.status === 'RUNNING' ? 'animate-spin text-indigo-400' : ''}`} />
                  Painel de Sincronização SIPE
                </h3>
                <p className="text-xs text-gray-400">Controle e logs de sincronização de visitantes.</p>
              </div>
              <button
                onClick={() => {
                  disconnectSSE();
                  setShowSyncModal(false);
                  fetchVisitantes(page, search);
                }}
                className="text-gray-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Conteúdo do Modal */}
            <div className="flex-1 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-gray-100 dark:divide-gray-700 overflow-hidden">
              {/* Lado Esquerdo: Logs Ativos e Status do Job Corrente */}
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
                            className="bg-indigo-600 h-full transition-all duration-300"
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
                      <p className="text-gray-500 border-b border-gray-800 pb-1.5 mb-1.5">CONSOLA DE SAÍDA SIPE</p>
                      <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                        {syncLogs.length === 0 ? (
                          <p className="text-gray-600 italic">Nenhum log disponível.</p>
                        ) : (
                          syncLogs.map((line, idx) => (
                            <p key={idx} className={line.includes('[ERRO]') ? 'text-red-400' : line.includes('[AVISO]') ? 'text-amber-400' : 'text-green-400/90'}>
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
                    <span className="text-sm font-medium">Nenhuma sincronização ativa no momento.</span>
                    <button
                      onClick={handleStartSync}
                      disabled={disparandoSync}
                      className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all"
                    >
                      <Play className="w-3.5 h-3.5" /> Iniciar Agora
                    </button>
                  </div>
                )}
              </div>

              {/* Lado Direito: Histórico de Sincronizações de Visitantes */}
              <div className="w-full md:w-60 shrink-0 p-4 overflow-y-auto flex flex-col">
                <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
                  Últimos Sincronismos
                </span>
                <div className="space-y-2 flex-1">
                  {syncHistory.length === 0 ? (
                    <p className="text-xs text-gray-500 italic">Sem registros no histórico.</p>
                  ) : (
                    syncHistory.slice(0, 10).map((j) => (
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
                            ? 'border-indigo-500 bg-indigo-50/10'
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
                          Sync Visitantes
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

      {/* Lightbox / Foto em tamanho real */}
      {zoomedPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md transition-all duration-300 animate-in fade-in"
          onClick={() => setZoomedPhoto(null)}
        >
          <div
            className="relative max-w-3xl max-h-[85vh] bg-slate-900/90 rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex flex-col items-center justify-center animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Botão de Fechar */}
            <button
              onClick={() => setZoomedPhoto(null)}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 hover:bg-black/80 text-white/80 hover:text-white border border-white/10 transition-all active:scale-95 shadow-lg"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Imagem em tamanho real */}
            <img
              src={zoomedPhoto.url}
              alt={zoomedPhoto.nome}
              className="max-w-full max-h-[75vh] object-contain select-none"
            />

            {/* Nome do visitante */}
            <div className="w-full bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 text-white text-center">
              <p className="font-semibold text-lg drop-shadow-md text-slate-100">{zoomedPhoto.nome}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
