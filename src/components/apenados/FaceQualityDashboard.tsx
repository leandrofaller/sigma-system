'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, Activity, Loader2, RefreshCw, RotateCcw, CheckCircle,
  AlertTriangle, Zap, Database, Eye, Layers, Trash2, CheckSquare, Square, FileImage
} from 'lucide-react';

interface QualityStats {
  total: number;
  indexed: number;
  noFace: number;
  noFaceDoc: number;
  noFaceTattoo: number;
  noFaceOther: number;
  faceMissed: number;
  classified: number;
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
  photoCategory?: string | null;
  photoCategoryConf?: number | null;
  photoCategoryReason?: string | null;
}

interface ClassificationState {
  isRunning: boolean;
  progress: {
    current: number;
    total: number;
    classified: number;
    errors: number;
    byCategory: Record<string, number>;
  };
  error: string;
  mode: string;
}

interface PgVectorStats {
  available: boolean;
  vectorCount: number;
  indexExists: boolean;
}

type Tab = 'lowscore' | 'blurry' | 'pending' | 'face_missed' | 'noface_doc' | 'noface_tattoo' | 'noface';

interface Props {
  onClose: () => void;
  defaultTab?: Tab;
  onPhotosRemoved?: (ids: string[]) => void;
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
  face_missed: 'Rosto não indexado',
  noface_doc: 'Documentos',
  noface_tattoo: 'Tatuagens',
  noface: 'Outras Sem Rosto',
};

const CATEGORY_LABELS: Record<string, string> = {
  FACE_OK: 'Rosto OK',
  FACE_MISSED: 'Rosto detectado',
  DOCUMENT: 'Documento',
  TATTOO: 'Tatuagem',
  BODY: 'Corpo',
  NO_FACE: 'Sem rosto',
};

export function FaceQualityDashboard({ onClose, defaultTab = 'lowscore', onPhotosRemoved }: Props) {
  const [stats, setStats] = useState<QualityStats | null>(null);
  const [pgvec, setPgvec] = useState<PgVectorStats | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
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

  // Estados de seleção múltipla para exclusão (aba noface)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectAllGlobally, setSelectAllGlobally] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [removedCount, setRemovedCount] = useState<number | null>(null);
  const [classification, setClassification] = useState<ClassificationState | null>(null);
  const [classifying, setClassifying] = useState(false);

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
      if (qData.classification) setClassification(qData.classification);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  const startClassification = useCallback(async (mode: 'none_only' | 'all' | 'stale' = 'none_only') => {
    setClassifying(true);
    try {
      const res = await fetch('/api/apenados/face/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || 'Erro ao iniciar classificação');
        return;
      }
      const poll = setInterval(async () => {
        const st = await fetch('/api/apenados/face/classify');
        const data = await st.json();
        setClassification(data);
        if (!data.isRunning) {
          clearInterval(poll);
          setClassifying(false);
          fetchStats();
        }
      }, 3000);
    } finally {
      setClassifying(false);
    }
  }, [fetchStats]);

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
    setSelected(new Set());
    setSelectAllGlobally(false);
    setRemovedCount(null);
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

  const toggleSelect = (id: string) => {
    setSelectAllGlobally(false);
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const toggleAll = () => {
    if (selected.size === records.length || selectAllGlobally) {
      setSelected(new Set());
      setSelectAllGlobally(false);
    } else {
      setSelected(new Set(records.map((r) => r.id)));
    }
  };

  const handleRemove = async () => {
    if (selected.size === 0 && !selectAllGlobally) return;
    setRemoving(true);
    try {
      const payload = selectAllGlobally
        ? { all: true, tab: activeTab }
        : { ids: Array.from(selected) };

      const res = await fetch('/api/apenados/no-face', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || 'Erro ao remover fotos.');
        return;
      }
      const d = await res.json();
      const countRemoved = selectAllGlobally ? tabTotal : d.updated ?? selected.size;

      setRemovedCount(countRemoved);
      if (selectAllGlobally) {
        setRecords([]);
        setTabTotal(0);
      } else {
        setRecords((prev) => prev.filter((r) => !selected.has(r.id)));
        setTabTotal((t) => Math.max(0, t - countRemoved));
      }

      setStats((s) => {
        if (!s) return s;
        const isNoFace = activeTab === 'noface' || activeTab === 'noface_doc' || activeTab === 'noface_tattoo';
        return {
          ...s,
          noFace: isNoFace ? Math.max(0, s.noFace - countRemoved) : s.noFace,
          total: Math.max(0, s.total - countRemoved),
          noFaceDoc: activeTab === 'noface_doc' ? Math.max(0, s.noFaceDoc - countRemoved) : s.noFaceDoc,
          noFaceTattoo: activeTab === 'noface_tattoo' ? Math.max(0, s.noFaceTattoo - countRemoved) : s.noFaceTattoo,
          noFaceOther: activeTab === 'noface' ? Math.max(0, s.noFaceOther - countRemoved) : s.noFaceOther,
          lowScore: activeTab === 'lowscore' ? Math.max(0, s.lowScore - countRemoved) : s.lowScore,
          blurry: activeTab === 'blurry' ? Math.max(0, s.blurry - countRemoved) : s.blurry,
          pending: activeTab === 'pending' ? Math.max(0, s.pending - countRemoved) : s.pending,
        };
      });

      if (onPhotosRemoved && !selectAllGlobally) {
        onPhotosRemoved(Array.from(selected));
      }
      setSelected(new Set());
      setSelectAllGlobally(false);
      setShowConfirm(false);
    } finally {
      setRemoving(false);
    }
  };

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
        const count = data.reset ?? 1;
        const updates: Partial<QualityStats> = {
          pending: activeTab === 'pending' ? s.pending : s.pending + count
        };
        if (activeTab === 'lowscore') updates.lowScore = Math.max(0, s.lowScore - count);
        if (activeTab === 'blurry') updates.blurry = Math.max(0, s.blurry - count);
        if (activeTab === 'face_missed') updates.faceMissed = Math.max(0, s.faceMissed - count);
        if (activeTab === 'noface_doc') {
          updates.noFaceDoc = Math.max(0, s.noFaceDoc - count);
          updates.noFace = Math.max(0, s.noFace - count);
        }
        if (activeTab === 'noface_tattoo') {
          updates.noFaceTattoo = Math.max(0, s.noFaceTattoo - count);
          updates.noFace = Math.max(0, s.noFace - count);
        }
        if (activeTab === 'noface') {
          updates.noFaceOther = Math.max(0, s.noFaceOther - count);
          updates.noFace = Math.max(0, s.noFace - count);
        }
        return { ...s, ...updates };
      });
      setSuccessCount((n) => (n ?? 0) + 1);
    } finally {
      setResettingIds((prev) => { const s = new Set(prev); s.delete(record.id); return s; });
    }
  }, [activeTab]);

  const handleReindexSelected = useCallback(async () => {
    if (selected.size === 0 && !selectAllGlobally) return;
    const ids = Array.from(selected);
    
    if (!selectAllGlobally) {
      setResettingIds((prev) => new Set([...prev, ...ids]));
    }
    
    try {
      const payload = selectAllGlobally
        ? { all: true, tab: activeTab }
        : { ids };

      const res = await fetch('/api/apenados/face/quality/reindex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return;
      const data = await res.json();
      const countReindexed = selectAllGlobally ? tabTotal : ids.length;
      
      if (selectAllGlobally) {
        setRecords([]);
        setTabTotal(0);
      } else {
        setRecords((prev) => prev.filter((r) => !selected.has(r.id)));
        setTabTotal((t) => Math.max(0, t - countReindexed));
      }
      
      setStats((s) => {
        if (!s) return s;
        const count = selectAllGlobally ? tabTotal : countReindexed;
        const updates: Partial<QualityStats> = {
          pending: activeTab === 'pending' ? s.pending : s.pending + (data.reset ?? count)
        };
        if (activeTab === 'lowscore') updates.lowScore = Math.max(0, s.lowScore - count);
        if (activeTab === 'blurry') updates.blurry = Math.max(0, s.blurry - count);
        if (activeTab === 'face_missed') updates.faceMissed = Math.max(0, s.faceMissed - count);
        if (activeTab === 'noface_doc') {
          updates.noFaceDoc = Math.max(0, s.noFaceDoc - count);
          updates.noFace = Math.max(0, s.noFace - count);
        }
        if (activeTab === 'noface_tattoo') {
          updates.noFaceTattoo = Math.max(0, s.noFaceTattoo - count);
          updates.noFace = Math.max(0, s.noFace - count);
        }
        if (activeTab === 'noface') {
          updates.noFaceOther = Math.max(0, s.noFaceOther - count);
          updates.noFace = Math.max(0, s.noFace - count);
        }
        return { ...s, ...updates };
      });
      setSuccessCount((n) => (n ?? 0) + countReindexed);
      setSelected(new Set());
      setSelectAllGlobally(false);
    } finally {
      if (!selectAllGlobally) {
        setResettingIds((prev) => {
          const s = new Set(prev);
          ids.forEach(id => s.delete(id));
          return s;
        });
      }
    }
  }, [selected, activeTab, selectAllGlobally, tabTotal]);

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

  const allSelected = records.length > 0 && selected.size === records.length;
  const someSelected = selected.size > 0 && !allSelected;
  const isNoFaceTab = activeTab === 'noface' || activeTab === 'noface_doc' || activeTab === 'noface_tattoo';
  const isDeletionTab = isNoFaceTab;

  const tabCounts: Record<Tab, number> = {
    lowscore: stats?.lowScore ?? 0,
    blurry: stats?.blurry ?? 0,
    pending: stats?.pending ?? 0,
    face_missed: stats?.faceMissed ?? 0,
    noface_doc: stats?.noFaceDoc ?? 0,
    noface_tattoo: stats?.noFaceTattoo ?? 0,
    noface: stats?.noFaceOther ?? 0,
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

              {/* Classificação inteligente */}
              <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-900/10 p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold text-title">Classificação de fotos (OCR + tatuagem + rosto)</p>
                    <p className="text-xs text-subtle mt-1">
                      {stats.classified.toLocaleString('pt-BR')} classificadas ·{' '}
                      {stats.faceMissed.toLocaleString('pt-BR')} com rosto não indexado (falsos negativos)
                    </p>
                    {classification?.isRunning && (
                      <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-2 font-medium">
                        Processando {classification.progress.current.toLocaleString('pt-BR')} / {classification.progress.total.toLocaleString('pt-BR')}
                        {' '}· {classification.progress.classified.toLocaleString('pt-BR')} ok
                      </p>
                    )}
                    {classification?.error && (
                      <p className="text-xs text-red-500 mt-1">{classification.error}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => startClassification('none_only')}
                      disabled={classifying || classification?.isRunning}
                      className="flex items-center gap-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {(classifying || classification?.isRunning) ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                      Classificar sem rosto
                    </button>
                    <button
                      onClick={() => startClassification('stale')}
                      disabled={classifying || classification?.isRunning}
                      className="text-xs font-medium text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                      Reclassificar pendentes
                    </button>
                  </div>
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
              <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 overflow-x-auto">
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

              {/* Toolbar global de seleção */}
              {!loading && records.length > 0 && (
                <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 dark:bg-gray-800/30 rounded-xl border border-gray-100 dark:border-gray-800 flex-shrink-0">
                  <button
                    onClick={toggleAll}
                    className="flex items-center gap-2 text-xs font-medium text-body hover:text-title transition-colors"
                  >
                    {allSelected ? (
                      <CheckSquare className="w-4 h-4 text-sigma-600" />
                    ) : someSelected ? (
                      <CheckSquare className="w-4 h-4 text-sigma-400" />
                    ) : (
                      <Square className="w-4 h-4 text-gray-400" />
                    )}
                    {allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
                  </button>
                  <span className="text-gray-300 dark:text-gray-600">|</span>
                  <span className="text-xs text-subtle">
                    {selectAllGlobally 
                      ? `Todos os ${tabTotal.toLocaleString('pt-BR')} registros selecionados`
                      : selected.size > 0 
                        ? `${selected.size} selecionado${selected.size !== 1 ? 's' : ''}` 
                        : 'Nenhum selecionado'}
                  </span>
                  {selected.size > 0 && (
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        onClick={handleReindexSelected}
                        disabled={resettingIds.size > 0}
                        className="flex items-center gap-1.5 text-xs font-semibold text-white bg-sigma-600 hover:bg-sigma-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {resettingIds.size > 0 ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3.5 h-3.5" />
                        )}
                        Re-indexar {selectAllGlobally ? tabTotal.toLocaleString('pt-BR') : selected.size} registro{selected.size !== 1 || selectAllGlobally ? 's' : ''}
                      </button>
                      {isDeletionTab && (
                        <button
                          onClick={() => setShowConfirm(true)}
                          className="flex items-center gap-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remover {selectAllGlobally ? tabTotal.toLocaleString('pt-BR') : selected.size} foto{selected.size !== 1 || selectAllGlobally ? 's' : ''}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Banner de seleção global (estilo Gmail) */}
              {!loading && selected.size === records.length && tabTotal > records.length && (
                <div className="bg-sigma-50 dark:bg-sigma-950/30 border border-sigma-200 dark:border-sigma-800/80 px-4 py-2.5 rounded-xl text-center text-xs flex items-center justify-center gap-2 transition-all flex-shrink-0">
                  <span>
                    {selectAllGlobally ? (
                      <>
                        Todos os <strong>{tabTotal.toLocaleString('pt-BR')}</strong> registros de <strong>{TAB_LABELS[activeTab]}</strong> estão selecionados.
                      </>
                    ) : (
                      <>
                        Todos os <strong>{records.length}</strong> registros desta página estão selecionados.
                      </>
                    )}
                  </span>
                  <button
                    onClick={() => setSelectAllGlobally(!selectAllGlobally)}
                    className="text-sigma-600 dark:text-sigma-400 font-bold hover:underline"
                  >
                    {selectAllGlobally 
                      ? "Limpar seleção" 
                      : `Selecionar todos os ${tabTotal.toLocaleString('pt-BR')} registros de ${TAB_LABELS[activeTab]}`}
                  </button>
                </div>
              )}

              {/* Banner de sucesso na deleção */}
              {removedCount !== null && (
                <div className="px-4 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl flex items-center gap-2 flex-shrink-0">
                  <span className="text-green-700 dark:text-green-400 text-xs font-medium">
                    {removedCount} foto{removedCount !== 1 ? 's removidas' : ' removida'} com sucesso.
                  </span>
                  <button onClick={() => setRemovedCount(null)} className="ml-auto text-green-500 hover:text-green-700 text-xs">✕</button>
                </div>
              )}

              {/* Records grid */}
              {records.length === 0 && !loading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                  {isNoFaceTab ? (
                    <>
                      <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-3">
                        <FileImage className="w-8 h-8 text-green-500" />
                      </div>
                      <p className="font-semibold text-title text-sm">Nenhuma foto suspeita encontrada</p>
                      <p className="text-subtle text-xs mt-1">Todas as fotos com rosto foram corretamente indexadas.</p>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-12 h-12 text-green-500" />
                      <p className="font-semibold text-title text-sm">
                        {activeTab === 'pending' ? 'Todas as fotos estão indexadas!' : 'Nenhum registro nesta categoria.'}
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-xs text-subtle">
                    {activeTab === 'lowscore' && 'Rostos detectados com confiança abaixo de 50% — possivelmente mal iluminados, ocluídos ou de lado. Re-indexar após melhorar a foto.'}
                    {activeTab === 'blurry' && 'Fotos indexadas com qualidade Laplacian abaixo de 50 — embora o rosto tenha sido detectado, o embedding pode ser impreciso.'}
                    {activeTab === 'pending' && 'Fotos sem embedding ArcFace — aguardando próxima execução do job de indexação.'}
                    {activeTab === 'face_missed' && 'O classificador detectou rosto, mas o indexador ArcFace marcou como sem rosto. Use Re-indexar — não remova.'}
                    {activeTab === 'noface_doc' && 'Documentos detectados por OCR e análise visual. Revise e remova manualmente se desejar.'}
                    {activeTab === 'noface_tattoo' && 'Tatuagens e fotos de partes do corpo (sem rosto). Revise e remova manualmente se desejar.'}
                    {activeTab === 'noface' && 'Imagens sem rosto que não se encaixam nas outras categorias. Revise antes de remover.'}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {records.map((record) => {
                      const isResetting = resettingIds.has(record.id);
                      const isSelected = selected.has(record.id);
                      const ds = detScoreInfo(record.detScore);
                      const qi = qualityInfo(record.photoQuality);

                      return (
                        <div
                          key={record.id}
                          onClick={() => {
                            toggleSelect(record.id);
                          }}
                          className={`relative rounded-xl overflow-hidden border-2 bg-gray-50 dark:bg-gray-800/50 flex flex-col transition-all cursor-pointer ${
                            isSelected
                              ? 'border-sigma-500 shadow-lg shadow-sigma-500/20'
                              : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600'
                          }`}
                        >
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
                            {/* Badges empilhados no canto superior esquerdo */}
                            <div className="absolute top-1.5 left-1.5 flex flex-col gap-1 pointer-events-none z-10">
                              {activeTab !== 'pending' && !isNoFaceTab && record.detScore !== null && (
                                <div className={`px-1.5 py-0.5 rounded text-[9px] font-bold leading-none text-white ${ds.cls}`}>
                                  {ds.label}
                                </div>
                              )}
                              {record.photoQuality !== null && (
                                <div className={`px-1.5 py-0.5 rounded text-[9px] font-bold leading-none text-white ${qi.cls}`}>
                                  {qi.label}
                                </div>
                              )}
                              {record.photoCategory && (
                                <div className="px-1.5 py-0.5 rounded text-[9px] font-bold leading-none text-white bg-indigo-600/90 max-w-[90px] truncate">
                                  {CATEGORY_LABELS[record.photoCategory] ?? record.photoCategory}
                                </div>
                              )}
                            </div>

                            {/* Checkbox de seleção */}
                            <div className={`absolute top-1.5 right-1.5 w-5 h-5 rounded flex items-center justify-center transition-all z-10 ${
                              isSelected ? 'bg-sigma-600' : 'bg-black/40 hover:bg-black/60'
                            }`}>
                              {isSelected ? (
                                <CheckSquare className="w-3.5 h-3.5 text-white" />
                              ) : (
                                <Square className="w-3.5 h-3.5 text-white/70" />
                              )}
                            </div>

                            {/* Name overlay */}
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-2">
                              <p className="text-white text-[10px] font-bold leading-tight truncate">{record.name}</p>
                              {record.matricula && (
                                <p className="text-white/60 text-[9px] font-mono leading-tight truncate">{record.matricula}</p>
                              )}
                            </div>
                          </div>
                          {record.photoCategoryReason && (
                            <p className="px-2 py-1 text-[9px] text-subtle border-t border-gray-100 dark:border-gray-800 line-clamp-2" title={record.photoCategoryReason}>
                              {record.photoCategoryReason}
                            </p>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReindex(record);
                            }}
                            disabled={isResetting}
                            title="Resetar para re-indexação"
                            className="flex items-center justify-center gap-1 py-1.5 text-[10px] font-medium text-sigma-600 hover:bg-sigma-50 dark:hover:bg-sigma-900/20 transition-colors border-t border-gray-100 dark:border-gray-800 disabled:opacity-40"
                          >
                            <RotateCcw className="w-3 h-3" /> Re-indexar
                          </button>
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

      {/* Confirm dialog para deleção em massa */}
      {showConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowConfirm(false)} />
          <div className="relative z-10 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-gray-100 dark:border-gray-800">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="font-bold text-title text-sm">Remover {selected.size} foto{selected.size !== 1 ? 's' : ''}?</p>
                <p className="text-subtle text-xs mt-1">
                  Os arquivos serão deletados do disco. Os registros dos apenados serão mantidos sem foto.
                  Esta ação não pode ser desfeita.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={removing}
                className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl text-body hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleRemove}
                disabled={removing}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors disabled:opacity-50"
              >
                {removing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {removing ? 'Removendo...' : 'Remover fotos'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
