'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  X, ScanSearch, Loader2, Trash2, AlertTriangle, CheckCircle,
  RefreshCw, Users, Fingerprint, Waves, Zap, Clock, UserX,
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
}

interface DupGroup {
  type: 'exact' | 'similar';
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
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

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
        prev ? { ...prev, phase: 'indexing', error: '' } : null,
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

  const handleBulkDelete = async () => {
    setShowBulkConfirm(false);
    setBulkDeleting(true);
    setInlineError('');
    try {
      const idsToDelete = activeGroups.flatMap((g) => g.records.slice(1).map((r) => r.id));
      const res = await fetch('/api/apenados/duplicates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idsToDelete }),
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

  const activeGroups = (jobState?.groups ?? [])
    .map((g) => ({ ...g, records: g.records.filter((r) => !deletedIds.has(r.id)) }))
    .filter((g) => g.records.length >= 2);

  const pendingDeleteCount = activeGroups.reduce((sum, g) => sum + g.records.length - 1, 0);
  const isRunning = jobState?.phase === 'indexing' || jobState?.phase === 'detecting';
  const isDone = jobState?.phase === 'done';
  const hasResults = isDone && (jobState?.totalAnalyzed ?? 0) > 0;
  const indexProgress =
    jobState && jobState.indexingTotal > 0
      ? Math.round((jobState.indexingCurrent / jobState.indexingTotal) * 100)
      : 0;

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
                  SHA-256 + dHash · {jobState!.totalAnalyzed.toLocaleString('pt-BR')} fotos
                </div>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3">
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
              </div>

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
              {activeGroups.map((group, gi) => {
                const qualities = group.records.map((r) => r.photoQuality ?? 0);
                const groupMax = Math.max(...qualities);
                const groupMin = Math.min(...qualities);
                const isExact = group.type === 'exact';

                return (
                  <div
                    key={gi}
                    className="border border-red-200 dark:border-red-800 rounded-xl overflow-hidden"
                  >
                    <div className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
                      <Users className="w-4 h-4 text-red-500" />
                      <span className="text-sm font-semibold text-red-700 dark:text-red-400">
                        Grupo {gi + 1} — {group.records.length} registros
                      </span>
                      <span
                        className={`ml-auto flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          isExact
                            ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                            : 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
                        }`}
                      >
                        {isExact ? (
                          <Fingerprint className="w-3 h-3" />
                        ) : (
                          <Waves className="w-3 h-3" />
                        )}
                        {isExact ? 'Idênticas' : 'Similares'}
                      </span>
                    </div>
                    <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {group.records.map((record, ri) => {
                        const isKeeper = ri === 0;
                        const qi = qualityInfo(record.photoQuality);
                        const normalized = normalizeQuality(record.photoQuality, groupMax, groupMin);
                        const isDeleting = deletingId === record.id;

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
                            {!record.hasFace && (
                              <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-0.5 bg-gray-800/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                                <UserX className="w-2.5 h-2.5" />
                                Sem rosto
                              </div>
                            )}
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
                                  <span className="text-2xl font-bold text-gray-400">
                                    {record.name.charAt(0)}
                                  </span>
                                </div>
                              )}
                              {isDeleting && (
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                                </div>
                              )}
                            </div>
                            <div className="p-2 flex-1 space-y-1">
                              <p className="text-xs font-semibold text-title truncate">
                                {record.name}
                              </p>
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
                              <button
                                onClick={() => handleDeletePhoto(record)}
                                disabled={isDeleting}
                                className="flex items-center gap-1 justify-center text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 border-t border-gray-100 dark:border-gray-800 px-2 py-2 transition-colors disabled:opacity-50"
                              >
                                <Trash2 className="w-3 h-3" /> Remover foto
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && (isDone || isRunning) && (
          <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3 flex-shrink-0 flex-wrap">
            <p className="text-xs text-subtle">
              {isDone
                ? `${jobState!.totalAnalyzed.toLocaleString('pt-BR')} fotos · ${activeGroups.length} grupo${activeGroups.length !== 1 ? 's' : ''} com duplicatas`
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
    </div>
  );
}
