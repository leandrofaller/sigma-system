'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, FileSearch, Play, Square, RefreshCw, Loader2,
  CheckCircle, AlertCircle, User, Pencil, CheckSquare, Square as SquareIcon,
} from 'lucide-react';

interface ApenadoRow {
  id: string;
  name: string;
  ocrName: string | null;
  ocrText: string | null;
  photoPath: string | null;
  matricula: string | null;
  unidade: string | null;
}

interface AuditProgress {
  current: number;
  total: number;
  withFace: number;
  withOcr: number;
  errors: number;
  startTime: number;
}

interface AuditState {
  isRunning: boolean;
  progress: AuditProgress;
  error: string;
  summary: {
    totalWithPhoto: number;
    processedCount: number;
    withSuggestion: number;
    pendingCount: number;
  };
}

type Filter = 'has_suggestion' | 'camera' | 'pending';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'has_suggestion', label: 'Com sugestão OCR' },
  { key: 'camera', label: 'Nomes de câmera' },
  { key: 'pending', label: 'Não processados' },
];

interface Props {
  onClose: () => void;
  onRenamed?: () => void;
}

export function AuditPanel({ onClose, onRenamed }: Props) {
  const [auditState, setAuditState] = useState<AuditState | null>(null);
  const [filter, setFilter] = useState<Filter>('has_suggestion');
  const [rows, setRows] = useState<ApenadoRow[]>([]);
  const [rowsTotal, setRowsTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingRows, setLoadingRows] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRenaming, setBulkRenaming] = useState(false);
  const [bulkRenamed, setBulkRenamed] = useState<number | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/apenados/audit');
      if (res.ok) setAuditState(await res.json());
    } catch {}
  }, []);

  const fetchRows = useCallback(async (f: Filter, p: number) => {
    setLoadingRows(true);
    try {
      const res = await fetch(`/api/apenados/audit?filter=${f}&page=${p}`);
      if (res.ok) {
        const data = await res.json();
        setRows(data.rows);
        setRowsTotal(data.total);
      }
    } catch {} finally {
      setLoadingRows(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchState();
    fetchRows(filter, 1);
  }, [fetchState, fetchRows, filter]);

  // Polling while running
  useEffect(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (auditState?.isRunning) {
      pollingRef.current = setInterval(async () => {
        await fetchState();
      }, 2000);
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [auditState?.isRunning, fetchState]);

  // Refresh rows when job finishes
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !auditState?.isRunning) {
      fetchRows(filter, page);
    }
    wasRunning.current = auditState?.isRunning ?? false;
  }, [auditState?.isRunning, filter, page, fetchRows]);

  const handleFilterChange = (f: Filter) => {
    setFilter(f);
    setPage(1);
    setSelectedIds(new Set());
    fetchRows(f, 1);
  };

  const handlePageChange = (p: number) => {
    setPage(p);
    fetchRows(filter, p);
  };

  const startAudit = async () => {
    setErrorMsg('');
    const res = await fetch('/api/apenados/audit', { method: 'POST' });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErrorMsg(d.error ?? 'Erro ao iniciar auditoria');
      return;
    }
    await fetchState();
  };

  const stopAudit = async () => {
    await fetch('/api/apenados/audit', { method: 'DELETE' });
    await fetchState();
  };

  const renameOne = async (id: string, name: string) => {
    setRenamingId(id);
    try {
      await fetch('/api/apenados/audit', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name }),
      });
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, name } : r)));
      onRenamed?.();
    } finally {
      setRenamingId(null);
    }
  };

  const bulkRename = async () => {
    setBulkRenaming(true);
    setBulkRenamed(null);
    try {
      const ids = Array.from(selectedIds);
      const res = await fetch('/api/apenados/audit', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        const d = await res.json();
        setBulkRenamed(d.updated);
        // Update names in list
        const rowMap = new Map(rows.map((r) => [r.id, r]));
        setRows((prev) =>
          prev.map((r) => {
            if (selectedIds.has(r.id) && r.ocrName) return { ...r, name: r.ocrName };
            return r;
          }),
        );
        setSelectedIds(new Set());
        onRenamed?.();
      }
    } finally {
      setBulkRenaming(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const withSuggestion = rows.filter((r) => r.ocrName);
    if (selectedIds.size === withSuggestion.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(withSuggestion.map((r) => r.id)));
    }
  };

  const progress = auditState?.progress;
  const pct = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;
  const elapsed = progress?.startTime
    ? Math.round((Date.now() - progress.startTime) / 1000)
    : 0;

  const rowsWithSuggestion = rows.filter((r) => r.ocrName);
  const allSelected = rowsWithSuggestion.length > 0 && selectedIds.size === rowsWithSuggestion.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[#1a1a2e] border border-white/10 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <FileSearch className="w-5 h-5 text-violet-400" />
            <h2 className="text-white font-semibold text-lg">Auditoria de Fotos</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Summary cards */}
          {auditState?.summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Com foto', value: auditState.summary.totalWithPhoto, color: 'text-blue-400' },
                { label: 'Processados', value: auditState.summary.processedCount, color: 'text-green-400' },
                { label: 'Com sugestão', value: auditState.summary.withSuggestion, color: 'text-violet-400' },
                { label: 'Pendentes', value: auditState.summary.pendingCount, color: 'text-amber-400' },
              ].map((c) => (
                <div key={c.label} className="bg-white/5 rounded-lg p-3 text-center">
                  <div className={`text-2xl font-bold ${c.color}`}>{c.value.toLocaleString()}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{c.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Job controls */}
          <div className="bg-white/5 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-200">
                {auditState?.isRunning ? 'Auditoria em andamento...' : 'Iniciar auditoria de fotos'}
              </span>
              <div className="flex gap-2">
                {auditState?.isRunning ? (
                  <button
                    onClick={stopAudit}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/80 hover:bg-red-600 text-white text-sm rounded-lg transition-colors"
                  >
                    <Square className="w-3.5 h-3.5" />
                    Parar
                  </button>
                ) : (
                  <button
                    onClick={startAudit}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-lg transition-colors"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Iniciar
                  </button>
                )}
                <button
                  onClick={() => { fetchState(); fetchRows(filter, page); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-gray-300 text-sm rounded-lg transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {auditState?.isRunning && progress && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-gray-400">
                  <span>{progress.current.toLocaleString()} / {progress.total.toLocaleString()} fotos</span>
                  <span>{pct}% — {elapsed}s</span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-500 rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex gap-4 text-xs text-gray-400">
                  <span className="text-green-400">Rostos: {progress.withFace}</span>
                  <span className="text-blue-400">OCR: {progress.withOcr}</span>
                  {progress.errors > 0 && <span className="text-red-400">Erros: {progress.errors}</span>}
                </div>
              </div>
            )}

            {!auditState?.isRunning && auditState?.error && (
              <div className="flex items-center gap-2 text-sm text-red-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {auditState.error}
              </div>
            )}
            {errorMsg && (
              <div className="flex items-center gap-2 text-sm text-red-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {errorMsg}
              </div>
            )}
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => handleFilterChange(f.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filter === f.key
                    ? 'bg-violet-600 text-white'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Bulk actions */}
          {filter === 'has_suggestion' && rowsWithSuggestion.length > 0 && (
            <div className="flex items-center gap-3">
              <button
                onClick={selectAll}
                className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
              >
                {allSelected ? (
                  <CheckSquare className="w-4 h-4 text-violet-400" />
                ) : (
                  <SquareIcon className="w-4 h-4" />
                )}
                {allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>
              {selectedIds.size > 0 && (
                <button
                  onClick={bulkRename}
                  disabled={bulkRenaming}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/80 hover:bg-green-600 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
                >
                  {bulkRenaming ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Pencil className="w-3.5 h-3.5" />
                  )}
                  Renomear selecionados ({selectedIds.size})
                </button>
              )}
              {bulkRenamed !== null && (
                <span className="text-sm text-green-400 flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" />
                  {bulkRenamed} renomeados
                </span>
              )}
            </div>
          )}

          {/* Table */}
          <div className="bg-white/5 rounded-lg overflow-hidden">
            {loadingRows ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500 gap-2">
                <FileSearch className="w-8 h-8" />
                <span className="text-sm">Nenhum registro encontrado neste filtro</span>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-xs text-gray-400 uppercase tracking-wider">
                    {filter === 'has_suggestion' && <th className="px-3 py-2 w-8" />}
                    <th className="px-4 py-2">Nome atual</th>
                    <th className="px-4 py-2">Sugestão OCR</th>
                    <th className="px-4 py-2">Matrícula</th>
                    <th className="px-4 py-2 w-24">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors"
                    >
                      {filter === 'has_suggestion' && (
                        <td className="px-3 py-2">
                          {row.ocrName ? (
                            <button onClick={() => toggleSelect(row.id)}>
                              {selectedIds.has(row.id) ? (
                                <CheckSquare className="w-4 h-4 text-violet-400" />
                              ) : (
                                <SquareIcon className="w-4 h-4 text-gray-500" />
                              )}
                            </button>
                          ) : null}
                        </td>
                      )}
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                          <span className="text-gray-200 truncate max-w-[180px]" title={row.name}>
                            {row.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        {row.ocrName ? (
                          <span className="text-violet-300 font-medium truncate max-w-[180px] block" title={row.ocrName}>
                            {row.ocrName}
                          </span>
                        ) : row.ocrText === null ? (
                          <span className="text-gray-500 text-xs">não processado</span>
                        ) : (
                          <span className="text-gray-500 text-xs">sem sugestão</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-400">
                        {row.matricula ?? '—'}
                      </td>
                      <td className="px-4 py-2">
                        {row.ocrName && row.ocrName !== row.name ? (
                          <button
                            onClick={() => renameOne(row.id, row.ocrName!)}
                            disabled={renamingId === row.id}
                            className="flex items-center gap-1 px-2 py-1 bg-violet-600/80 hover:bg-violet-600 disabled:opacity-50 text-white text-xs rounded transition-colors"
                          >
                            {renamingId === row.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Pencil className="w-3 h-3" />
                            )}
                            Usar
                          </button>
                        ) : row.ocrName === row.name ? (
                          <span className="text-xs text-green-400 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            OK
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {rowsTotal > 50 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 disabled:opacity-40 text-gray-300 rounded-lg transition-colors"
              >
                Anterior
              </button>
              <span className="text-sm text-gray-400">
                Pág. {page} / {Math.ceil(rowsTotal / 50)}
              </span>
              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= Math.ceil(rowsTotal / 50)}
                className="px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 disabled:opacity-40 text-gray-300 rounded-lg transition-colors"
              >
                Próxima
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
