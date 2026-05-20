'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  X, FolderOpen, CheckCircle, XCircle, Loader2, ImageIcon,
  AlertTriangle, FolderInput, Clock, ChevronDown, ChevronUp,
} from 'lucide-react';
import type { Apenado } from './ApenadoCard';

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp']);

// Above this threshold: no blob URLs, no per-file DOM, counter-only UI
const BULK_THRESHOLD = 100;
const CONCURRENCY_PREVIEW = 3;
const CONCURRENCY_BULK = 6;

function fileToName(file: File): string {
  const base = file.name.replace(/\.[^.]+$/, '').trim();
  return base.replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').toUpperCase();
}

type FileStatus = 'pending' | 'importing' | 'done' | 'error';

interface FileEntry {
  file: File;
  name: string;
  previewUrl: string;
  status: FileStatus;
  step?: 'creating' | 'uploading';
  error?: string;
}

interface BulkError { name: string; msg: string }

interface Props {
  onClose: () => void;
  onImported: (apenados: Apenado[]) => void;
}

export function ImportarPastaModal({ onClose, onImported }: Props) {
  // ── Preview mode (< BULK_THRESHOLD) ──────────────────────────────
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [previewDone, setPreviewDone] = useState(0);
  const [previewErrors, setPreviewErrors] = useState(0);
  const previewUrlsRef = useRef<string[]>([]);

  // ── Bulk mode (≥ BULK_THRESHOLD) ─────────────────────────────────
  const bulkFilesRef = useRef<File[]>([]);
  const [bulkTotal, setBulkTotal] = useState(0);
  const [bulkProcessed, setBulkProcessed] = useState(0);
  const [bulkDone, setBulkDone] = useState(0);
  const [bulkErrCount, setBulkErrCount] = useState(0);
  const [bulkCurrentNames, setBulkCurrentNames] = useState<string[]>([]);
  const [bulkErrorList, setBulkErrorList] = useState<BulkError[]>([]);
  const [showErrors, setShowErrors] = useState(false);

  // ── Shared ────────────────────────────────────────────────────────
  const [isBulk, setIsBulk] = useState(false);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const folderRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    previewUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
  }, []);

  const resetAll = useCallback(() => {
    previewUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
    previewUrlsRef.current = [];
    setEntries([]);
    setPreviewDone(0);
    setPreviewErrors(0);
    bulkFilesRef.current = [];
    setIsBulk(false);
    setBulkTotal(0);
    setBulkProcessed(0);
    setBulkDone(0);
    setBulkErrCount(0);
    setBulkCurrentNames([]);
    setBulkErrorList([]);
    setShowErrors(false);
    setDone(false);
    setScanning(false);
  }, []);

  // ── File loading ──────────────────────────────────────────────────
  const loadFiles = useCallback((fileList: FileList | null) => {
    if (!fileList) return;
    const imgs: File[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      if (IMAGE_EXTS.has(ext)) imgs.push(f);
    }
    if (imgs.length < BULK_THRESHOLD) {
      imgs.sort((a, b) => fileToName(a).localeCompare(fileToName(b)));
    }

    setDone(false);

    if (imgs.length >= BULK_THRESHOLD) {
      // Bulk mode: store files in ref only, no blob URLs
      previewUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
      previewUrlsRef.current = [];
      setEntries([]);
      setPreviewDone(0);
      setPreviewErrors(0);

      bulkFilesRef.current = imgs;
      setIsBulk(true);
      setBulkTotal(imgs.length);
      setBulkProcessed(0);
      setBulkDone(0);
      setBulkErrCount(0);
      setBulkCurrentNames([]);
      setBulkErrorList([]);
      setShowErrors(false);
    } else {
      // Preview mode: blob URLs + entries state
      previewUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
      previewUrlsRef.current = [];
      bulkFilesRef.current = [];
      setIsBulk(false);
      setBulkTotal(0);
      setPreviewDone(0);
      setPreviewErrors(0);

      const entryList: FileEntry[] = imgs.map(f => {
        const url = URL.createObjectURL(f);
        previewUrlsRef.current.push(url);
        return { file: f, name: fileToName(f), previewUrl: url, status: 'pending' };
      });
      setEntries(entryList);
    }
  }, []);

  // ── File System Access API (lazy, non-blocking) ───────────────────
  const scanDirectory = useCallback(async (dirHandle: any) => {
    previewUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
    previewUrlsRef.current = [];
    setEntries([]);
    setPreviewDone(0); setPreviewErrors(0);
    bulkFilesRef.current = [];
    setIsBulk(true);
    setBulkTotal(0); setBulkProcessed(0); setBulkDone(0);
    setBulkErrCount(0); setBulkCurrentNames([]); setBulkErrorList([]);
    setShowErrors(false); setDone(false); setScanning(true);

    let count = 0;

    async function recurse(handle: any) {
      for await (const [, entry] of handle.entries()) {
        if (entry.kind === 'file') {
          const ext = (entry.name as string).split('.').pop()?.toLowerCase() ?? '';
          if (IMAGE_EXTS.has(ext)) {
            bulkFilesRef.current.push(await entry.getFile());
            count++;
            if (count % 500 === 0) setBulkTotal(count);
          }
        } else if (entry.kind === 'directory') {
          await recurse(entry);
        }
      }
    }

    try {
      await recurse(dirHandle);
    } finally {
      setBulkTotal(count);
      setScanning(false);
    }
  }, []);

  const handlePickFolder = useCallback(async () => {
    if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
      try {
        const dirHandle = await (window as any).showDirectoryPicker({ mode: 'read' });
        await scanDirectory(dirHandle);
      } catch (e: any) {
        if (e?.name !== 'AbortError') console.error(e);
      }
    } else {
      folderRef.current?.click();
    }
  }, [scanDirectory]);

  // ── API helpers ───────────────────────────────────────────────────
  async function apiCreate(name: string): Promise<Apenado> {
    const res = await fetch('/api/apenados', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      throw new Error(b?.error ?? `Erro ${res.status} ao criar registro`);
    }
    return res.json();
  }

  async function apiUploadFoto(id: string, file: File): Promise<void> {
    const fd = new FormData();
    fd.append('foto', file);
    const res = await fetch(`/api/apenados/${id}/foto`, { method: 'POST', body: fd });
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      throw new Error(b?.error ?? `Erro ${res.status} no upload da foto`);
    }
  }

  // ── Preview mode import ───────────────────────────────────────────
  const importOnePreview = useCallback(async (idx: number, entry: FileEntry): Promise<Apenado | null> => {
    setEntries(prev => {
      const n = [...prev];
      n[idx] = { ...n[idx], status: 'importing', step: 'creating' };
      return n;
    });
    try {
      const apenado = await apiCreate(entry.name);
      setEntries(prev => { const n = [...prev]; n[idx] = { ...n[idx], step: 'uploading' }; return n; });
      await apiUploadFoto(apenado.id, entry.file);
      apenado.photoPath = `uploads/apenados/${apenado.id}.webp`;
      setEntries(prev => { const n = [...prev]; n[idx] = { ...n[idx], status: 'done', step: undefined }; return n; });
      setPreviewDone(c => c + 1);
      return apenado;
    } catch (e: any) {
      setEntries(prev => { const n = [...prev]; n[idx] = { ...n[idx], status: 'error', step: undefined, error: e.message }; return n; });
      setPreviewErrors(c => c + 1);
      return null;
    }
  }, []);

  // ── Bulk mode import ──────────────────────────────────────────────
  const importOneBulk = useCallback(async (file: File): Promise<{ apenado: Apenado | null; err: string | null }> => {
    const name = fileToName(file);
    try {
      const apenado = await apiCreate(name);
      await apiUploadFoto(apenado.id, file);
      apenado.photoPath = `uploads/apenados/${apenado.id}.webp`;
      return { apenado, err: null };
    } catch (e: any) {
      return { apenado: null, err: e.message };
    }
  }, []);

  // ── Main handler ──────────────────────────────────────────────────
  const handleImport = useCallback(async () => {
    if (running) return;
    setRunning(true);
    const created: Apenado[] = [];

    if (isBulk) {
      const files = bulkFilesRef.current;
      const errs: BulkError[] = [];
      let processed = 0, done = 0, errCount = 0;

      for (let i = 0; i < files.length; i += CONCURRENCY_BULK) {
        const batch = files.slice(i, i + CONCURRENCY_BULK);
        setBulkCurrentNames(batch.map(f => fileToName(f)));

        const results = await Promise.all(batch.map(f => importOneBulk(f)));

        for (let j = 0; j < results.length; j++) {
          processed++;
          const r = results[j];
          if (r.apenado) { done++; created.push(r.apenado); }
          else if (r.err) { errCount++; errs.push({ name: fileToName(batch[j]), msg: r.err }); }
        }

        setBulkProcessed(processed);
        setBulkDone(done);
        setBulkErrCount(errCount);
        if (errs.length > 0) setBulkErrorList(prev => [...prev, ...errs.slice(prev.length)]);
      }

      setBulkCurrentNames([]);
    } else {
      const snapshot = entries.map((e, i) => ({ entry: e, idx: i }));
      for (let i = 0; i < snapshot.length; i += CONCURRENCY_PREVIEW) {
        const batch = snapshot.slice(i, i + CONCURRENCY_PREVIEW);
        const results = await Promise.all(batch.map(({ entry, idx }) => importOnePreview(idx, entry)));
        results.forEach(r => { if (r) created.push(r); });
      }
    }

    setRunning(false);
    setDone(true);
    if (created.length > 0) onImported(created);
  }, [running, isBulk, entries, importOneBulk, importOnePreview, onImported]);

  // ── Derived values ────────────────────────────────────────────────
  const total     = isBulk ? bulkTotal    : entries.length;
  const processed = isBulk ? bulkProcessed : previewDone + previewErrors;
  const doneCount = isBulk ? bulkDone     : previewDone;
  const errCount  = isBulk ? bulkErrCount : previewErrors;
  const progress  = total > 0 ? Math.round((processed / total) * 100) : 0;
  const pending   = total - processed - (isBulk ? bulkCurrentNames.length : entries.filter(e => e.status === 'importing').length);

  const progressColor =
    done && errCount === 0  ? 'bg-green-500' :
    done && doneCount === 0 ? 'bg-red-500'   :
    done                    ? 'bg-orange-500' : 'bg-sigma-600';

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) loadFiles(e.dataTransfer.files);
  };

  // Estimated time remaining (bulk only)
  const etaText = (() => {
    if (!isBulk || !running || processed < 6) return null;
    const remaining = total - processed;
    if (remaining <= 0) return null;
    // rough 0.8s per file at current concurrency
    const secsLeft = Math.round((remaining / CONCURRENCY_BULK) * 0.8);
    if (secsLeft < 60) return `~${secsLeft}s restantes`;
    const mins = Math.round(secsLeft / 60);
    return `~${mins} min restantes`;
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={!running ? onClose : undefined} />

      <div className="relative z-10 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="gradient-sigma px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
              {running || scanning ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <FolderInput className="w-5 h-5 text-white" />}
            </div>
            <div>
              <p className="text-white font-bold text-sm">
                {running  ? `Importando... ${progress}%` :
                 done     ? 'Importação concluída' :
                 scanning ? 'Escaneando pasta...' :
                            'Importar Pasta de Fotos'}
              </p>
              <p className="text-white/70 text-xs">
                {running  ? `${processed.toLocaleString()} de ${total.toLocaleString()} arquivos` :
                 done     ? `${doneCount.toLocaleString()} importados · ${errCount.toLocaleString()} erros` :
                 scanning ? `${total.toLocaleString()} imagens encontradas...` :
                            'Nome do arquivo = nome do apenado'}
              </p>
            </div>
          </div>
          {!running && (
            <button onClick={onClose} className="text-white/70 hover:text-white transition-colors p-1">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Thin progress stripe */}
        {(running || done) && (
          <div className="h-1.5 bg-gray-100 dark:bg-gray-800 flex-shrink-0">
            <div className={`h-full transition-all duration-300 ease-out ${progressColor}`} style={{ width: `${progress}%` }} />
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {/* Drop zone — shown only when no files loaded */}
          {total === 0 && (
            <div
              className={`rounded-xl border-2 border-dashed transition-all cursor-pointer p-10 flex flex-col items-center gap-4 text-center
                ${dragging ? 'border-sigma-400 bg-sigma-50 dark:bg-sigma-900/20'
                           : 'border-gray-200 dark:border-gray-700 hover:border-sigma-300 dark:hover:border-sigma-700 hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
              onClick={handlePickFolder}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <div className="w-16 h-16 bg-sigma-50 dark:bg-sigma-900/30 rounded-2xl flex items-center justify-center">
                <FolderOpen className="w-8 h-8 text-sigma-500" />
              </div>
              <div>
                <p className="text-base font-semibold text-title">Selecionar pasta de fotos</p>
                <p className="text-sm text-subtle mt-1">Clique para escolher uma pasta</p>
                <p className="text-xs text-subtle mt-2 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full inline-block">
                  JPG · JPEG · PNG · WebP
                </p>
              </div>
            </div>
          )}

          <input ref={folderRef} type="file" className="hidden" multiple accept="image/*"
            {...{ webkitdirectory: '' } as any}
            onChange={e => loadFiles(e.target.files)} />

          {/* ── BULK MODE UI ─────────────────────────────────────── */}
          {isBulk && total > 0 && (
            <div className="space-y-4">
              {/* Summary card */}
              <div className="rounded-xl border border-sigma-100 dark:border-sigma-900 bg-sigma-50 dark:bg-sigma-900/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-sigma-600" />
                    <span className="font-bold text-sigma-700 dark:text-sigma-300 text-sm">
                      {total.toLocaleString()} imagens encontradas
                    </span>
                  </div>
                  {!running && !done && (
                    <button onClick={resetAll} className="text-xs text-subtle hover:text-red-500 transition-colors">
                      Limpar
                    </button>
                  )}
                </div>
                {scanning ? (
                  <div className="flex items-center gap-2 text-xs text-sigma-600 dark:text-sigma-400">
                    <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                    <span>Escaneando pasta... {total.toLocaleString()} imagens encontradas até agora</span>
                  </div>
                ) : (
                  <p className="text-xs text-subtle">
                    Modo bulk ativo — sem pré-visualização para economizar memória.
                    Processamento em lotes de {CONCURRENCY_BULK} arquivos simultâneos.
                  </p>
                )}
              </div>

              {/* Progress panel — shown when running or done */}
              {(running || done) && (
                <div className={`rounded-xl border p-4 space-y-3 ${
                  done && errCount === 0  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' :
                  done && doneCount === 0 ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' :
                  done                   ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800' :
                                           'bg-sigma-50 dark:bg-sigma-900/20 border-sigma-200 dark:border-sigma-800'
                }`}>
                  {/* Big progress bar */}
                  <div className="space-y-1">
                    <div className="flex items-end justify-between mb-1">
                      <span className="text-xs font-semibold text-subtle">
                        {running ? 'Processando...' :
                         done && errCount === 0  ? 'Concluído com sucesso!' :
                         done && doneCount === 0 ? 'Falha na importação' :
                         'Concluído com erros'}
                      </span>
                      <span className="text-3xl font-black tabular-nums text-title leading-none">{progress}%</span>
                    </div>
                    <div className="h-6 bg-white/60 dark:bg-black/20 rounded-full overflow-hidden shadow-inner">
                      <div className={`h-full rounded-full transition-all duration-300 ease-out ${progressColor}`}
                        style={{ width: `${progress}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-subtle pt-0.5">
                      <span>{processed.toLocaleString()} de {total.toLocaleString()}</span>
                      {etaText && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{etaText}</span>}
                    </div>
                  </div>

                  {/* Counters */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white/60 dark:bg-black/20 rounded-xl p-3 text-center">
                      <p className="text-2xl font-black text-green-600 tabular-nums">{doneCount.toLocaleString()}</p>
                      <p className="text-[10px] text-subtle font-semibold mt-0.5">IMPORTADOS</p>
                    </div>
                    <div className="bg-white/60 dark:bg-black/20 rounded-xl p-3 text-center">
                      <p className="text-2xl font-black text-red-500 tabular-nums">{errCount.toLocaleString()}</p>
                      <p className="text-[10px] text-subtle font-semibold mt-0.5">ERROS</p>
                    </div>
                    <div className="bg-white/60 dark:bg-black/20 rounded-xl p-3 text-center">
                      <p className="text-2xl font-black text-subtle tabular-nums">{(total - processed).toLocaleString()}</p>
                      <p className="text-[10px] text-subtle font-semibold mt-0.5">PENDENTES</p>
                    </div>
                  </div>

                  {/* Currently processing */}
                  {running && bulkCurrentNames.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] text-subtle font-semibold uppercase tracking-wider">Processando agora</p>
                      {bulkCurrentNames.map((name, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <Loader2 className="w-3 h-3 text-sigma-500 animate-spin flex-shrink-0" />
                          <span className="text-sigma-700 dark:text-sigma-300 font-medium truncate">{name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Error list (expandable) */}
              {bulkErrorList.length > 0 && (
                <div className="rounded-xl border border-red-200 dark:border-red-800 overflow-hidden">
                  <button
                    onClick={() => setShowErrors(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-red-50 dark:bg-red-900/20 text-sm font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <XCircle className="w-4 h-4" />
                      {bulkErrorList.length.toLocaleString()} {bulkErrorList.length === 1 ? 'erro' : 'erros'} — clique para ver
                    </span>
                    {showErrors ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showErrors && (
                    <div className="max-h-40 overflow-y-auto divide-y divide-red-100 dark:divide-red-900">
                      {bulkErrorList.map((e, i) => (
                        <div key={i} className="px-4 py-2 flex gap-3 items-start text-xs">
                          <span className="font-semibold text-red-700 dark:text-red-300 flex-1 truncate">{e.name}</span>
                          <span className="text-red-500 flex-shrink-0 max-w-[180px] truncate">{e.msg}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── PREVIEW MODE UI ──────────────────────────────────── */}
          {!isBulk && entries.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-title">
                  <ImageIcon className="w-4 h-4 text-sigma-500" />
                  {entries.length} {entries.length === 1 ? 'imagem' : 'imagens'}
                </span>
                {!running && !done && (
                  <button onClick={resetAll} className="text-xs text-subtle hover:text-red-500 transition-colors">Limpar</button>
                )}
              </div>

              {/* Progress panel */}
              {(running || done) && (
                <div className={`rounded-xl border p-4 space-y-3 ${
                  done && errCount === 0 ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' :
                  done                  ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800' :
                                          'bg-sigma-50 dark:bg-sigma-900/20 border-sigma-200 dark:border-sigma-800'
                }`}>
                  <div className="flex items-end justify-between mb-1">
                    <span className="text-xs font-semibold text-subtle">
                      {running ? 'Importando...' : done && errCount === 0 ? 'Concluído!' : 'Concluído com erros'}
                    </span>
                    <span className="text-2xl font-black tabular-nums text-title">{progress}%</span>
                  </div>
                  <div className="h-5 bg-white/60 dark:bg-black/20 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-300 ${progressColor}`}
                      style={{ width: `${progress}%` }} />
                  </div>
                  <div className="flex gap-4 text-xs">
                    <span className="flex items-center gap-1 text-green-600 font-semibold">
                      <CheckCircle className="w-3 h-3" /> {doneCount} ok
                    </span>
                    {errCount > 0 && (
                      <span className="flex items-center gap-1 text-red-500 font-semibold">
                        <XCircle className="w-3 h-3" /> {errCount} erros
                      </span>
                    )}
                    {running && (
                      <span className="flex items-center gap-1 text-subtle">
                        <Clock className="w-3 h-3" /> {total - processed} restantes
                      </span>
                    )}
                  </div>
                  {running && (
                    <div className="space-y-1">
                      {entries.filter(e => e.status === 'importing').map((e, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <Loader2 className="w-3 h-3 text-sigma-500 animate-spin flex-shrink-0" />
                          <span className="text-sigma-700 dark:text-sigma-300 font-medium truncate">{e.name}</span>
                          <span className="text-subtle flex-shrink-0">
                            {e.step === 'creating' ? '— criando...' : e.step === 'uploading' ? '— upload...' : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* File list */}
              <div className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                {entries.map((entry, i) => (
                  <div key={i}
                    className={`flex items-center gap-3 px-4 py-2.5 text-sm border-b last:border-0 transition-colors
                      ${entry.status === 'importing' ? 'bg-sigma-50 dark:bg-sigma-900/30 border-sigma-100 dark:border-sigma-900' :
                        entry.status === 'done'      ? 'bg-green-50/60 dark:bg-green-900/10' :
                        entry.status === 'error'     ? 'bg-red-50/60 dark:bg-red-900/10' :
                        'border-gray-50 dark:border-gray-800'}`}>
                    <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
                      {entry.status === 'pending'   && <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" />}
                      {entry.status === 'importing' && <Loader2 className="w-4 h-4 text-sigma-500 animate-spin" />}
                      {entry.status === 'done'      && <CheckCircle className="w-4 h-4 text-green-500" />}
                      {entry.status === 'error'     && <XCircle className="w-4 h-4 text-red-500" />}
                    </div>
                    <div className="w-8 h-8 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0">
                      <img src={entry.previewUrl} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold truncate text-xs ${
                        entry.status === 'done'      ? 'text-green-700 dark:text-green-300' :
                        entry.status === 'error'     ? 'text-red-700 dark:text-red-300' :
                        entry.status === 'importing' ? 'text-sigma-700 dark:text-sigma-300' : 'text-title'}`}>
                        {entry.name}
                      </p>
                      <p className="text-[10px] text-subtle truncate">
                        {entry.status === 'importing' && entry.step === 'creating' && 'Criando registro...'}
                        {entry.status === 'importing' && entry.step === 'uploading' && 'Enviando foto...'}
                        {entry.status === 'pending'   && entry.file.name}
                        {entry.status === 'done'      && 'Importado'}
                        {entry.status === 'error'     && (entry.error ?? 'Erro')}
                      </p>
                    </div>
                    {entry.status !== 'pending' && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                        entry.status === 'importing' ? 'bg-sigma-100 dark:bg-sigma-900/50 text-sigma-600' :
                        entry.status === 'done'      ? 'bg-green-100 dark:bg-green-900/50 text-green-600' :
                        'bg-red-100 dark:bg-red-900/50 text-red-600'}`}>
                        {entry.status === 'importing' ? (entry.step === 'uploading' ? 'Upload' : 'Criando') :
                         entry.status === 'done'      ? 'OK' : 'Erro'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Large batch warning */}
          {!running && !done && total > 1000 && (
            <div className="flex items-start gap-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-3">
              <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-700 dark:text-yellow-400">
                <strong>{total.toLocaleString()} imagens</strong> detectadas. O processo levará aproximadamente{' '}
                <strong>~{Math.round(total / CONCURRENCY_BULK * 0.8 / 60)} minutos</strong>.
                Mantenha esta aba aberta durante a importação.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center flex-shrink-0">
          <button onClick={!running ? onClose : undefined} disabled={running}
            className="px-4 py-2 text-sm font-medium text-body border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-40">
            {done ? 'Fechar' : 'Cancelar'}
          </button>

          {!done ? (
            <button onClick={handleImport} disabled={total === 0 || running || scanning}
              className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-sigma-600 hover:bg-sigma-700 rounded-xl transition-colors disabled:opacity-50 shadow-lg shadow-sigma-600/20">
              {running
                ? <><Loader2 className="w-4 h-4 animate-spin" /> {processed.toLocaleString()}/{total.toLocaleString()}</>
                : <><FolderInput className="w-4 h-4" /> Importar {total > 0 ? `${total.toLocaleString()} fotos` : 'Fotos'}</>}
            </button>
          ) : (
            <button onClick={handlePickFolder}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-sigma-600 border border-sigma-200 dark:border-sigma-800 hover:bg-sigma-50 dark:hover:bg-sigma-900/30 rounded-xl transition-colors">
              <FolderOpen className="w-4 h-4" /> Importar outra pasta
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
