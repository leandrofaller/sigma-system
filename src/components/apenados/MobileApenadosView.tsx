'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Plus, UserCheck, Loader2, Monitor, ScanFace } from 'lucide-react';
import { ApenadoCard, type Apenado } from './ApenadoCard';
import { PhotoLightbox } from './PhotoLightbox';
import { ApenadoModal } from './ApenadoModal';
import { FaceSearch } from './FaceSearch';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const PAGE_SIZE = 30;

interface Props {
  stats: { total: number; comFoto: number; semFoto: number };
  letterCounts: Record<string, number>;
  userRole: string;
}

export function MobileApenadosView({ stats: initialStats, letterCounts, userRole }: Props) {
  const isAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN';

  const [statsLocal, setStatsLocal] = useState(initialStats);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Apenado[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchSkip, setSearchSkip] = useState(0);
  const [isLoadingSearch, setIsLoadingSearch] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);

  // Letter state
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const [letterData, setLetterData] = useState<Apenado[]>([]);
  const [isLoadingLetter, setIsLoadingLetter] = useState(false);
  const letterCache = useRef<Map<string, Apenado[]>>(new Map());

  // Modals
  const [lightbox, setLightbox] = useState<Apenado | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Apenado | null>(null);
  const [faceSearchOpen, setFaceSearchOpen] = useState(false);

  const handleEditFromFaceSearch = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/apenados/${id}`);
      if (!res.ok) return;
      const apenado = await res.json();
      setEditing(apenado);
      setModalOpen(true);
    } catch {}
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Run search
  useEffect(() => {
    if (!debouncedSearch) {
      setSearchResults([]);
      setSearchTotal(0);
      setSearchSkip(0);
      return;
    }
    const ctrl = new AbortController();
    searchAbortRef.current?.abort();
    searchAbortRef.current = ctrl;
    setIsLoadingSearch(true);
    setSearchResults([]);
    setSearchSkip(0);

    fetch(`/api/apenados?search=${encodeURIComponent(debouncedSearch)}&skip=0&take=${PAGE_SIZE}`, {
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        if (ctrl.signal.aborted) return;
        setSearchResults(data.apenados ?? []);
        setSearchTotal(data.total ?? 0);
        setSearchSkip(PAGE_SIZE);
      })
      .catch(() => {})
      .finally(() => { if (!ctrl.signal.aborted) setIsLoadingSearch(false); });
  }, [debouncedSearch]);

  // Infinite scroll sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || loadingMoreRef.current) return;

      const isSearchMode = debouncedSearch.length > 0;

      if (isSearchMode) {
        if (searchResults.length >= searchTotal) return;
        loadingMoreRef.current = true;
        setIsLoadingMore(true);
        fetch(`/api/apenados?search=${encodeURIComponent(debouncedSearch)}&skip=${searchSkip}&take=${PAGE_SIZE}`)
          .then((r) => r.json())
          .then((data) => {
            setSearchResults((prev) => [...prev, ...(data.apenados ?? [])]);
            setSearchSkip((s) => s + PAGE_SIZE);
          })
          .finally(() => { setIsLoadingMore(false); loadingMoreRef.current = false; });
      } else if (activeLetter) {
        const letterCount = letterCounts[activeLetter] ?? 0;
        if (letterData.length >= letterCount) return;
        loadingMoreRef.current = true;
        setIsLoadingMore(true);
        fetch(`/api/apenados?letter=${encodeURIComponent(activeLetter)}&skip=${letterData.length}&take=${PAGE_SIZE}`)
          .then((r) => r.json())
          .then((data) => {
            const newRecords = data.apenados ?? [];
            setLetterData((prev) => [...prev, ...newRecords]);
            if (letterCache.current.has(activeLetter)) {
              const currentCached = letterCache.current.get(activeLetter) ?? [];
              const merged = [...currentCached];
              newRecords.forEach((item: Apenado) => {
                if (!merged.some((a) => a.id === item.id)) {
                  merged.push(item);
                }
              });
              letterCache.current.set(activeLetter, merged);
            }
          })
          .finally(() => { setIsLoadingMore(false); loadingMoreRef.current = false; });
      }
    }, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [debouncedSearch, searchResults.length, searchTotal, searchSkip, activeLetter, letterData.length, letterCounts]);

  const loadLetter = useCallback(async (letter: string) => {
    setSearchQuery('');
    setDebouncedSearch('');
    searchAbortRef.current?.abort();
    setActiveLetter(letter);

    if (letterCache.current.has(letter)) {
      setLetterData(letterCache.current.get(letter)!);
      return;
    }
    setIsLoadingLetter(true);
    setLetterData([]);
    try {
      const res = await fetch(`/api/apenados?letter=${encodeURIComponent(letter)}&skip=0&take=${PAGE_SIZE}`);
      const data = await res.json();
      const records: Apenado[] = data.apenados ?? [];
      letterCache.current.set(letter, records);
      setLetterData(records);
    } finally {
      setIsLoadingLetter(false);
    }
  }, []);

  const handleSaved = useCallback((saved: Apenado) => {
    const isNew = editing === null;
    if (isNew) setStatsLocal((prev) => ({ ...prev, total: prev.total + 1 }));

    const letter = saved.name.charAt(0).toUpperCase();
    if (letterCache.current.has(letter)) {
      const cached = letterCache.current.get(letter)!;
      const idx = cached.findIndex((a) => a.id === saved.id);
      const updated = idx >= 0
        ? cached.map((a) => (a.id === saved.id ? saved : a))
        : [...cached, saved].sort((a, b) => a.name.localeCompare(b.name));
      letterCache.current.set(letter, updated);
      if (activeLetter === letter) setLetterData(updated);
    } else if (activeLetter === letter) {
      setLetterData((prev) => {
        const idx = prev.findIndex((a) => a.id === saved.id);
        if (idx >= 0) return prev.map((a) => (a.id === saved.id ? saved : a));
        return [...prev, saved].sort((a, b) => a.name.localeCompare(b.name));
      });
    }
    setSearchResults((prev) => prev.map((a) => (a.id === saved.id ? saved : a)));
    setModalOpen(false);
    setEditing(null);
  }, [activeLetter, editing]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Excluir este registro? Esta ação não pode ser desfeita.')) return;
    const res = await fetch(`/api/apenados/${id}`, { method: 'DELETE' });
    if (!res.ok) { alert('Erro ao excluir.'); return; }

    const record = letterData.find((a) => a.id === id) ?? searchResults.find((a) => a.id === id);
    const letter = record?.name.charAt(0).toUpperCase();
    if (letter && letterCache.current.has(letter)) {
      const updated = letterCache.current.get(letter)!.filter((a) => a.id !== id);
      letterCache.current.set(letter, updated);
      if (activeLetter === letter) setLetterData(updated);
    }
    setStatsLocal((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));
    setSearchResults((prev) => prev.filter((a) => a.id !== id));
  }, [activeLetter, letterData, searchResults]);

  const showSearchMode = debouncedSearch.length > 0;
  const displayedItems = showSearchMode ? searchResults : letterData;
  const isLoading = showSearchMode ? isLoadingSearch : isLoadingLetter;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Sticky header */}
      <div
        className="sticky top-0 z-20 gradient-sigma px-4 pb-3"
        style={{ paddingTop: 'max(1rem, calc(env(safe-area-inset-top) + 0.75rem))' }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <UserCheck className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-tight">Identificação de Apenados</p>
              <p className="text-white/60 text-xs">
                {statsLocal.total.toLocaleString('pt-BR')} registros
                {' · '}
                {statsLocal.comFoto.toLocaleString('pt-BR')} com foto
              </p>
            </div>
          </div>
          <a
            href="/apenados?desktop=1"
            className="flex items-center gap-1 text-white/50 hover:text-white/80 text-[10px] font-medium transition-colors flex-shrink-0"
          >
            <Monitor className="w-3 h-3" /> Completo
          </a>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nome, matrícula, unidade..."
            className="w-full bg-white dark:bg-gray-800 rounded-xl pl-9 pr-9 py-2.5 text-sm text-body placeholder-gray-400 border border-transparent focus:outline-none focus:ring-2 focus:ring-white/30"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setDebouncedSearch(''); searchAbortRef.current?.abort(); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Alphabet bar */}
      {!showSearchMode && (
        <div
          className="overflow-x-auto flex gap-1 px-4 py-2 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex-shrink-0"
          style={{ scrollbarWidth: 'none' }}
        >
          {ALPHABET.map((letter) => {
            const count = letterCounts[letter] ?? 0;
            const isActive = activeLetter === letter;
            return (
              <button
                key={letter}
                onClick={() => count > 0 && loadLetter(letter)}
                disabled={count === 0}
                className={`flex-shrink-0 w-7 h-7 text-xs font-bold rounded-lg transition-all
                  ${isActive
                    ? 'bg-sigma-600 text-white shadow-md shadow-sigma-600/30 scale-110'
                    : count > 0
                      ? 'text-sigma-600 dark:text-sigma-400 hover:bg-sigma-50 dark:hover:bg-sigma-900/30'
                      : 'text-gray-200 dark:text-gray-700 cursor-not-allowed'
                  }`}
              >
                {letter}
              </button>
            );
          })}
        </div>
      )}

      {/* Body */}
      <div
        className="flex-1 p-4"
        style={{ paddingBottom: 'max(5rem, calc(4rem + env(safe-area-inset-bottom)))' }}
      >
        {/* Quick Action: Reconhecimento Facial */}
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setFaceSearchOpen(true)}
            className="flex-1 bg-gradient-to-r from-sigma-600 to-sigma-700 active:scale-[0.98] transition-all text-white font-bold py-3.5 px-4 rounded-2xl shadow-md flex items-center justify-center gap-2.5 text-sm"
          >
            <ScanFace className="w-5 h-5 text-white" />
            Reconhecimento Facial
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => { setEditing(null); setModalOpen(true); }}
              className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 text-body font-bold py-3 px-4 rounded-2xl flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all text-sm shadow-sm"
            >
              <Plus className="w-5 h-5 text-sigma-600" />
              Novo
            </button>
          )}
        </div>
        {/* Initial state */}
        {!showSearchMode && activeLetter === null && !isLoading && (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
            <div className="w-16 h-16 bg-sigma-50 dark:bg-sigma-900/20 rounded-full flex items-center justify-center">
              <UserCheck className="w-8 h-8 text-sigma-400" />
            </div>
            <p className="text-title font-semibold">
              {statsLocal.total === 0 ? 'Nenhum apenado cadastrado' : 'Selecione uma letra ou busque'}
            </p>
            <p className="text-subtle text-sm">
              {statsLocal.total > 0
                ? `${statsLocal.total.toLocaleString('pt-BR')} registros disponíveis`
                : isAdmin ? 'Toque em + para cadastrar' : ''}
            </p>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-sigma-600 animate-spin" />
          </div>
        )}

        {/* Empty search */}
        {!isLoading && showSearchMode && searchResults.length === 0 && debouncedSearch && (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
            <Search className="w-10 h-10 text-gray-300 dark:text-gray-600" />
            <p className="text-title font-semibold">Nenhum resultado</p>
            <p className="text-subtle text-sm">Tente outro termo de busca</p>
          </div>
        )}

        {/* Empty letter */}
        {!showSearchMode && !isLoading && activeLetter !== null && letterData.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-title font-semibold">Nenhum registro para "{activeLetter}"</p>
          </div>
        )}

        {/* Results grid */}
        {!isLoading && displayedItems.length > 0 && (
          <>
            {showSearchMode && (
              <p className="text-xs text-subtle mb-3">
                {searchTotal.toLocaleString('pt-BR')} resultado{searchTotal !== 1 ? 's' : ''} para &quot;{debouncedSearch}&quot;
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              {displayedItems.map((a) => (
                <ApenadoCard
                  key={a.id}
                  apenado={a}
                  userRole={userRole}
                  onEdit={(ap) => { setEditing(ap); setModalOpen(true); }}
                  onDelete={handleDelete}
                  onPhotoClick={setLightbox}
                />
              ))}
            </div>

            {/* Infinite scroll sentinel */}
            {((showSearchMode && searchResults.length < searchTotal) ||
              (!showSearchMode && activeLetter && letterData.length < (letterCounts[activeLetter] ?? 0))) && (
              <div ref={sentinelRef} className="h-4 mt-2" />
            )}
            {isLoadingMore && (
              <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 text-sigma-600 animate-spin" />
              </div>
            )}
          </>
        )}
      </div>

      {/* FAB — add new (admin only) */}
      {isAdmin && (
        <button
          onClick={() => { setEditing(null); setModalOpen(true); }}
          style={{ bottom: 'max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))' }}
          className="fixed right-4 z-30 w-14 h-14 bg-sigma-600 hover:bg-sigma-700 active:bg-sigma-800 text-white rounded-full shadow-xl shadow-sigma-600/30 flex items-center justify-center transition-all active:scale-95"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* Modals */}
      {lightbox && (
        <PhotoLightbox
          apenado={lightbox}
          all={displayedItems}
          onClose={() => setLightbox(null)}
          onNavigate={setLightbox}
          userRole={userRole}
        />
      )}

      {modalOpen && (
        <ApenadoModal
          apenado={editing}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSaved={handleSaved}
          userRole={userRole}
        />
      )}

      {faceSearchOpen && (
        <FaceSearch
          onClose={() => setFaceSearchOpen(false)}
          userRole={userRole}
          onEditApenado={handleEditFromFaceSearch}
        />
      )}
    </div>
  );
}
