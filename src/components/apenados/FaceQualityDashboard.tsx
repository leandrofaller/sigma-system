'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, Activity, Loader2, RefreshCw, RotateCcw, CheckCircle,
  AlertTriangle, Zap, Database, Eye, Layers,
} from 'lucide-react';

interface QualityStats {
  total: number;
  indexed: number;
  noFace: number;
  lowScore: number;
  blurry: number;
  pending: number;
}

interface QualityRecord {
  id: string;
  name: string;
  matricula: string | null;
  unidade: string | null;
  photoPath: string | null;
  photoQuality: number | null;
  detScore: number | null;
}

interface PgVectorStats {
  available: boolean;
  vectorCount: number;
  indexExists: boolean;
}

type Tab = 'lowscore' | 'blurry' | 'pending';

interface Props {
  onClose: () => void;
}

function detScoreInfo(s: number | null) {
  if (s === null) return { label: '—', cls: 'bg-gray-400/80' };
  const pct = Math.round(s * 100);
  if (pct < 30) return { label: `${pct}%`, cls: 'bg-red-500/80' };
  if (pct < 50) return { label: `${pct}%`, cls: 'bg-orange-500/80' };
  return { label: `${pct}%`, cls: 'bg-green-500/80' };
}

function qualityInfo(q: number | null) {
  if (q === null) return { label: '—', cls: 'bg-gray-400/80' };
  if (q < 50) return { label: 'Borrada', cls: 'bg-red-500/80' };
  if (q < 150) return { label: 'Regular', cls: 'bg-yellow-500/80' };
  if (q < 400) return { label: 'Boa', cls: 'bg-blue-500/80' };
  return { label: 'Nítida', cls: 'bg-green-500/80' };
}

const TAB_LABELS: Record<Tab, string> = {
  lowscore: 'Score Baixo',
  blurry: 'Borradas',
  pending: 'Pendentes',
};

export function FaceQualityDashboard({ onClose }: Props) {
  const [stats, setStats] = useState<QualityStats | null>(null);
  const [pgvec, setPgvec] = useState<PgVectorStats | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('lowscore');
  const [records, setRecords] = useState<QualityRecord[]>([]);
  const [tabTotal, setTabTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [resettingIds, setResettingIds] = useState<Set<string>>(new Set());
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const [initingPgvec, setInitingPgvec] = useState(false);
  const [migratingPgvec, setMigratingPgvec] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);
  const TAKE = 50;

  const fetchStats = useCallback(async () => {
    try {
      const [qRes, pvRes] = await Promise.all([
        fetch(`/api/apenados/face/quality?tab=${activeTab}&skip=0&take=${TAKE}`),
        fetch('/api/apenados/face/pgvector'),
      ]);
      const qData = await qRes.json();
      const pvData = await pvRes.json();
      setStats(qData.stats ?? null);
      setRecords(qData.records ?? []);
      setTabTotal(qData.total ?? 0);
      setSkip(qData.records?.length ?? 0);
      setPgvec(pvData);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  const fetchTab = useCallback(async (tab: Tab, reset = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/apenados/face/quality?tab=${tab}&skip=0&take=${TAKE}`);
      const data = await res.json();
      if (reset) setStats(data.stats ?? null);
      setRecords(data.records ?? []);
      setTabTotal(data.total ?? 0);
      setSkip(data.records?.length ?? 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setRecords([]);
    setTabTotal(0);
    setSkip(0);
    fetchTab(tab);
  };

  // Infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || loadingMoreRef.current || records.length >= tabTotal) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);
      fetch(`/api/apenados/face/quality?tab=${activeTab}&skip=${skip}&take=${TAKE}`)
        .then((r) => r.json())
        .then((data) => {
          setRecords((prev) => [...prev, ...(data.records ?? [])]);
          setSkip((s) => s + (data.records?.length ?? 0));
        })
        .finally(() => { setLoadingMore(false); loadingMoreRef.current = false; });
    }, { rootMargin: '200px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [activeTab, records.length, tabTotal, skip]);

  const handleReindex = useCallback(async (record: QualityRecord) => {
    setResettingIds((prev) => new Set([...prev, record.id]));
    try {
      const res = await fetch('/api/apenados/face/quality/reindex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [record.id] }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setRecords((prev) => prev.filter((r) => r.id !== record.id));
      setTabTotal((t) => Math.max(0, t - 1));
      setStats((s) => {
        if (!s) return s;
        const updates: Partial<QualityStats> = { pending: s.pending + (data.reset ?? 0) };
        if (activeTab === 'lowscore') updates.lowScore = Math.max(0, s.lowScore - 1);
        if (activeTab === 'blurry') updates.blurry = Math.max(0, s.blurry - 1);
        return { ...s, ...updates };
      });
      setSuccessCount((n) => (n ?? 0) + 1);
    } finally {
      setResettingIds((prev) => { const s = new Set(prev); s.delete(record.id); return s; });
    }
  }, [activeTab]);

  const handleInitPgvec = async (migrate: boolean) => {
    if (migrate) setMigratingPgvec(true); else setInitingPgvec(true);
    try {
      const res = await fetch('/api/apenados/face/pgvector', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ migrate }),
      });
      const data = await res.json();
      if (data.stats) setPgvec(data.stats);
    } finally {
      setInitingPgvec(false);
      setMigratingPgvec(false);
    }
  };

  const tabCounts: Record<Tab, number> = {
    lowscore: stats?.lowScore ?? 0,
    blurry: stats?.blurry ?? 0,
    pending: stats?.pending ?? 0,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative z-10 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="gradient-sigma px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm">Central de Qualidade Facial</p>
              <p className="text-white/70 text-xs">
                Diagnóstico do pipeline ArcFace · buffalo_l · HNSW pgvector
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-sigma-600 animate-spin" />
            </div>
          )}

          {!loading && stats && (
            <>
              {/* Stats cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="card p-4 text-center">
                  <p className="text-2xl font-bold text-sigma-600">{stats.indexed.toLocaleString('pt-BR')}</p>
                  <p className="text-xs text-subtle mt-1">Indexados</p>
                </div>
                <div className="card p-4 text-center">
                  <p className={`text-2xl font-bold ${stats.lowScore > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {stats.lowScore.toLocaleString('pt-BR')}
                  </p>
                  <p className="text-xs text-subtle mt-1">Score baixo (&lt;50%)</p>
                </div>
                <div className="card p-4 text-center">
                  <p className={`text-2xl font-bold ${stats.blurry > 0 ? 'text-orange-500' : 'text-green-600'}`}>
                    {stats.blurry.toLocaleString('pt-BR')}
                  </p>
                  <p className="text-xs text-subtle mt-1">Borradas indexadas</p>
                </div>
                <div className="card p-4 text-center">
                  <p className={`text-2xl font-bold ${stats.noFace > 0 ? 'text-yellow-500' : 'text-green-600'}`}>
                    {stats.noFace.toLocaleString('pt-BR')}
                  </p>
                  <p className="text-xs text-subtle mt-1">Sem rosto</p>
                </div>
                <div className="card p-4 text-center">
                  <p className={`text-2xl font-bold ${stats.pending > 0 ? 'text-blue-500' : 'text-green-600'}`}>
                    {stats.pending.toLocaleString('pt-BR')}
                  </p>
                  <p className="text-xs text-subtle mt-1">Aguardando indexação</p>
                </div>
                <div className="card p-4 text-center">
                  <p className="text-2xl font-bold text-gray-500">{stats.total.toLocaleString('pt-BR')}</p>
                  <p className="text-xs text-subtle mt-1">Total com foto</p>
                </div>
              </div>

              {/* pgvector status */}
              <div className={`rounded-xl border p-4 ${pgvec?.available ? 'border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-900/10' : 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30'}`}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <Database className={`w-5 h-5 ${pgvec?.available ? 'text-teal-600 dark:text-teal-400' : 'text-gray-400'}`} />
                    <div>
                      <p className="text-sm font-semibold text-title">
                        pgvector {pgvec?.available ? '— Ativo' : '— Não configurado'}
                      </p>
                      {pgvec?.available ? (
                        <p className="text-xs text-subtle">
                          {pgvec.vectorCount.toLocaleString('pt-BR')} vetores · índice HNSW {pgvec.indexExists ? 'ativo' : 'ausente'}
                        </p>
                      ) : (
                        <p className="text-xs text-subtle">
                          Busca facial usa varredura em memória. Ative pgvector para busca SQL indexada.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {!pgvec?.available && (
                      <button
                        onClick={() => handleInitPgvec(false)}
                        disabled={initingPgvec}
                        className="flex items-center gap-1.5 text-xs font-medium text-teal-700 dark:text-teal-300 border border-teal-300 dark:border-teal-700 hover:bg-teal-50 dark:hover:bg-teal-900/30 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {initingPgvec ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                        Inicializar
                      </button>
                    )}
                    {pgvec?.available && pgvec.vectorCount < stats.indexed && (
                      <button
                        onClick={() => handleInitPgvec(true)}
                        disabled={migratingPgvec}
                        className="flex items-center gap-1.5 text-xs font-medium text-sigma-700 dark:text-sigma-300 border border-sigma-300 dark:border-sigma-700 hover:bg-sigma-50 dark:hover:bg-sigma-900/30 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {migratingPgvec ? <Loader2 className="w-3 h-3 animate-spin" /> : <Layers className="w-3 h-3" />}
                        Migrar {(stats.indexed - pgvec.vectorCount).toLocaleString('pt-BR')} embeddings
                      </button>
                    )}
                    <button
                      onClick={fetchStats}
                      className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-body rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      title="Atualizar"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Success banner */}
              {successCount !== null && (
                <div className="flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
                  <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <span className="text-xs text-green-700 dark:text-green-400 font-medium">
                    {successCount} registro{successCount !== 1 ? 's' : ''} marcado{successCount !== 1 ? 's' : ''} para re-indexação.
                  </span>
                  <button onClick={() => setSuccessCount(null)} className="ml-auto text-green-400 hover:text-green-600 text-xs">✕</button>
                </div>
              )}

              {/* Tabs */}
              <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
                {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => handleTabChange(tab)}
                    className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg transition-all ${
                      activeTab === tab
                        ? 'bg-white dark:bg-gray-700 text-title shadow-sm'
                        : 'text-subtle hover:text-body'
                    }`}
                  >
                    {TAB_LABELS[tab]}
                    {tabCounts[tab] > 0 && (
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none ${
                        activeTab === tab
                          ? 'bg-sigma-100 dark:bg-sigma-900/40 text-sigma-700 dark:text-sigma-300'
                          : 'bg-gray-200 dark:bg-gray-700 text-subtle'
                      }`}>
                        {tabCounts[tab].toLocaleString('pt-BR')}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Records grid */}
              {records.length === 0 && !loading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                  <CheckCircle className="w-12 h-12 text-green-500" />
                  <p className="font-semibold text-title text-sm">
                    {activeTab === 'pending' ? 'Todas as fotos estão indexadas!' : 'Nenhum registro nesta categoria.'}
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-subtle">
                    {activeTab === 'lowscore' && 'Rostos detectados com confiança abaixo de 50% — possivelmente mal iluminados, ocluídos ou de lado. Re-indexar após melhorar a foto.'}
                    {activeTab === 'blurry' && 'Fotos indexadas com qualidade Laplacian abaixo de 50 — embora o rosto tenha sido detectado, o embedding pode ser impreciso.'}
                    {activeTab === 'pending' && 'Fotos sem embedding ArcFace — aguardando próxima execução do job de indexação.'}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {records.map((record) => {
                      const isResetting = resettingIds.has(record.id);
                      const ds = detScoreInfo(record.detScore);
                      const qi = qualityInfo(record.photoQuality);
                      return (
                        <div key={record.id} className="relative rounded-xl overflow-hidden border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex flex-col">
                          <div className="aspect-square bg-gray-200 dark:bg-gray-700 relative overflow-hidden">
                            {record.photoPath ? (
                              <img
                                src={`/api/apenados/${record.id}/foto`}
                                alt={record.name}
                                loading="lazy"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <span className="text-2xl font-bold text-gray-400">{record.name.charAt(0)}</span>
                              </div>
                            )}
                            {isResetting && (
                              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                <Loader2 className="w-6 h-6 text-white animate-spin" />
                              </div>
                            )}
                            {/* Badges */}
                            {activeTab !== 'pending' && record.detScore !== null && (
                              <div className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold leading-none text-white pointer-events-none ${ds.cls}`}>
                                {ds.label}
                              </div>
                            )}
                            <div className={`absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold leading-none text-white pointer-events-none ${qi.cls}`}>
                              {qi.label}
                            </div>
                            {/* Name overlay */}
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-2">
                              <p className="text-white text-[10px] font-bold leading-tight truncate">{record.name}</p>
                              {record.matricula && (
                                <p className="text-white/60 text-[9px] font-mono leading-tight truncate">{record.matricula}</p>
                              )}
                            </div>
                          </div>
                          {/* Re-index button (only for lowscore and blurry) */}
                          {activeTab !== 'pending' && (
                            <button
                              onClick={() => handleReindex(record)}
                              disabled={isResetting}
                              title="Resetar para re-indexação"
                              className="flex items-center justify-center gap-1 py-1.5 text-[10px] font-medium text-sigma-600 hover:bg-sigma-50 dark:hover:bg-sigma-900/20 transition-colors border-t border-gray-100 dark:border-gray-800 disabled:opacity-40"
                            >
                              <RotateCcw className="w-3 h-3" /> Re-indexar
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {records.length < tabTotal && <div ref={sentinelRef} className="h-4 mt-2" />}
                  {loadingMore && (
                    <div className="flex justify-center py-4">
                      <Loader2 className="w-5 h-5 text-sigma-600 animate-spin" />
                    </div>
                  )}
                  {records.length >= tabTotal && tabTotal > 0 && (
                    <p className="text-center text-xs text-subtle mt-2">
                      {tabTotal.toLocaleString('pt-BR')} registro{tabTotal !== 1 ? 's' : ''} exibido{tabTotal !== 1 ? 's' : ''}
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
