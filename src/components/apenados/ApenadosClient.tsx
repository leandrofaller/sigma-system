'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  UserCheck, Search, Download, Plus, LayoutGrid, List,
  Users, Camera, UserX, ChevronUp,
} from 'lucide-react';
import { ApenadoCard, type Apenado } from './ApenadoCard';
import { ApenadoModal } from './ApenadoModal';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

interface Props {
  initialApenados: Apenado[];
  userRole: string;
}

export function ApenadosClient({ initialApenados, userRole }: Props) {
  const [apenados, setApenados] = useState<Apenado[]>(initialApenados);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Apenado | null>(null);
  const [activeLetter, setActiveLetter] = useState('');
  const [exporting, setExporting] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Filter
  const filtered = useMemo(() => {
    if (!search.trim()) return apenados;
    const q = search.trim().toLowerCase();
    return apenados.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.matricula?.toLowerCase().includes(q) ||
        a.unidade?.toLowerCase().includes(q)
    );
  }, [apenados, search]);

  // Group by first letter
  const groups = useMemo(() => {
    const map: Record<string, Apenado[]> = {};
    for (const a of filtered) {
      const letter = a.name.charAt(0).toUpperCase();
      const key = ALPHABET.includes(letter) ? letter : '#';
      if (!map[key]) map[key] = [];
      map[key].push(a);
    }
    return map;
  }, [filtered]);

  const presentLetters = useMemo(() => Object.keys(groups).sort(), [groups]);
  const stats = useMemo(() => ({
    total: apenados.length,
    comFoto: apenados.filter((a) => a.photoPath).length,
    semFoto: apenados.filter((a) => !a.photoPath).length,
  }), [apenados]);

  // IntersectionObserver for active letter
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveLetter(entry.target.id.replace('section-', ''));
            break;
          }
        }
      },
      { rootMargin: '-20% 0px -70% 0px' }
    );
    Object.values(sectionRefs.current).forEach((el) => { if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, [groups]);

  // Scroll to top visibility
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToLetter = (letter: string) => {
    sectionRefs.current[letter]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/apenados/export');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `apenados_${new Date().toISOString().split('T')[0]}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const handleSaved = useCallback((saved: Apenado) => {
    setApenados((prev) => {
      const idx = prev.findIndex((a) => a.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next.sort((a, b) => a.name.localeCompare(b.name));
      }
      return [...prev, saved].sort((a, b) => a.name.localeCompare(b.name));
    });
    setModalOpen(false);
    setEditing(null);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Excluir este registro? Esta ação não pode ser desfeita.')) return;
    const res = await fetch(`/api/apenados/${id}`, { method: 'DELETE' });
    if (res.ok) setApenados((prev) => prev.filter((a) => a.id !== id));
    else alert('Erro ao excluir.');
  }, []);

  const openNew = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (a: Apenado) => { setEditing(a); setModalOpen(true); };

  let cardIndex = 0;

  return (
    <div className="flex flex-col gap-0 animate-fade-in">
      {/* ── Hero header ── */}
      <div className="gradient-sigma rounded-2xl p-6 mb-5 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 80% 50%, white 0%, transparent 60%)' }} />
        <div className="relative z-10">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center shadow-lg">
                <UserCheck className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Identificação de Apenados</h1>
                <p className="text-white/70 text-sm mt-0.5">Banco de identificação visual do sistema penal</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleExport}
                disabled={exporting || apenados.length === 0}
                className="flex items-center gap-2 text-sm font-medium text-white border border-white/30 hover:bg-white/10 px-4 py-2 rounded-xl transition-all disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {exporting ? 'Exportando...' : 'Exportar ZIP'}
              </button>
              <button
                onClick={openNew}
                className="flex items-center gap-2 text-sm font-bold bg-white text-sigma-700 hover:bg-sigma-50 px-4 py-2 rounded-xl transition-all shadow-lg"
              >
                <Plus className="w-4 h-4" /> Novo Apenado
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-6 mt-5 flex-wrap">
            {[
              { icon: Users, label: 'Total', value: stats.total, color: 'text-white' },
              { icon: Camera, label: 'Com foto', value: stats.comFoto, color: 'text-green-300' },
              { icon: UserX, label: 'Sem foto', value: stats.semFoto, color: 'text-yellow-300' },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="flex items-center gap-2">
                <Icon className={`w-4 h-4 ${color}`} />
                <div>
                  <span className="text-white font-bold text-lg leading-none">{value}</span>
                  <span className="text-white/60 text-xs ml-1.5">{label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Search + view toggle ── */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, matrícula ou unidade..."
            className="w-full input-base pl-9 pr-4 py-2.5 text-sm"
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-medium">
              ✕
            </button>
          )}
        </div>
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 gap-1">
          {([['grid', LayoutGrid], ['list', List]] as const).map(([mode, Icon]) => (
            <button key={mode} onClick={() => setViewMode(mode)}
              className={`p-2 rounded-lg transition-all ${viewMode === mode ? 'bg-white dark:bg-gray-700 shadow-sm text-sigma-600' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>
      </div>

      {/* ── Sticky alphabet bar ── */}
      {presentLetters.length > 0 && (
        <div className="sticky top-0 z-20 bg-white/95 dark:bg-gray-950/95 backdrop-blur-sm py-2 mb-4 border-b border-gray-100 dark:border-gray-800 -mx-1 px-1">
          <div className="flex flex-wrap gap-0.5">
            {ALPHABET.map((letter) => {
              const hasData = !!groups[letter];
              return (
                <button
                  key={letter}
                  onClick={() => hasData && scrollToLetter(letter)}
                  disabled={!hasData}
                  className={`w-7 h-7 text-xs font-bold rounded-lg transition-all
                    ${activeLetter === letter
                      ? 'bg-sigma-600 text-white shadow-lg shadow-sigma-600/30 scale-110'
                      : hasData
                        ? 'text-sigma-600 dark:text-sigma-400 hover:bg-sigma-50 dark:hover:bg-sigma-900/30'
                        : 'text-gray-200 dark:text-gray-700 cursor-not-allowed'
                    }`}
                >
                  {letter}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
            <UserCheck className="w-10 h-10 text-gray-300 dark:text-gray-600" />
          </div>
          <p className="text-title font-semibold text-lg">
            {search ? 'Nenhum resultado encontrado' : 'Nenhum apenado cadastrado'}
          </p>
          <p className="text-subtle text-sm mt-1">
            {search ? 'Tente outro termo de busca' : 'Clique em "Novo Apenado" para começar'}
          </p>
        </div>
      )}

      {/* ── Alphabetical sections ── */}
      <div className="space-y-10">
        {presentLetters.map((letter) => {
          const items = groups[letter];
          return (
            <div
              key={letter}
              id={`section-${letter}`}
              ref={(el) => { sectionRefs.current[letter] = el; }}
            >
              {/* Section header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-sigma-500 to-sigma-700 rounded-xl flex items-center justify-center shadow-lg shadow-sigma-500/20 flex-shrink-0">
                  <span className="text-white font-bold text-lg">{letter}</span>
                </div>
                <div className="flex-1 h-px bg-gradient-to-r from-sigma-200 to-transparent dark:from-sigma-800" />
                <span className="text-xs font-semibold text-subtle bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full flex-shrink-0">
                  {items.length} {items.length === 1 ? 'registro' : 'registros'}
                </span>
              </div>

              {viewMode === 'grid' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {items.map((a) => (
                    <ApenadoCard
                      key={a.id}
                      apenado={a}
                      userRole={userRole}
                      index={cardIndex++}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              ) : (
                <div className="card divide-y divide-gray-50 dark:divide-gray-800">
                  {items.map((a) => (
                    <div key={a.id}
                      className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition-colors">
                      {/* Thumbnail */}
                      <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 bg-gradient-to-br from-sigma-400 to-sigma-700">
                        {a.photoPath ? (
                          <img src={`/api/apenados/${a.id}/foto`} alt={a.name}
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-white font-bold text-sm">{a.name.charAt(0)}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-title truncate">{a.name}</p>
                        <p className="text-xs text-subtle">
                          {[a.matricula, a.unidade].filter(Boolean).join(' · ') || 'Sem matrícula'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {a.photoPath && (
                          <button onClick={() => {
                            const el = document.createElement('a');
                            el.href = `/api/apenados/${a.id}/foto?download=1`;
                            el.download = `${a.name}.jpg`;
                            el.click();
                          }} className="p-1.5 text-gray-400 hover:text-sigma-600 hover:bg-sigma-50 dark:hover:bg-sigma-900/30 rounded-lg transition-colors">
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={() => openEdit(a)}
                          className="p-1.5 text-gray-400 hover:text-sigma-600 hover:bg-sigma-50 dark:hover:bg-sigma-900/30 rounded-lg transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        {(userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') && (
                          <button onClick={() => handleDelete(a.id)}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Scroll to top ── */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 z-30 w-10 h-10 bg-sigma-600 hover:bg-sigma-700 text-white rounded-full shadow-lg shadow-sigma-600/30 flex items-center justify-center transition-all hover:scale-110 active:scale-95"
        >
          <ChevronUp className="w-5 h-5" />
        </button>
      )}

      {/* ── Modal ── */}
      {modalOpen && (
        <ApenadoModal
          apenado={editing}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
