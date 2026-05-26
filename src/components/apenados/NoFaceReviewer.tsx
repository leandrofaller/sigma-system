'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, FileImage, Loader2, Trash2, CheckSquare, Square, AlertTriangle, ChevronDown } from 'lucide-react';

interface NoFaceRecord {
  id: string;
  name: string;
  matricula: string | null;
  unidade: string | null;
  photoPath: string | null;
  photoQuality: number | null;
}

interface Props {
  onClose: () => void;
  onPhotosRemoved: (ids: string[]) => void;
}

const PAGE_SIZE = 50;

function qualityInfo(q: number | null) {
  if (q === null) return { label: '—', cls: 'bg-gray-400/80' };
  if (q < 50) return { label: 'Borrada', cls: 'bg-red-500/80' };
  if (q < 150) return { label: 'Regular', cls: 'bg-yellow-500/80' };
  if (q < 400) return { label: 'Boa', cls: 'bg-blue-500/80' };
  return { label: 'Nítida', cls: 'bg-green-500/80' };
}

export function NoFaceReviewer({ onClose, onPhotosRemoved }: Props) {
  const [records, setRecords] = useState<NoFaceRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [removedCount, setRemovedCount] = useState<number | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const fetchPage = useCallback(async (currentSkip: number, append: boolean) => {
    try {
      const res = await fetch(`/api/apenados/no-face?skip=${currentSkip}&take=${PAGE_SIZE}`);
      const data = await res.json();
      const fetched: NoFaceRecord[] = data.records ?? [];
      setTotal(data.total ?? 0);
      if (append) {
        setRecords((prev) => [...prev, ...fetched]);
      } else {
        setRecords(fetched);
      }
      setSkip(currentSkip + fetched.length);
    } finally {
      if (!append) setLoading(false);
      setLoadingMore(false);
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchPage(0, false);
  }, [fetchPage]);

  // Infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || loadingRef.current) return;
      if (records.length >= total) return;
      loadingRef.current = true;
      setLoadingMore(true);
      fetchPage(skip, true);
    }, { rootMargin: '200px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [records.length, total, skip, fetchPage]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const toggleAll = () => {
    if (selected.size === records.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(records.map((r) => r.id)));
    }
  };

  const handleRemove = async () => {
    if (selected.size === 0) return;
    setRemoving(true);
    try {
      const ids = Array.from(selected);
      const res = await fetch('/api/apenados/no-face', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || 'Erro ao remover fotos.');
        return;
      }
      const d = await res.json();
      setRemovedCount(d.updated ?? ids.length);
      setRecords((prev) => prev.filter((r) => !selected.has(r.id)));
      setTotal((t) => t - (d.updated ?? ids.length));
      onPhotosRemoved(ids);
      setSelected(new Set());
      setShowConfirm(false);
    } finally {
      setRemoving(false);
    }
  };

  const allSelected = records.length > 0 && selected.size === records.length;
  const someSelected = selected.size > 0 && !allSelected;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-gray-100 dark:border-gray-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-orange-100 dark:bg-orange-900/30 rounded-xl flex items-center justify-center">
              <FileImage className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="font-bold text-title text-sm">Fotos sem rosto detectado</p>
              <p className="text-subtle text-xs">
                {loading ? 'Carregando...' : `${total.toLocaleString('pt-BR')} foto${total !== 1 ? 's' : ''} com possível documento`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        {!loading && records.length > 0 && (
          <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 flex-shrink-0">
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
              {selected.size > 0 ? `${selected.size} selecionado${selected.size !== 1 ? 's' : ''}` : 'Nenhum selecionado'}
            </span>
            {selected.size > 0 && (
              <button
                onClick={() => setShowConfirm(true)}
                className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remover {selected.size} foto{selected.size !== 1 ? 's' : ''}
              </button>
            )}
          </div>
        )}

        {/* Success banner */}
        {removedCount !== null && (
          <div className="px-6 py-2 bg-green-50 dark:bg-green-900/20 border-b border-green-100 dark:border-green-800 flex items-center gap-2 flex-shrink-0">
            <span className="text-green-700 dark:text-green-400 text-xs font-medium">
              {removedCount} foto{removedCount !== 1 ? 's removidas' : ' removida'} com sucesso.
            </span>
            <button onClick={() => setRemovedCount(null)} className="ml-auto text-green-500 hover:text-green-700 text-xs">✕</button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-sigma-600 animate-spin" />
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-3">
                <FileImage className="w-8 h-8 text-green-500" />
              </div>
              <p className="font-semibold text-title">Nenhuma foto suspeita encontrada</p>
              <p className="text-subtle text-sm mt-1">Todas as fotos com rosto foram corretamente indexadas.</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-subtle mb-4">
                Fotos onde o ArcFace não detectou rostos — possivelmente documentos, objetos ou fotos de baixa qualidade.
                Ordenadas da maior para menor qualidade (documentos nítidos primeiro).
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {records.map((record) => {
                  const isSelected = selected.has(record.id);
                  const qi = qualityInfo(record.photoQuality);
                  return (
                    <div
                      key={record.id}
                      onClick={() => toggleSelect(record.id)}
                      className={`relative rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${
                        isSelected
                          ? 'border-sigma-500 shadow-lg shadow-sigma-500/20'
                          : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <div className="aspect-square bg-gray-100 dark:bg-gray-800">
                        <img
                          src={`/api/apenados/${record.id}/foto`}
                          alt={record.name}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      {/* Quality badge */}
                      <div className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold leading-none text-white pointer-events-none ${qi.cls}`}>
                        {qi.label}
                      </div>
                      {/* Selection checkbox */}
                      <div className={`absolute top-1.5 right-1.5 w-5 h-5 rounded flex items-center justify-center transition-all ${
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
                  );
                })}
              </div>
              {/* Infinite scroll sentinel */}
              {records.length < total && <div ref={sentinelRef} className="h-4 mt-4" />}
              {loadingMore && (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 text-sigma-600 animate-spin" />
                </div>
              )}
              {records.length >= total && total > 0 && (
                <p className="text-center text-xs text-subtle mt-4">
                  {total.toLocaleString('pt-BR')} registro{total !== 1 ? 's' : ''} exibido{total !== 1 ? 's' : ''}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Confirm dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
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
