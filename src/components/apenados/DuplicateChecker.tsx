'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X, ScanSearch, Loader2, Trash2, AlertTriangle, CheckCircle,
  RefreshCw, Users, Fingerprint, Waves, Zap, Clock, UserX,
  RotateCcw, RotateCw, Filter, UserCheck, Pencil, CheckCheck,
} from 'lucide-react';

interface DupRecord {
  id: string;
  name: string;
  matricula: string | null;
  unidade: string | null;
  faccao: string | null;
  photoPath: string | null;
  photoQuality: number | null;
  hasFace: boolean;
  category?: 'doc' | 'tattoo' | 'other';
  hasAip?: boolean;
  hasSipe?: boolean;
  sipeId?: number | null;
  situacao?: string | null;
}

interface DupGroup {
  type: 'exact' | 'similar' | 'face';
  category?: 'doc' | 'tattoo' | 'other';
  records: DupRecord[];
}

type DupPhase = 'idle' | 'indexing' | 'detecting' | 'done';

interface JobState {
  phase: DupPhase;
  indexingCurrent: number;
  indexingTotal: number;
  groups: DupGroup[];
  totalGroups: number;
  totalAnalyzed: number;
  faceGroupsCount: number;
  error: string;
}

interface Props {
  onClose: () => void;
  onPhotoDeleted: (id: string) => void;
}

function qualityInfo(q: number | null): { label: string; color: string; bar: string } {
  if (q === null) return { label: '—', color: 'text-gray-400', bar: 'bg-gray-400' };
  if (q < 50) return { label: 'Borrada', color: 'text-red-600 dark:text-red-400', bar: 'bg-red-500' };
  if (q < 150) return { label: 'Regular', color: 'text-yellow-600 dark:text-yellow-400', bar: 'bg-yellow-500' };
  if (q < 400) return { label: 'Boa', color: 'text-blue-600 dark:text-blue-400', bar: 'bg-blue-500' };
  return { label: 'Nítida', color: 'text-green-600 dark:text-green-400', bar: 'bg-green-500' };
}

function normalizeQuality(q: number | null, max: number, min: number): number {
  if (q === null) return 0;
  if (max === min) return 100;
  return Math.round(((q - min) / (max - min)) * 100);
}

export function DuplicateChecker({ onClose, onPhotoDeleted }: Props) {
  const [jobState, setJobState] = useState<JobState | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeletedCount, setBulkDeletedCount] = useState<number | null>(null);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [inlineError, setInlineError] = useState('');
  const [analyzedAt, setAnalyzedAt] = useState<Date | null>(null);
  const [filterLargeGroups, setFilterLargeGroups] = useState(false);
  const [typeFilter, setTypeFilter] = useState<Set<'exact' | 'similar' | 'face'>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<Set<'doc' | 'tattoo' | 'other'>>(new Set());
  const [dismissedGroups, setDismissedGroups] = useState<Set<string>>(new Set());
  const [showDismissed, setShowDismissed] = useState(false);
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [photoVersions, setPhotoVersions] = useState<Map<string, number>>(new Map());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [displayedGroupCount, setDisplayedGroupCount] = useState(20);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [loadMoreElement, setLoadMoreElement] = useState<HTMLDivElement | null>(null);

  // Load dismissed groups from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('dismissed_dup_groups_v1');
      if (stored) setDismissedGroups(new Set(JSON.parse(stored)));
    } catch {}
  }, []);

  // Reset pagination when scan completes or filters change
  useEffect(() => {
    setDisplayedGroupCount(20);
  }, [jobState?.phase, typeFilter, categoryFilter, filterLargeGroups]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const groupKey = (records: DupRecord[]) => records.map((r) => r.id).sort().join('|');

  const handleDismiss = (group: DupGroup) => {
    const key = groupKey(group.records);
    setDismissedGroups((prev) => {
      const next = new Set(prev);
      next.add(key);
      try { localStorage.setItem('dismissed_dup_groups_v1', JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const handleUndismissAll = () => {
    setDismissedGroups(new Set());
    try { localStorage.removeItem('dismissed_dup_groups_v1'); } catch {}
    setShowDismissed(false);
  };

  const toggleTypeFilter = (t: 'exact' | 'similar' | 'face') => {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  };

  const startPolling = useCallback(() => {
    stopPolling();
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/apenados/duplicates');
        if (!res.ok) return;
        const data: JobState = await res.json();
        setJobState(data);
        if (data.phase !== 'indexing' && data.phase !== 'detecting') {
          stopPolling();
          if (data.phase === 'done') setAnalyzedAt(new Date());
        }
      } catch {}
    }, 1500);
  }, [stopPolling]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/apenados/duplicates');
        if (!res.ok) return;
        const data: JobState = await res.json();
        setJobState(data);
        if (data.phase === 'indexing' || data.phase === 'detecting') startPolling();
        if (data.phase === 'done' && data.totalAnalyzed > 0) setAnalyzedAt(new Date());
      } catch {} finally {
        setLoading(false);
      }
    })();
    return stopPolling;
  }, [startPolling, stopPolling]);

  const handleStart = useCallback(async () => {
    setInlineError('');
    setBulkDeletedCount(null);
    setAnalyzedAt(null);
    try {
      const res = await fetch('/api/apenados/duplicates', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 409) throw new Error(data.error || `Erro ${res.status}`);
      setJobState((prev) =>
        prev
          ? { ...prev, phase: 'indexing', error: '' }
          : { phase: 'indexing', indexingCurrent: 0, indexingTotal: 0, groups: [], totalGroups: 0, totalAnalyzed: 0, faceGroupsCount: 0, error: '' },
      );
      startPolling();
    } catch (err: any) {
      setInlineError(err.message || 'Erro ao iniciar verificação');
    }
  }, [startPolling]);

  const handleDeletePhoto = async (record: DupRecord) => {
    if (!confirm(`Remover foto de "${record.name}"? O registro será mantido.`)) return;
    setDeletingId(record.id);
    try {
      const res = await fetch(`/api/apenados/${record.id}/foto`, { method: 'DELETE' });
      if (!res.ok) { alert('Erro ao remover foto.'); return; }
      setDeletedIds((prev) => new Set([...prev, record.id]));
      onPhotoDeleted(record.id);
    } finally {
      setDeletingId(null);
    }
  };

  const handleRotate = async (record: DupRecord, degrees: 90 | 270) => {
    setRotatingId(record.id);
    try {
      const res = await fetch(`/api/apenados/${record.id}/foto/rotate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ degrees }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Erro ao rotar foto'); return; }
      setPhotoVersions((prev) => {
        const m = new Map(prev);
        m.set(record.id, (m.get(record.id) ?? 0) + 1);
        return m;
      });
      setJobState((prev) =>
        prev
          ? {
              ...prev,
              groups: prev.groups.map((g) => ({
                ...g,
                records: g.records.map((r) =>
                  r.id === record.id ? { ...r, photoQuality: data.photoQuality } : r,
                ),
              })),
            }
          : prev,
      );
    } finally {
      setRotatingId(null);
    }
  };

  const handleRenameStart = (record: DupRecord) => {
    setRenamingId(record.id);
    setRenameValue(record.name);
  };

  const handleRenameCancel = () => {
    setRenamingId(null);
    setRenameValue('');
  };

  const handleRenameSave = async (record: DupRecord) => {
    const trimmed = renameValue.trim().toUpperCase();
    if (!trimmed || trimmed === record.name) { handleRenameCancel(); return; }
    try {
      const res = await fetch(`/api/apenados/${record.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || 'Erro ao renomear'); return; }
      setJobState((prev) =>
        prev
          ? {
              ...prev,
              groups: prev.groups.map((g) => ({
                ...g,
                records: g.records.map((r) => (r.id === record.id ? { ...r, name: trimmed } : r)),
              })),
            }
          : prev,
      );
    } finally {
      handleRenameCancel();
    }
  };

  const handleBulkDelete = async () => {
    setShowBulkConfirm(false);
    setBulkDeleting(true);
    setInlineError('');
    try {
      const idsToDelete = activeGroups.flatMap((g) => g.records.slice(1).map((r) => r.id));
      const merges = activeGroups.flatMap((g) => {
        const keepId = g.records[0].id;
        return g.records.slice(1).map((r) => ({
          idToDelete: r.id,
          keepId,
        }));
      });

      const res = await fetch('/api/apenados/duplicates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idsToDelete, merges }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao excluir registros');
      const newDeleted = new Set(deletedIds);
      idsToDelete.forEach((id) => newDeleted.add(id));
      setDeletedIds(newDeleted);
      setBulkDeletedCount(data.deleted);
    } catch (err: any) {
      setInlineError(err.message);
    } finally {
      setBulkDeleting(false);
    }
  };

  const allActiveGroups = (jobState?.groups ?? [])
    .map((g) => ({ ...g, records: g.records.filter((r) => !deletedIds.has(r.id)) }))
    .filter((g) => g.records.length >= 2);

  // Split dismissed vs visible
  const undismissedGroups = allActiveGroups.filter((g) => !dismissedGroups.has(groupKey(g.records)));
  const dismissedVisibleGroups = allActiveGroups.filter((g) => dismissedGroups.has(groupKey(g.records)));

  // Apply type filter
  const typeFilteredGroups = typeFilter.size === 0
    ? undismissedGroups
    : undismissedGroups.filter((g) => typeFilter.has(g.type));

  // Apply category filter
  const categoryFilteredGroups = categoryFilter.size === 0
    ? typeFilteredGroups
    : typeFilteredGroups.filter((g) => g.category && categoryFilter.has(g.category));

  const hiddenLargeCount = filterLargeGroups ? categoryFilteredGroups.filter((g) => g.records.length > 3).length : 0;
  const activeGroups = filterLargeGroups
    ? categoryFilteredGroups.filter((g) => g.records.length <= 3)
    : categoryFilteredGroups;

  // IntersectionObserver: load more groups when sentinel is visible
  useEffect(() => {
    if (!loadMoreElement) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setDisplayedGroupCount((n) => n + 20);
    }, { rootMargin: '300px' });
    obs.observe(loadMoreElement);
    return () => obs.disconnect();
  }, [loadMoreElement]);

  const pendingDeleteCount = activeGroups.reduce((sum, g) => sum + g.records.length - 1, 0);
  const isRunning = jobState?.phase === 'indexing' || jobState?.phase === 'detecting';
  const isDone = jobState?.phase === 'done';
  const hasResults = isDone && (jobState?.totalAnalyzed ?? 0) > 0;
  const indexProgress =
    jobState && jobState.indexingTotal > 0
      ? Math.round((jobState.indexingCurrent / jobState.indexingTotal) * 100)
      : 0;

  return createPortal(
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
              <ScanSearch className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm">Verificação de Duplicatas</p>
              <p className="text-white/70 text-xs">
                SHA-256 · dHash · detecta cópias exatas e fotos similares · preserva melhor qualidade
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Loading initial */}
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-sigma-600 animate-spin" />
            </div>
          )}

          {/* Idle / Start screen */}
          {!loading && !isRunning && !hasResults && (
            <div className="flex flex-col items-center justify-center py-12 gap-5 text-center">
              <div className="w-20 h-20 bg-sigma-50 dark:bg-sigma-900/20 rounded-full flex items-center justify-center">
                <ScanSearch className="w-10 h-10 text-sigma-500" />
              </div>
              <div className="max-w-sm">
                <p className="text-title font-semibold text-lg">Verificar fotos duplicadas</p>
                <p className="text-subtle text-sm mt-1">
                  Indexa automaticamente todas as fotos não analisadas, depois detecta cópias exatas
                  (SHA-256) e fotos visualmente similares (dHash). A foto de maior nitidez em cada
                  grupo é marcada para preservação.
                </p>
              </div>

              {(jobState?.error || inlineError) && (
                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl max-w-sm text-left">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700 dark:text-red-400">
                    {inlineError || jobState?.error}
                  </p>
                </div>
              )}

              <button
                onClick={handleStart}
                className="flex items-center gap-2 bg-sigma-600 hover:bg-sigma-700 text-white px-6 py-3 rounded-xl font-semibold transition-colors shadow-lg shadow-sigma-600/20"
              >
                <ScanSearch className="w-4 h-4" /> Iniciar verificação
              </button>
            </div>
          )}

          {/* Running: indexing or detecting */}
          {!loading && isRunning && (
            <div className="flex flex-col items-center justify-center py-16 gap-5 text-center">
              <Loader2 className="w-12 h-12 text-sigma-600 animate-spin" />

              {jobState?.phase === 'indexing' && (
                <div className="w-full max-w-xs space-y-3">
                  <div>
                    <p className="text-title font-semibold">Indexando fotos...</p>
                    <p className="text-subtle text-sm mt-1">
                      Calculando SHA-256 + dHash + nitidez · 4 workers paralelos
                    </p>
                  </div>
                  {jobState.indexingTotal > 0 ? (
                    <>
                      <div className="flex justify-between text-xs text-subtle">
                        <span>
                          {jobState.indexingCurrent.toLocaleString('pt-BR')} /{' '}
                          {jobState.indexingTotal.toLocaleString('pt-BR')}
                        </span>
                        <span>{indexProgress}%</span>
                      </div>
                      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-sigma-600 rounded-full transition-all duration-500"
                          style={{ width: `${indexProgress}%` }}
                        />
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-subtle">Todas as fotos já estão indexadas · iniciando detecção...</p>
                  )}
                </div>
              )}

              {jobState?.phase === 'detecting' && (
                <div>
                  <p className="text-title font-semibold">Detectando grupos...</p>
                  <p className="text-subtle text-sm mt-1">
                    SHA-256 + dHash LSH · Hamming ≤ 12 bits
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Results */}
          {!loading && hasResults && (
            <div className="space-y-5">

              {/* Status bar */}
              <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400 font-medium">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Análise concluída
                </div>
                {analyzedAt && (
                  <div className="flex items-center gap-1.5 text-xs text-subtle">
                    <Clock className="w-3.5 h-3.5" />
                    {analyzedAt.toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </div>
                )}
                <div className="ml-auto flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                  <Zap className="w-3.5 h-3.5" />
                  SHA-256 · dHash · ArcFace · {jobState!.totalAnalyzed.toLocaleString('pt-BR')} fotos
                </div>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="card p-4 text-center">
                  <p className="text-2xl font-bold text-sigma-600">
                    {jobState!.totalAnalyzed.toLocaleString('pt-BR')}
                  </p>
                  <p className="text-xs text-subtle mt-1">Fotos analisadas</p>
                </div>
                <div className="card p-4 text-center">
                  <p
                    className={`text-2xl font-bold ${
                      activeGroups.filter((g) => g.type === 'exact').length > 0
                        ? 'text-red-600'
                        : 'text-green-600'
                    }`}
                  >
                    {activeGroups.filter((g) => g.type === 'exact').length}
                  </p>
                  <p className="text-xs text-subtle mt-1">Grupos idênticos</p>
                </div>
                <div className="card p-4 text-center">
                  <p
                    className={`text-2xl font-bold ${
                      activeGroups.filter((g) => g.type === 'similar').length > 0
                        ? 'text-orange-500'
                        : 'text-green-600'
                    }`}
                  >
                    {activeGroups.filter((g) => g.type === 'similar').length}
                  </p>
                  <p className="text-xs text-subtle mt-1">Grupos similares</p>
                </div>
                <div className="card p-4 text-center">
                  <p
                    className={`text-2xl font-bold ${
                      activeGroups.filter((g) => g.type === 'face').length > 0
                        ? 'text-teal-600'
                        : 'text-green-600'
                    }`}
                  >
                    {activeGroups.filter((g) => g.type === 'face').length}
                  </p>
                  <p className="text-xs text-subtle mt-1">Mesmo indivíduo</p>
                </div>
              </div>

              {/* Filters */}
              {undismissedGroups.length > 0 && (
                <div className="space-y-2">
                  {/* Type filter chips */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-subtle mr-1">
                      <Filter className="w-3.5 h-3.5" />
                      <span>Filtrar:</span>
                    </div>
                    {([
                      { key: 'exact' as const, label: 'Idênticas', active: 'bg-red-600 text-white border-red-600', inactive: 'border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20' },
                      { key: 'similar' as const, label: 'Similares', active: 'bg-orange-500 text-white border-orange-500', inactive: 'border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20' },
                      { key: 'face' as const, label: 'Mesmo indivíduo', active: 'bg-teal-600 text-white border-teal-600', inactive: 'border-teal-200 dark:border-teal-800 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20' },
                    ] as const).map(({ key, label, active, inactive }) => {
                      const count = undismissedGroups.filter((g) => g.type === key).length;
                      const isOn = typeFilter.has(key);
                      return (
                        <button
                          key={key}
                          onClick={() => toggleTypeFilter(key)}
                          className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all ${isOn ? active : inactive}`}
                        >
                          {key === 'exact' ? <Fingerprint className="w-3 h-3" /> : key === 'face' ? <UserCheck className="w-3 h-3" /> : <Waves className="w-3 h-3" />}
                          {label}
                          <span className={`px-1 py-0.5 rounded text-[9px] font-bold leading-none ${isOn ? 'bg-white/25' : 'bg-gray-100 dark:bg-gray-700 text-subtle'}`}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                    {typeFilter.size > 0 && (
                      <button
                        onClick={() => setTypeFilter(new Set())}
                        className="text-xs text-subtle hover:text-body transition-colors underline underline-offset-2"
                      >
                        Limpar
                      </button>
                    )}
                    {dismissedVisibleGroups.length > 0 && (
                      <button
                        onClick={() => setShowDismissed((v) => !v)}
                        className="ml-auto flex items-center gap-1.5 text-xs text-subtle hover:text-body transition-colors"
                      >
                        <CheckCheck className="w-3.5 h-3.5 text-green-500" />
                        {dismissedVisibleGroups.length} tratado{dismissedVisibleGroups.length !== 1 ? 's' : ''}
                        {showDismissed ? ' — ocultar' : ' — ver'}
                      </button>
                    )}
                  </div>

                  {/* Category filter chips */}
                  <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 dark:border-gray-800/60 pt-2 mt-2">
                    <div className="flex items-center gap-1.5 text-xs text-subtle mr-1">
                      <Filter className="w-3.5 h-3.5" />
                      <span>Categorias:</span>
                    </div>
                    {([
                      { key: 'doc' as const, label: 'Sem Imagem ou Documento', active: 'bg-red-600 text-white border-red-600', inactive: 'border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20' },
                      { key: 'tattoo' as const, label: 'Tatuagens', active: 'bg-orange-500 text-white border-orange-500', inactive: 'border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20' },
                      { key: 'other' as const, label: 'Com Rosto / Outras', active: 'bg-teal-600 text-white border-teal-600', inactive: 'border-teal-200 dark:border-teal-800 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20' },
                    ] as const).map(({ key, label, active, inactive }) => {
                      const count = undismissedGroups.filter((g) => g.category === key).length;
                      const isOn = categoryFilter.has(key);
                      return (
                        <button
                          key={key}
                          onClick={() => {
                            setCategoryFilter((prev) => {
                              const next = new Set(prev);
                              if (next.has(key)) next.delete(key); else next.add(key);
                              return next;
                            });
                          }}
                          className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all ${isOn ? active : inactive}`}
                        >
                          {label}
                          <span className={`px-1 py-0.5 rounded text-[9px] font-bold leading-none ${isOn ? 'bg-white/25' : 'bg-gray-100 dark:bg-gray-700 text-subtle'}`}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                    {categoryFilter.size > 0 && (
                      <button
                        onClick={() => setCategoryFilter(new Set())}
                        className="text-xs text-subtle hover:text-body transition-colors underline underline-offset-2"
                      >
                        Limpar categorias
                      </button>
                    )}
                  </div>

                  {/* Large groups toggle */}
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2 text-sm text-subtle">
                      <span className="text-xs">Ocultar grupos com mais de 3 fotos</span>
                      {filterLargeGroups && hiddenLargeCount > 0 && (
                        <span className="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full font-medium">
                          {hiddenLargeCount} oculto{hiddenLargeCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => setFilterLargeGroups((v) => !v)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        filterLargeGroups ? 'bg-sigma-600' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                          filterLargeGroups ? 'translate-x-4.5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              )}

              {/* Bulk delete success */}
              {bulkDeletedCount !== null && (
                <div className="flex items-center gap-3 px-4 py-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                  <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                    {bulkDeletedCount} registro{bulkDeletedCount !== 1 ? 's' : ''} excluído
                    {bulkDeletedCount !== 1 ? 's' : ''} com sucesso.
                  </p>
                </div>
              )}

              {/* Inline error */}
              {inlineError && (
                <div className="flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700 dark:text-red-400">{inlineError}</p>
                </div>
              )}

              {/* No duplicates */}
              {activeGroups.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                  <CheckCircle className="w-14 h-14 text-green-500" />
                  <p className="text-title font-semibold">Nenhuma duplicata encontrada</p>
                  <p className="text-subtle text-sm">
                    Todas as {jobState!.totalAnalyzed.toLocaleString('pt-BR')} fotos são únicas.
                  </p>
                </div>
              )}

              {/* Groups */}
              {activeGroups.slice(0, displayedGroupCount).map((group, gi) => {
                const qualities = group.records.map((r) => r.photoQuality ?? 0);
                const groupMax = Math.max(...qualities);
                const groupMin = Math.min(...qualities);
                const borderColor = group.type === 'exact'
                  ? 'border-red-200 dark:border-red-800'
                  : group.type === 'face'
                    ? 'border-teal-200 dark:border-teal-800'
                    : 'border-orange-200 dark:border-orange-800';
                const headerColor = group.type === 'exact'
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                  : group.type === 'face'
                    ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800'
                    : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800';
                const titleColor = group.type === 'exact'
                  ? 'text-red-700 dark:text-red-400'
                  : group.type === 'face'
                    ? 'text-teal-700 dark:text-teal-400'
                    : 'text-orange-700 dark:text-orange-400';

                return (
                  <div
                    key={gi}
                    className={`border ${borderColor} rounded-xl overflow-hidden`}
                  >
                    <div className={`flex items-center gap-2 px-4 py-3 ${headerColor} border-b`}>
                      <Users className={`w-4 h-4 ${titleColor}`} />
                      <span className={`text-sm font-semibold ${titleColor}`}>
                        Grupo {gi + 1} — {group.records.length} registros
                      </span>
                      <span
                        className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          group.type === 'exact'
                            ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                            : group.type === 'face'
                              ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'
                              : 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
                        }`}
                      >
                        {group.type === 'exact' ? (
                          <Fingerprint className="w-3 h-3" />
                        ) : group.type === 'face' ? (
                          <UserCheck className="w-3 h-3" />
                        ) : (
                          <Waves className="w-3 h-3" />
                        )}
                        {group.type === 'exact' ? 'Idênticas' : group.type === 'face' ? 'Mesmo indivíduo' : 'Similares'}
                      </span>
                      {group.category && (
                        <span
                          className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            group.category === 'doc'
                              ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                              : group.category === 'tattoo'
                                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                                : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                          }`}
                        >
                          {group.category === 'doc' ? 'Sem Imagem/Doc' : group.category === 'tattoo' ? 'Tatuagem' : 'Com Rosto'}
                        </span>
                      )}
                      <button
                        onClick={() => handleDismiss(group)}
                        title="Marcar como tratado — não aparece no próximo scan"
                        className="ml-auto flex items-center gap-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 bg-white/60 dark:bg-gray-800/60 hover:bg-green-50 dark:hover:bg-green-900/20 px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 transition-all"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        Tratado
                      </button>
                    </div>
                    <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {group.records.map((record, ri) => {
                        const isKeeper = ri === 0;
                        const qi = qualityInfo(record.photoQuality);
                        const normalized = normalizeQuality(record.photoQuality, groupMax, groupMin);
                        const isDeleting = deletingId === record.id;
                        const isRotating = rotatingId === record.id;
                        const photoVersion = photoVersions.get(record.id) ?? 0;

                        return (
                          <div
                            key={record.id}
                            className={`relative rounded-xl border overflow-hidden bg-gray-50 dark:bg-gray-800/50 flex flex-col ${
                              isKeeper
                                ? 'border-green-300 dark:border-green-700'
                                : 'border-gray-100 dark:border-gray-800'
                            }`}
                          >
                            {isKeeper && (
                              <div className="absolute top-1.5 left-1.5 z-10 bg-green-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                                MANTER
                              </div>
                            )}
                            {record.hasAip ? (
                              <div className={`absolute top-1.5 ${isKeeper ? 'left-16' : 'left-1.5'} z-10 bg-purple-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-sm`}>
                                FICHA ATIVA (AIP)
                              </div>
                            ) : record.hasSipe ? (
                              <div className={`absolute top-1.5 ${isKeeper ? 'left-16' : 'left-1.5'} z-10 bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-sm`}>
                                FICHA SIPE
                              </div>
                            ) : null}
                            {!record.hasFace && (
                              <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-0.5 bg-gray-800/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                                <UserX className="w-2.5 h-2.5" />
                                Sem rosto
                              </div>
                            )}
                            <div className="aspect-square bg-gray-200 dark:bg-gray-700 relative overflow-hidden">
                              {record.photoPath ? (
                                <img
                                  src={`/api/apenados/${record.id}/foto${photoVersion > 0 ? `?v=${photoVersion}` : ''}`}
                                  alt={record.name}
                                  loading="lazy"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <span className="text-2xl font-bold text-gray-400">
                                    {record.name.charAt(0)}
                                  </span>
                                </div>
                              )}
                              {(isDeleting || isRotating) && (
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                                </div>
                              )}
                            </div>
                            <div className="p-2 flex-1 space-y-1">
                              {renamingId === record.id ? (
                                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    autoFocus
                                    value={renameValue}
                                    onChange={(e) => setRenameValue(e.target.value.toUpperCase())}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleRenameSave(record);
                                      if (e.key === 'Escape') handleRenameCancel();
                                    }}
                                    className="flex-1 min-w-0 text-[10px] font-semibold border border-sigma-400 rounded px-1 py-0.5 bg-white dark:bg-gray-800 text-title focus:outline-none"
                                  />
                                  <button
                                    onClick={() => handleRenameSave(record)}
                                    className="text-green-600 hover:text-green-700 flex-shrink-0"
                                    title="Salvar"
                                  >
                                    <CheckCircle className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={handleRenameCancel}
                                    className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                                    title="Cancelar"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 group/name">
                                  <p className="text-xs font-semibold text-title truncate flex-1">
                                    {record.name}
                                  </p>
                                  <button
                                    onClick={() => handleRenameStart(record)}
                                    className="opacity-0 group-hover/name:opacity-100 transition-opacity text-gray-400 hover:text-sigma-600 flex-shrink-0"
                                    title="Renomear"
                                  >
                                    <Pencil className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              )}
                              {record.sipeId && (
                                <p className="text-[9px] text-gray-500 dark:text-gray-400 font-mono font-bold">SIPE ID: #{record.sipeId}</p>
                              )}
                              {record.matricula && (
                                <p className="text-[10px] text-subtle font-mono">{record.matricula}</p>
                              )}
                              {record.unidade && (
                                <p className="text-[10px] text-body truncate">{record.unidade}</p>
                              )}
                              {record.faccao && (
                                <p className="text-[10px] text-orange-600 dark:text-orange-400 font-medium truncate">
                                  {record.faccao}
                                </p>
                              )}
                              {record.situacao && (
                                <p className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded w-max mt-1 ${
                                  record.situacao.toLowerCase().includes('preso')
                                    ? 'bg-green-100 dark:bg-green-950/45 text-green-700 dark:text-green-300'
                                    : record.situacao.toLowerCase().includes('fuga') || record.situacao.toLowerCase().includes('evasão')
                                      ? 'bg-red-100 dark:bg-red-950/45 text-red-700 dark:text-red-300'
                                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                                }`}>
                                  {record.situacao}
                                </p>
                              )}
                              {record.photoQuality !== null && (
                                <div className="pt-0.5 space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className={`text-[10px] font-semibold ${qi.color}`}>
                                      {qi.label}
                                    </span>
                                    <span className="text-[10px] text-subtle">{normalized}</span>
                                  </div>
                                  <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${qi.bar}`}
                                      style={{ width: `${normalized}%` }}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                            {record.photoPath && (
                              <div className="border-t border-gray-100 dark:border-gray-800 flex">
                                <button
                                  onClick={() => handleRotate(record, 270)}
                                  disabled={isDeleting || isRotating}
                                  title="Rotar 90° esquerda"
                                  className="flex-1 flex items-center justify-center py-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors disabled:opacity-40"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => handleRotate(record, 90)}
                                  disabled={isDeleting || isRotating}
                                  title="Rotar 90° direita"
                                  className="flex-1 flex items-center justify-center py-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors border-l border-r border-gray-100 dark:border-gray-800 disabled:opacity-40"
                                >
                                  <RotateCw className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => handleDeletePhoto(record)}
                                  disabled={isDeleting || isRotating}
                                  title="Remover foto"
                                  className="flex-1 flex items-center justify-center py-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors disabled:opacity-40"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Load-more sentinel + button */}
              {activeGroups.length > displayedGroupCount && (
                <div ref={setLoadMoreElement} className="flex flex-col items-center gap-2 py-3">
                  <button
                    onClick={() => setDisplayedGroupCount((n) => n + 20)}
                    className="text-xs font-medium text-sigma-600 hover:text-sigma-700 border border-sigma-200 dark:border-sigma-800 hover:bg-sigma-50 dark:hover:bg-sigma-900/20 px-4 py-2 rounded-xl transition-colors"
                  >
                    Mostrar mais ({activeGroups.length - displayedGroupCount} grupo{activeGroups.length - displayedGroupCount !== 1 ? 's' : ''} restante{activeGroups.length - displayedGroupCount !== 1 ? 's' : ''})
                  </button>
                </div>
              )}

              {/* Dismissed groups section */}
              {showDismissed && dismissedVisibleGroups.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                    <div className="flex items-center gap-2 text-xs text-subtle">
                      <CheckCheck className="w-3.5 h-3.5 text-green-500" />
                      <span>{dismissedVisibleGroups.length} grupo{dismissedVisibleGroups.length !== 1 ? 's' : ''} marcado{dismissedVisibleGroups.length !== 1 ? 's' : ''} como tratado{dismissedVisibleGroups.length !== 1 ? 's' : ''}</span>
                      <button onClick={handleUndismissAll} className="text-red-500 hover:text-red-600 underline underline-offset-2 transition-colors">
                        Limpar todos
                      </button>
                    </div>
                    <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                  </div>
                  {dismissedVisibleGroups.map((group, gi) => (
                    <div key={gi} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden opacity-60">
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50">
                        <CheckCheck className="w-3.5 h-3.5 text-green-500" />
                        <span className="text-xs text-subtle">
                          Tratado — {group.records.map((r) => r.name).join(', ')}
                        </span>
                        <button
                          onClick={() => {
                            const key = groupKey(group.records);
                            setDismissedGroups((prev) => {
                              const next = new Set(prev);
                              next.delete(key);
                              try { localStorage.setItem('dismissed_dup_groups_v1', JSON.stringify([...next])); } catch {}
                              return next;
                            });
                          }}
                          className="ml-auto text-xs text-sigma-600 hover:text-sigma-700 font-medium transition-colors"
                        >
                          Restaurar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && (isDone || isRunning) && (
          <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3 flex-shrink-0 flex-wrap">
            <p className="text-xs text-subtle">
              {isDone
                ? `${jobState!.totalAnalyzed.toLocaleString('pt-BR')} fotos · ${undismissedGroups.length} grupo${undismissedGroups.length !== 1 ? 's' : ''} pendente${undismissedGroups.length !== 1 ? 's' : ''}${dismissedVisibleGroups.length > 0 ? ` · ${dismissedVisibleGroups.length} tratado${dismissedVisibleGroups.length !== 1 ? 's' : ''}` : ''}`
                : jobState?.phase === 'indexing'
                  ? `Indexando... ${jobState.indexingCurrent.toLocaleString('pt-BR')} / ${jobState.indexingTotal.toLocaleString('pt-BR')}`
                  : 'Detectando grupos...'}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {isDone && activeGroups.length > 0 && (
                <button
                  onClick={() => setShowBulkConfirm(true)}
                  disabled={bulkDeleting}
                  className="flex items-center gap-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
                >
                  {bulkDeleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  {bulkDeleting
                    ? 'Excluindo...'
                    : `Excluir ${pendingDeleteCount} duplicata${pendingDeleteCount !== 1 ? 's' : ''}`}
                </button>
              )}
              {isDone && (
                <button
                  onClick={handleStart}
                  disabled={isRunning}
                  className="flex items-center gap-2 text-sm font-medium text-sigma-600 hover:text-sigma-700 border border-sigma-200 dark:border-sigma-800 hover:bg-sigma-50 dark:hover:bg-sigma-900/20 px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
                >
                  <RefreshCw className="w-4 h-4" /> Re-verificar
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bulk confirm modal */}
      {showBulkConfirm && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-red-200 dark:border-red-800 p-6 max-w-sm w-full space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-title">Excluir duplicatas automaticamente?</p>
                <p className="text-sm text-subtle mt-1">
                  Para cada grupo, o registro com{' '}
                  <strong>maior nitidez</strong> (marcado{' '}
                  <span className="text-green-600 font-semibold">MANTER</span>) será preservado. Os
                  demais{' '}
                  <strong>
                    {pendingDeleteCount} registro{pendingDeleteCount !== 1 ? 's' : ''}
                  </strong>{' '}
                  serão excluídos permanentemente, incluindo suas fotos.
                </p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                  Esta ação não pode ser desfeita.
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowBulkConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-subtle hover:text-body border border-gray-200 dark:border-gray-700 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleBulkDelete}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors"
              >
                Excluir {pendingDeleteCount} registro{pendingDeleteCount !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
