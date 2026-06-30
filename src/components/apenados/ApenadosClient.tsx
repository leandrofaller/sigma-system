'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  UserCheck, Search, Download, Plus, LayoutGrid, List,
  Users, Camera, UserX, ChevronUp, FolderInput, Loader2, ScanSearch, Trash2, AlertTriangle, ScanFace, HardDrive, FileImage, Activity, FolderOpen, Eye,
} from 'lucide-react';
import { ApenadoCard, type Apenado } from './ApenadoCard';
import { ApenadoModal } from './ApenadoModal';
import { ImportarPastaModal } from './ImportarPastaModal';
import { PhotoLightbox } from './PhotoLightbox';
import { DuplicateChecker } from './DuplicateChecker';
import { FaceSearch } from './FaceSearch';
import { FaceQualityDashboard } from './FaceQualityDashboard';
import { ApenadoGroupsModal } from './ApenadoGroupsModal';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const SEARCH_PAGE_SIZE = 50;
const LETTER_TAKE_DESKTOP = 500;
const LETTER_TAKE_MOBILE = 30;

const MOBILE_UA = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i;
function isMobileDevice(): boolean {
  return typeof navigator !== 'undefined' && MOBILE_UA.test(navigator.userAgent);
}

interface Stats { total: number; comFoto: number; semFoto: number; diskUsage?: number }

interface Props {
  stats: Stats;
  letterCounts: Record<string, number>;
  userRole: string;
  canEditApenados: boolean;
  canDeletePhotos: boolean;
}

function formatBytes(b: number): string {
  if (!b) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${(b / k ** i).toFixed(1)} ${sizes[i]}`;
}

export function ApenadosClient({ stats: initialStats, letterCounts: initialLetterCounts, userRole, canEditApenados, canDeletePhotos }: Props) {
  const [statsLocal, setStatsLocal] = useState(initialStats);
  const [letterCountsLocal, setLetterCountsLocal] = useState(initialLetterCounts);

  // Letter view
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const [letterData, setLetterData] = useState<Apenado[]>([]);
  const [isLoadingLetter, setIsLoadingLetter] = useState(false);
  const letterCache = useRef<Map<string, Apenado[]>>(new Map());

  // Search
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

  // UI
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Apenado | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [dupCheckerOpen, setDupCheckerOpen] = useState(false);
  const [faceSearchOpen, setFaceSearchOpen] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [qualityTab, setQualityTab] = useState<'lowscore' | 'blurry' | 'pending' | 'noface_doc' | 'noface_tattoo' | 'noface'>('lowscore');
  const [exporting, setExporting] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [lightbox, setLightbox] = useState<Apenado | null>(null);
  const [bulkModal, setBulkModal] = useState<{ type: 'sem-foto' | 'clear-fotos'; count: number } | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);

  // Debounce
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

    fetch(`/api/apenados?search=${encodeURIComponent(debouncedSearch)}&skip=0&take=${SEARCH_PAGE_SIZE}`, {
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        if (ctrl.signal.aborted) return;
        setSearchResults(data.apenados ?? []);
        setSearchTotal(data.total ?? 0);
        setSearchSkip(SEARCH_PAGE_SIZE);
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
        fetch(`/api/apenados?search=${encodeURIComponent(debouncedSearch)}&skip=${searchSkip}&take=${SEARCH_PAGE_SIZE}`)
          .then((r) => r.json())
          .then((data) => {
            setSearchResults((prev) => [...prev, ...(data.apenados ?? [])]);
            setSearchSkip((s) => s + SEARCH_PAGE_SIZE);
          })
          .finally(() => {
            setIsLoadingMore(false);
            loadingMoreRef.current = false;
          });
      } else if (activeLetter) {
        const letterCount = letterCountsLocal[activeLetter] ?? 0;
        if (letterData.length >= letterCount) return;
        loadingMoreRef.current = true;
        setIsLoadingMore(true);
        const take = isMobileDevice() ? LETTER_TAKE_MOBILE : LETTER_TAKE_DESKTOP;
        fetch(`/api/apenados?letter=${encodeURIComponent(activeLetter)}&skip=${letterData.length}&take=${take}`)
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
          .finally(() => {
            setIsLoadingMore(false);
            loadingMoreRef.current = false;
          });
      }
    }, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [debouncedSearch, searchResults.length, searchTotal, searchSkip, activeLetter, letterData.length, letterCountsLocal]);

  // Scroll to top
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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
      const take = isMobileDevice() ? LETTER_TAKE_MOBILE : LETTER_TAKE_DESKTOP;
      const res = await fetch(`/api/apenados?letter=${encodeURIComponent(letter)}&skip=0&take=${take}`);
      const data = await res.json();
      const records: Apenado[] = data.apenados ?? [];
      letterCache.current.set(letter, records);
      setLetterData(records);
    } finally {
      setIsLoadingLetter(false);
    }
  }, []);

  const clearSearch = () => {
    setSearchQuery('');
    setDebouncedSearch('');
    searchAbortRef.current?.abort();
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
    const isNew = editing === null;
    const newLetter = saved.name.charAt(0).toUpperCase();
    const oldLetter = editing?.name.charAt(0).toUpperCase();

    if (isNew) {
      setStatsLocal((prev) => ({ ...prev, total: prev.total + 1 }));
      setLetterCountsLocal((prev) => ({ ...prev, [newLetter]: (prev[newLetter] ?? 0) + 1 }));
    } else if (oldLetter && oldLetter !== newLetter) {
      setLetterCountsLocal((prev) => ({
        ...prev,
        [oldLetter]: Math.max(0, (prev[oldLetter] ?? 1) - 1),
        [newLetter]: (prev[newLetter] ?? 0) + 1,
      }));
      if (letterCache.current.has(oldLetter)) {
        const updated = letterCache.current.get(oldLetter)!.filter((a) => a.id !== saved.id);
        letterCache.current.set(oldLetter, updated);
        if (activeLetter === oldLetter) setLetterData(updated);
      }
    }

    if (letterCache.current.has(newLetter)) {
      const cached = letterCache.current.get(newLetter)!;
      const idx = cached.findIndex((a) => a.id === saved.id);
      const updated = idx >= 0
        ? cached.map((a) => a.id === saved.id ? saved : a)
        : [...cached, saved].sort((a, b) => a.name.localeCompare(b.name));
      letterCache.current.set(newLetter, updated);
      if (activeLetter === newLetter) setLetterData(updated);
    } else if (activeLetter === newLetter) {
      setLetterData((prev) => {
        const idx = prev.findIndex((a) => a.id === saved.id);
        if (idx >= 0) return prev.map((a) => a.id === saved.id ? saved : a);
        return [...prev, saved].sort((a, b) => a.name.localeCompare(b.name));
      });
    }

    setSearchResults((prev) => prev.map((a) => a.id === saved.id ? saved : a));
    setModalOpen(false);
    setEditing(null);
  }, [activeLetter, editing]);

  const handleDelete = useCallback(async (id: string) => {
    const record = letterData.find((a) => a.id === id) ?? searchResults.find((a) => a.id === id);
    const isLinked = record?.isLinkedToSipe;
    const confirmMsg = isLinked
      ? 'Atenção: Este apenado está vinculado a uma ficha oficial do SIPE (Apenados & Facções). Excluir este registro removerá a vinculação visual da ficha dele. Deseja realmente excluir?'
      : 'Excluir este registro? Esta ação não pode ser desfeita.';
    if (!confirm(confirmMsg)) return;
    const res = await fetch(`/api/apenados/${id}`, { method: 'DELETE' });
    if (!res.ok) { alert('Erro ao excluir.'); return; }

    const letter = record?.name.charAt(0).toUpperCase();

    if (letter) {
      setLetterCountsLocal((prev) => ({ ...prev, [letter]: Math.max(0, (prev[letter] ?? 1) - 1) }));
      if (letterCache.current.has(letter)) {
        const updated = letterCache.current.get(letter)!.filter((a) => a.id !== id);
        letterCache.current.set(letter, updated);
        if (activeLetter === letter) setLetterData(updated);
      }
    }

    setStatsLocal((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));
    setSearchResults((prev) => prev.filter((a) => a.id !== id));
  }, [activeLetter, letterData, searchResults]);

  const openNew = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (a: Apenado) => { setEditing(a); setModalOpen(true); };

  const handleEditFromFaceSearch = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/apenados/${id}`);
      if (!res.ok) return;
      const apenado = await res.json();
      // Não fecha o FaceSearch — ApenadoModal renderiza depois no DOM e fica por cima
      setEditing(apenado);
      setModalOpen(true);
    } catch {}
  }, []);

  const handleEditFromLightbox = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/apenados/${id}`);
      if (!res.ok) return;
      const apenado = await res.json();
      setLightbox(null); // fecha lightbox para o modal de edição ocupar a tela
      setEditing(apenado);
      setModalOpen(true);
    } catch {}
  }, []);

  const handleImported = useCallback(async () => {
    try {
      const res = await fetch('/api/apenados/stats');
      const data = await res.json();
      if (data.total !== undefined) {
        setStatsLocal({ total: data.total, comFoto: data.comFoto, semFoto: data.semFoto, diskUsage: data.diskUsage });
        setLetterCountsLocal(data.letterCounts ?? {});
      }
    } catch {}
    // Invalidate entire cache so next letter click fetches fresh
    letterCache.current.clear();
    if (activeLetter) loadLetter(activeLetter);
  }, [activeLetter, loadLetter]);

  const handleBulkClick = async (type: 'sem-foto' | 'clear-fotos') => {
    const res = await fetch('/api/apenados/bulk');
    const data = await res.json();
    const count = type === 'sem-foto' ? (data.semFoto ?? 0) : (data.comFoto ?? 0);
    setBulkModal({ type, count });
  };

  const handleBulkConfirm = async () => {
    if (!bulkModal) return;
    setBulkLoading(true);
    try {
      const res = await fetch(`/api/apenados/bulk?action=${bulkModal.type}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Erro ao executar operação.');
        return;
      }
      const statsRes = await fetch('/api/apenados/stats');
      const statsData = await statsRes.json();
      if (statsData.total !== undefined) {
        setStatsLocal({ total: statsData.total, comFoto: statsData.comFoto, semFoto: statsData.semFoto, diskUsage: statsData.diskUsage });
        setLetterCountsLocal(statsData.letterCounts ?? {});
      }
      letterCache.current.clear();
      setLetterData([]);
      setActiveLetter(null);
      setBulkModal(null);
    } catch (err: any) {
      alert(err.message || 'Erro ao executar operação.');
    } finally {
      setBulkLoading(false);
    }
  };

  const showSearchMode = debouncedSearch.length > 0;
  const showLetterMode = !showSearchMode && activeLetter !== null;
  const showInitial = !showSearchMode && activeLetter === null;
  const displayedItems = showSearchMode ? searchResults : letterData;
  const isLoading = showSearchMode ? isLoadingSearch : isLoadingLetter;
  const letterCount = activeLetter ? (letterCountsLocal[activeLetter] ?? 0) : 0;

  return (
    <div className="flex flex-col gap-0 animate-fade-in">
      {/* Hero header */}
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
                disabled={exporting || statsLocal.total === 0}
                className="flex items-center gap-2 text-sm font-medium text-white border border-white/30 hover:bg-white/10 px-4 py-2 rounded-xl transition-all disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {exporting ? 'Exportando...' : 'Exportar ZIP'}
              </button>
              {(userRole === 'SUPER_ADMIN' || userRole === 'ADMIN' || userRole === 'OPERATOR') && (
                <button
                  onClick={() => setFaceSearchOpen(true)}
                  className="flex items-center gap-2 text-sm font-medium text-white border border-white/30 hover:bg-white/10 px-4 py-2 rounded-xl transition-all"
                >
                  <ScanFace className="w-4 h-4" /> Reconhecimento
                </button>
              )}
              {(userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') && (
                <button
                  onClick={() => setDupCheckerOpen(true)}
                  className="flex items-center gap-2 text-sm font-medium text-white border border-white/30 hover:bg-white/10 px-4 py-2 rounded-xl transition-all"
                >
                  <ScanSearch className="w-4 h-4" /> Duplicatas
                </button>
              )}
              {(userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') && (
                <button
                  onClick={() => { setQualityTab('noface'); setQualityOpen(true); }}
                  className="flex items-center gap-2 text-sm font-medium text-orange-200 border border-orange-300/40 hover:bg-orange-300/10 px-4 py-2 rounded-xl transition-all"
                >
                  <FileImage className="w-4 h-4" /> Sem Rosto
                </button>
              )}
              {(userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') && (
                <button
                  onClick={() => { setQualityTab('lowscore'); setQualityOpen(true); }}
                  className="flex items-center gap-2 text-sm font-medium text-blue-200 border border-blue-300/40 hover:bg-blue-300/10 px-4 py-2 rounded-xl transition-all"
                >
                  <Activity className="w-4 h-4" /> Qualidade Facial
                </button>
              )}
              <button
                onClick={() => setGroupsOpen(true)}
                className="flex items-center gap-2 text-sm font-medium text-purple-200 border border-purple-300/40 hover:bg-purple-300/10 px-4 py-2 rounded-xl transition-all"
              >
                <FolderOpen className="w-4 h-4" /> Grupos
              </button>
              {(userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') && (
                <button
                  onClick={() => handleBulkClick('sem-foto')}
                  disabled={statsLocal.semFoto === 0}
                  className="flex items-center gap-2 text-sm font-medium text-yellow-200 border border-yellow-300/40 hover:bg-yellow-300/10 px-4 py-2 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <UserX className="w-4 h-4" /> Limpar Sem Foto
                </button>
              )}
              {userRole === 'SUPER_ADMIN' && (
                <button
                  onClick={() => handleBulkClick('clear-fotos')}
                  disabled={statsLocal.comFoto === 0}
                  className="flex items-center gap-2 text-sm font-medium text-red-300 border border-red-400/40 hover:bg-red-400/10 px-4 py-2 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-4 h-4" /> Deletar Todas as Fotos
                </button>
              )}
              {canEditApenados && (
                <>
                  <button
                    onClick={() => setImportOpen(true)}
                    className="flex items-center gap-2 text-sm font-medium text-white border border-white/30 hover:bg-white/10 px-4 py-2 rounded-xl transition-all"
                  >
                    <FolderInput className="w-4 h-4" /> Importar Pasta
                  </button>
                  <button
                    onClick={openNew}
                    className="flex items-center gap-2 text-sm font-bold bg-white text-sigma-700 hover:bg-sigma-50 px-4 py-2 rounded-xl transition-all shadow-lg"
                  >
                    <Plus className="w-4 h-4" /> Novo Apenado
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-6 mt-5 flex-wrap">
            {[
              { icon: Users, label: 'Total', display: statsLocal.total.toLocaleString('pt-BR'), color: 'text-white' },
              { icon: Camera, label: 'Com foto', display: statsLocal.comFoto.toLocaleString('pt-BR'), color: 'text-green-300' },
              { icon: UserX, label: 'Sem foto', display: statsLocal.semFoto.toLocaleString('pt-BR'), color: 'text-yellow-300' },
              { icon: HardDrive, label: 'Em disco', display: formatBytes(statsLocal.diskUsage ?? 0), color: 'text-blue-300' },
            ].map(({ icon: Icon, label, display, color }) => (
              <div key={label} className="flex items-center gap-2">
                <Icon className={`w-4 h-4 ${color}`} />
                <div>
                  <span className="text-white font-bold text-lg leading-none">
                    {display}
                  </span>
                  <span className="text-white/60 text-xs ml-1.5">{label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Search + view toggle */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nome, matrícula ou unidade..."
            className="w-full input-base pl-9 pr-4 py-2.5 text-sm"
          />
          {searchQuery && (
            <button onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-medium">
              ✕
            </button>
          )}
        </div>
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 gap-1">
          {([['grid', LayoutGrid], ['list', List]] as const).map(([mode, Icon]) => (
            <button key={mode} onClick={() => setViewMode(mode)}
              className={`p-2 rounded-lg transition-all ${viewMode === mode
                ? 'bg-white dark:bg-gray-700 shadow-sm text-sigma-600'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>
      </div>

      {/* Alphabet bar */}
      <div className="sticky top-0 z-20 bg-white/95 dark:bg-gray-950/95 backdrop-blur-sm py-2 mb-4 border-b border-gray-100 dark:border-gray-800 -mx-1 px-1">
        <div className="flex flex-wrap gap-0.5">
          {ALPHABET.map((letter) => {
            const count = letterCountsLocal[letter] ?? 0;
            const isActive = activeLetter === letter && !showSearchMode;
            return (
              <button
                key={letter}
                onClick={() => count > 0 && loadLetter(letter)}
                disabled={count === 0}
                title={count > 0 ? `${count.toLocaleString('pt-BR')} registros` : undefined}
                className={`w-7 h-7 text-xs font-bold rounded-lg transition-all
                  ${isActive
                    ? 'bg-sigma-600 text-white shadow-lg shadow-sigma-600/30 scale-110'
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
      </div>

      {/* Initial state */}
      {showInitial && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-20 h-20 bg-sigma-50 dark:bg-sigma-900/20 rounded-full flex items-center justify-center mb-4">
            <UserCheck className="w-10 h-10 text-sigma-400" />
          </div>
          <p className="text-title font-semibold text-lg">
            {statsLocal.total === 0 ? 'Nenhum apenado cadastrado' : 'Selecione uma letra ou busque'}
          </p>
          <p className="text-subtle text-sm mt-1">
            {statsLocal.total === 0
              ? 'Clique em "Novo Apenado" para começar'
              : `${statsLocal.total.toLocaleString('pt-BR')} registros disponíveis`}
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
      {showSearchMode && !isLoading && searchResults.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
            <Search className="w-10 h-10 text-gray-300 dark:text-gray-600" />
          </div>
          <p className="text-title font-semibold text-lg">Nenhum resultado encontrado</p>
          <p className="text-subtle text-sm mt-1">Tente outro termo de busca</p>
        </div>
      )}

      {/* Empty letter */}
      {showLetterMode && !isLoading && letterData.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-title font-semibold text-lg">Nenhum registro para esta letra</p>
        </div>
      )}

      {/* Results */}
      {!isLoading && displayedItems.length > 0 && (
        <div className="space-y-4">
          {/* Section header */}
          <div className="flex items-center gap-3">
            {showSearchMode ? (
              <span className="text-sm font-semibold text-title">
                {searchTotal.toLocaleString('pt-BR')} resultado{searchTotal !== 1 ? 's' : ''}{' '}
                para &quot;{debouncedSearch}&quot;
              </span>
            ) : (
              <>
                <div className="w-10 h-10 bg-gradient-to-br from-sigma-500 to-sigma-700 rounded-xl flex items-center justify-center shadow-lg shadow-sigma-500/20 flex-shrink-0">
                  <span className="text-white font-bold text-lg">{activeLetter}</span>
                </div>
                <span className="text-sm font-semibold text-title">
                  {letterCount.toLocaleString('pt-BR')} registro{letterCount !== 1 ? 's' : ''}
                  {letterData.length < letterCount && (
                    <span className="font-normal text-subtle ml-1">
                      (exibindo {letterData.length.toLocaleString('pt-BR')})
                    </span>
                  )}
                </span>
              </>
            )}
          </div>

          {viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {displayedItems.map((a) => (
                <ApenadoCard
                  key={a.id}
                  apenado={a}
                  userRole={userRole}
                  canEditApenados={canEditApenados}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onPhotoClick={setLightbox}
                />
              ))}
            </div>
          ) : (
            <div className="card divide-y divide-gray-50 dark:divide-gray-800">
              {displayedItems.map((a) => (
                <div key={a.id}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition-colors">
                  <div
                    className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 bg-gradient-to-br from-sigma-400 to-sigma-700 cursor-pointer hover:ring-2 hover:ring-sigma-500 transition-all"
                    onClick={() => setLightbox(a)}
                  >
                    {a.photoPath ? (
                      <img src={`/api/apenados/${a.id}/foto${a._photoTs ? `?t=${a._photoTs}` : ''}`} alt={a.name}
                        loading="lazy"
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-white font-bold text-sm">{a.name.charAt(0)}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-title truncate">{a.name}</p>
                      {a.isLinkedToSipe && (
                        <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-[9px] font-bold rounded flex items-center gap-1 shrink-0">
                          <span className="w-1 h-1 bg-green-500 rounded-full" />
                          SIPE
                        </span>
                      )}
                    </div>
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
                      title={canEditApenados ? "Editar apenado" : "Ver dados do apenado"}
                      className="p-1.5 text-gray-400 hover:text-sigma-600 hover:bg-sigma-50 dark:hover:bg-sigma-900/30 rounded-lg transition-colors">
                      {canEditApenados ? (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
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

          {/* Infinite scroll sentinel */}
          {((showSearchMode && searchResults.length < searchTotal) ||
            (showLetterMode && letterData.length < letterCount)) && (
            <div ref={sentinelRef} className="h-4" />
          )}

          {isLoadingMore && (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 text-sigma-600 animate-spin" />
            </div>
          )}
        </div>
      )}

      {/* Scroll to top */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 z-30 w-10 h-10 bg-sigma-600 hover:bg-sigma-700 text-white rounded-full shadow-lg shadow-sigma-600/30 flex items-center justify-center transition-all hover:scale-110 active:scale-95"
        >
          <ChevronUp className="w-5 h-5" />
        </button>
      )}

      {importOpen && (
        <ImportarPastaModal
          onClose={() => setImportOpen(false)}
          onImported={() => { handleImported(); setImportOpen(false); }}
        />
      )}

      {faceSearchOpen && (
        <FaceSearch onClose={() => setFaceSearchOpen(false)} userRole={userRole} onEditApenado={handleEditFromFaceSearch} />
      )}

      {dupCheckerOpen && (
        <DuplicateChecker
          onClose={() => setDupCheckerOpen(false)}
          onPhotoDeleted={(id) => {
            // Remove photo from letter cache and displayed items
            setLetterData((prev) => prev.map((a) => a.id === id ? { ...a, photoPath: null } : a));
            setSearchResults((prev) => prev.map((a) => a.id === id ? { ...a, photoPath: null } : a));
            if (letterCache.current) {
              for (const [letter, items] of letterCache.current.entries()) {
                if (items.some((a) => a.id === id)) {
                  letterCache.current.set(letter, items.map((a) => a.id === id ? { ...a, photoPath: null } : a));
                  break;
                }
              }
            }
            setStatsLocal((prev) => ({ ...prev, comFoto: Math.max(0, prev.comFoto - 1), semFoto: prev.semFoto + 1 }));
          }}
        />
      )}


      {qualityOpen && (
        <FaceQualityDashboard
          defaultTab={qualityTab}
          onClose={() => setQualityOpen(false)}
          onPhotosRemoved={(ids) => {
            // Clear photoPath for affected records in all caches
            for (const [letter, items] of letterCache.current.entries()) {
              const updated = items.map((a) => ids.includes(a.id) ? { ...a, photoPath: null } : a);
              if (updated.some((_, i) => items[i].photoPath !== updated[i].photoPath)) {
                letterCache.current.set(letter, updated);
              }
            }
            setLetterData((prev) => prev.map((a) => ids.includes(a.id) ? { ...a, photoPath: null } : a));
            setSearchResults((prev) => prev.map((a) => ids.includes(a.id) ? { ...a, photoPath: null } : a));
            setStatsLocal((prev) => ({ ...prev, comFoto: Math.max(0, prev.comFoto - ids.length), semFoto: prev.semFoto + ids.length }));
          }}
        />
      )}

      {bulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                bulkModal.type === 'clear-fotos'
                  ? 'bg-red-100 dark:bg-red-900/30'
                  : 'bg-yellow-100 dark:bg-yellow-900/30'
              }`}>
                <AlertTriangle className={`w-6 h-6 ${
                  bulkModal.type === 'clear-fotos' ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'
                }`} />
              </div>
              <div>
                <h3 className="font-bold text-title text-lg">
                  {bulkModal.type === 'sem-foto' ? 'Limpar registros sem foto' : 'Deletar todas as fotos'}
                </h3>
                <p className="text-subtle text-sm mt-1">
                  {bulkModal.type === 'sem-foto'
                    ? `Serão excluídos permanentemente ${bulkModal.count.toLocaleString('pt-BR')} registro${bulkModal.count !== 1 ? 's' : ''} sem foto. Os registros com foto não serão afetados.`
                    : `As fotos de ${bulkModal.count.toLocaleString('pt-BR')} registro${bulkModal.count !== 1 ? 's' : ''} serão removidas permanentemente do disco. Os dados cadastrais (nome, matrícula, etc.) serão mantidos.`}
                </p>
              </div>
            </div>
            <p className="text-xs text-red-500 dark:text-red-400 font-medium mb-5">
              Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setBulkModal(null)}
                disabled={bulkLoading}
                className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl text-body hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleBulkConfirm}
                disabled={bulkLoading}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl text-white transition-colors disabled:opacity-50 ${
                  bulkModal.type === 'clear-fotos'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-yellow-600 hover:bg-yellow-700'
                }`}
              >
                {bulkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
                {bulkModal.type === 'sem-foto' ? 'Limpar registros' : 'Deletar fotos'}
              </button>
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <PhotoLightbox
          apenado={lightbox}
          all={displayedItems}
          onClose={() => setLightbox(null)}
          onNavigate={setLightbox}
          onEditApenado={handleEditFromLightbox}
          userRole={userRole}
          canEditApenados={canEditApenados}
        />
      )}

      {groupsOpen && (
        <ApenadoGroupsModal onClose={() => setGroupsOpen(false)} userRole={userRole} />
      )}

      {/* ApenadoModal renderiza por último para ficar acima de FaceSearch, PhotoLightbox e demais modais */}
      {modalOpen && (
        <ApenadoModal
          apenado={editing}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSaved={handleSaved}
          userRole={userRole}
          canEditApenados={canEditApenados}
          canDeletePhotos={canDeletePhotos}
        />
      )}
    </div>
  );
}
