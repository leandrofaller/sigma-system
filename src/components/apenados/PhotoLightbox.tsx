'use client';

import { useEffect, useCallback, useState, useRef } from 'react';
import { X, Download, ChevronLeft, ChevronRight, RotateCcw, RotateCw, Loader2, Users, Check, FolderPlus, Pencil } from 'lucide-react';
import type { Apenado } from './ApenadoCard';

interface SimilarRecord {
  id: string;
  name: string;
  matricula: string | null;
  unidade: string | null;
  photoPath: string | null;
  photoQuality: number | null;
  similarity: number;
}

interface Props {
  apenado: Apenado;
  all: Apenado[];
  onClose: () => void;
  onNavigate: (a: Apenado) => void;
  onEditApenado?: (id: string) => void;
  userRole?: string;
}

export function PhotoLightbox({ apenado, all, onClose, onNavigate, onEditApenado, userRole }: Props) {
  const idx = all.findIndex((a) => a.id === apenado.id);
  const hasPrev = idx > 0;
  const hasNext = idx < all.length - 1;
  const isAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN';

  const goPrev = useCallback(() => {
    if (hasPrev) onNavigate(all[idx - 1]);
  }, [hasPrev, idx, all, onNavigate]);

  const goNext = useCallback(() => {
    if (hasNext) onNavigate(all[idx + 1]);
  }, [hasNext, idx, all, onNavigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, goPrev, goNext]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Per-ID version map — persists across navigation so rotated photos stay updated
  const [photoVersions, setPhotoVersions] = useState<Map<string, number>>(() => new Map());
  const [rotating, setRotating] = useState(false);

  // Similar faces panel
  const [similarOpen, setSimilarOpen] = useState(false);
  const [similarData, setSimilarData] = useState<SimilarRecord[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarIndexed, setSimilarIndexed] = useState(0);
  const [similarReason, setSimilarReason] = useState('');
  const similarFetchedFor = useRef<string | null>(null);

  // Group selection
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupSaving, setGroupSaving] = useState(false);

  const resetSelection = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setCreateGroupOpen(false);
    setGroupName('');
  }, []);

  const fetchSimilar = useCallback(async (id: string) => {
    if (similarFetchedFor.current === id) return;
    similarFetchedFor.current = id;
    setSimilarLoading(true);
    setSimilarData([]);
    setSimilarReason('');
    try {
      const res = await fetch(`/api/apenados/${id}/similar?threshold=72&topN=20`);
      const data = await res.json();
      setSimilarData(data.similar ?? []);
      setSimilarIndexed(data.indexed ?? 0);
      setSimilarReason(data.reason ?? '');
    } catch {
      setSimilarReason('error');
    } finally {
      setSimilarLoading(false);
    }
  }, []);

  const handleToggleSimilar = useCallback(() => {
    setSimilarOpen((v) => {
      const next = !v;
      if (next) fetchSimilar(apenado.id);
      else resetSelection();
      return next;
    });
  }, [apenado.id, fetchSimilar, resetSelection]);

  // Reset similar panel when navigating to a new photo
  useEffect(() => {
    resetSelection();
    if (similarOpen) fetchSimilar(apenado.id);
    else similarFetchedFor.current = null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apenado.id]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || groupSaving) return;
    setGroupSaving(true);
    try {
      const members = [...selectedIds].map((id) => ({
        apenadoId: id,
        similarity: similarData.find((r) => r.id === id)?.similarity ?? null,
      }));
      // Include base apenado if not already selected
      if (!selectedIds.has(apenado.id)) {
        members.push({ apenadoId: apenado.id, similarity: null });
      }
      const res = await fetch('/api/apenados/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: groupName.trim(), baseApenadoId: apenado.id, members }),
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error || 'Erro ao criar grupo');
        return;
      }
      resetSelection();
    } finally {
      setGroupSaving(false);
    }
  };

  const photoVersion = photoVersions.get(apenado.id) ?? 0;
  const photoUrl = apenado.photoPath
    ? `/api/apenados/${apenado.id}/foto${photoVersion > 0 ? `?v=${photoVersion}` : ''}`
    : null;

  const handleRotate = async (degrees: 90 | 270) => {
    setRotating(true);
    try {
      const res = await fetch(`/api/apenados/${apenado.id}/foto/rotate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ degrees }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || 'Erro ao rotar foto'); return; }
      setPhotoVersions((prev) => {
        const m = new Map(prev);
        m.set(apenado.id, (m.get(apenado.id) ?? 0) + 1);
        return m;
      });
    } finally {
      setRotating(false);
    }
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = `/api/apenados/${apenado.id}/foto?download=1`;
    a.download = `${apenado.name}${apenado.matricula ? '_' + apenado.matricula : ''}.jpg`;
    a.click();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/92 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col rounded-2xl overflow-hidden shadow-2xl"
        style={{ maxWidth: 'min(640px, 95vw)', width: '100%', maxHeight: '92vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-900/95">
          <span className="text-white/60 text-xs font-mono">
            {all.length > 1 ? `${idx + 1} / ${all.length}` : ''}
          </span>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Image area */}
        <div className="relative bg-gray-950 flex items-center justify-center" style={{ minHeight: 320 }}>
          {photoUrl ? (
            <img
              key={apenado.id}
              src={photoUrl}
              alt={apenado.name}
              className="w-full object-contain"
              style={{ maxHeight: '65vh' }}
            />
          ) : (
            <div className="flex flex-col items-center gap-4 py-20">
              <div className="w-28 h-28 bg-gradient-to-br from-sigma-400 via-sigma-600 to-sigma-800 rounded-full flex items-center justify-center">
                <span className="text-white font-bold" style={{ fontSize: '3rem' }}>
                  {apenado.name.charAt(0)}
                </span>
              </div>
              <p className="text-gray-500 text-sm">Sem foto cadastrada</p>
            </div>
          )}

          {/* Prev arrow */}
          {hasPrev && (
            <button
              onClick={goPrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          {/* Next arrow */}
          {hasNext && (
            <button
              onClick={goNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Info bar */}
        <div className="flex items-center gap-4 px-5 py-4 bg-gray-900/95">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-white font-bold text-sm truncate">{apenado.name}</p>
              {apenado.photoPath && apenado.photoQuality !== undefined && apenado.photoQuality !== null && (() => {
                const q = apenado.photoQuality!;
                const cls = q < 50 ? 'bg-red-500/80' : q < 150 ? 'bg-yellow-500/80' : q < 400 ? 'bg-blue-500/80' : 'bg-green-500/80';
                const label = q < 50 ? 'Borrada' : q < 150 ? 'Regular' : q < 400 ? 'Boa' : 'Nítida';
                return <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold leading-none text-white flex-shrink-0 ${cls}`}>{label}</span>;
              })()}
            </div>
            <p className="text-gray-400 text-xs mt-0.5 truncate">
              {[apenado.matricula, apenado.unidade].filter(Boolean).join(' · ') || 'Sem matrícula'}
            </p>
          </div>
          {photoUrl && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleToggleSimilar}
                title="Buscar indivíduo — localizar registros com a mesma face"
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${similarOpen ? 'bg-teal-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}
              >
                {similarLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
              </button>
              <button
                onClick={() => handleRotate(270)}
                disabled={rotating}
                title="Rotar 90° esquerda"
                className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-40"
              >
                {rotating ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <RotateCcw className="w-4 h-4 text-white" />}
              </button>
              <button
                onClick={() => handleRotate(90)}
                disabled={rotating}
                title="Rotar 90° direita"
                className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-40"
              >
                <RotateCw className="w-4 h-4 text-white" />
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 text-xs font-semibold text-white bg-sigma-600 hover:bg-sigma-700 px-3 py-2 rounded-lg transition-colors flex-shrink-0"
              >
                <Download className="w-3.5 h-3.5" /> Baixar
              </button>
            </div>
          )}
        </div>

        {/* Similar faces panel */}
        {similarOpen && (
          <div className="relative bg-gray-950/95 border-t border-white/10 px-4 py-3">
            {/* Panel header */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/60 text-xs font-semibold flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                {similarLoading
                  ? 'Buscando...'
                  : similarData.length > 0
                    ? `${similarData.length} registro${similarData.length !== 1 ? 's' : ''} similar${similarData.length !== 1 ? 'es' : ''} · threshold 72%`
                    : similarReason === 'no-face'
                      ? 'Sem rosto indexado neste registro'
                      : similarReason === 'cache-unavailable'
                        ? 'Cache de embeddings indisponível'
                        : 'Nenhum indivíduo similar encontrado'}
              </span>
              <div className="flex items-center gap-2">
                {similarIndexed > 0 && !selectMode && (
                  <span className="text-white/30 text-[10px]">{similarIndexed.toLocaleString('pt-BR')} indexados</span>
                )}
                {isAdmin && similarData.length > 0 && !similarLoading && (
                  <button
                    onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); setCreateGroupOpen(false); }}
                    className={`text-[10px] px-2 py-0.5 rounded-lg font-medium transition-colors ${
                      selectMode ? 'bg-teal-500 text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'
                    }`}
                  >
                    {selectMode ? 'Cancelar' : 'Selecionar'}
                  </button>
                )}
              </div>
            </div>

            {similarLoading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
              </div>
            )}

            {!similarLoading && similarData.length > 0 && (
              <>
                <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
                  {similarData.map((r) => {
                    const isSelected = selectedIds.has(r.id);
                    return (
                      <div key={r.id} className="flex-shrink-0 w-20 group/sim flex flex-col">
                        <button
                          onClick={() => {
                            if (selectMode) toggleSelect(r.id);
                            else onNavigate({ ...r, faccao: null, notes: null, createdAt: '' } as Apenado);
                          }}
                          className="w-20"
                          title={`${r.name} · ${r.similarity}% similaridade`}
                        >
                          <div className={`relative w-20 h-20 rounded-lg overflow-hidden bg-gray-800 ring-2 transition-all ${
                            isSelected ? 'ring-teal-400' : 'ring-transparent group-hover/sim:ring-teal-400/50'
                          }`}>
                            {r.photoPath ? (
                              <img
                                src={`/api/apenados/${r.id}/foto`}
                                alt={r.name}
                                loading="lazy"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-teal-700 to-teal-900">
                                <span className="text-white font-bold text-lg">{r.name.charAt(0)}</span>
                              </div>
                            )}
                            <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5">
                              <span className="text-teal-300 text-[9px] font-bold">{r.similarity}%</span>
                            </div>
                            {/* Checkbox overlay in select mode */}
                            {selectMode && (
                              <div className={`absolute top-1 left-1 w-4 h-4 rounded-sm border-2 flex items-center justify-center transition-colors ${
                                isSelected ? 'bg-teal-500 border-teal-400' : 'bg-black/50 border-white/60'
                              }`}>
                                {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                              </div>
                            )}
                          </div>
                          <p className="text-white/60 text-[9px] truncate mt-1 text-center leading-tight">{r.name.split(' ')[0]}</p>
                        </button>
                        {/* Botão editar — visível no hover, apenas para admins com handler */}
                        {isAdmin && onEditApenado && (
                          <button
                            onClick={() => onEditApenado(r.id)}
                            title={`Editar ${r.name}`}
                            className="mt-0.5 flex items-center justify-center gap-0.5 text-[9px] font-medium text-white/40 hover:text-white bg-white/5 hover:bg-teal-600 rounded px-1 py-0.5 transition-colors opacity-0 group-hover/sim:opacity-100"
                          >
                            <Pencil className="w-2.5 h-2.5" /> Editar
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Action bar when items selected */}
                {selectMode && selectedIds.size > 0 && (
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/10">
                    <span className="text-white/50 text-[10px]">
                      {selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}
                    </span>
                    <button
                      onClick={() => setCreateGroupOpen(true)}
                      className="flex items-center gap-1.5 text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <FolderPlus className="w-3.5 h-3.5" /> Criar grupo
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Mini-modal: create group */}
            {createGroupOpen && (
              <div className="absolute inset-0 bg-gray-950/97 rounded-b-none flex flex-col gap-3 p-4 z-10">
                <p className="text-white font-semibold text-sm">Criar grupo de identificação</p>
                <input
                  autoFocus
                  placeholder="Nome do grupo (ex: possível mesmo indivíduo)"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && groupName.trim() && handleCreateGroup()}
                  className="bg-white/10 text-white placeholder-white/30 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-400 border border-white/10"
                />
                <p className="text-white/40 text-[10px]">
                  {selectedIds.size} resultado{selectedIds.size !== 1 ? 's' : ''} selecionado{selectedIds.size !== 1 ? 's' : ''}
                  {' + apenado base incluído automaticamente'}
                </p>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setCreateGroupOpen(false)}
                    className="text-xs text-white/50 hover:text-white px-3 py-1.5 rounded-lg border border-white/20 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleCreateGroup}
                    disabled={!groupName.trim() || groupSaving}
                    className="flex items-center gap-1.5 text-xs font-semibold bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg transition-colors"
                  >
                    {groupSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Salvar grupo
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Keyboard hint */}
      {all.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 text-white/30 text-xs pointer-events-none select-none">
          <span>← →</span>
          <span>navegar</span>
          <span>·</span>
          <span>ESC</span>
          <span>fechar</span>
        </div>
      )}
    </div>
  );
}
