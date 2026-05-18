'use client';

import { useState, useRef, useCallback } from 'react';
import { X, FolderOpen, CheckCircle, XCircle, Loader2, ImageIcon, AlertTriangle, FolderInput } from 'lucide-react';
import type { Apenado } from './ApenadoCard';

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp']);

function fileToName(file: File): string {
  // Strip extension, replace separators with space, uppercase
  const base = file.name.replace(/\.[^.]+$/, '').trim();
  return base.replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').toUpperCase();
}

type FileStatus = 'pending' | 'importing' | 'done' | 'error';

interface FileEntry {
  file: File;
  name: string;
  status: FileStatus;
  error?: string;
  apenado?: Apenado;
}

interface Props {
  onClose: () => void;
  onImported: (apenados: Apenado[]) => void;
}

const CONCURRENCY = 3;

export function ImportarPastaModal({ onClose, onImported }: Props) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [dragging, setDragging] = useState(false);
  const folderRef = useRef<HTMLInputElement>(null);

  const loadFiles = useCallback((fileList: FileList | null) => {
    if (!fileList) return;
    const imgs: FileEntry[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      if (IMAGE_EXTS.has(ext)) {
        imgs.push({ file: f, name: fileToName(f), status: 'pending' });
      }
    }
    imgs.sort((a, b) => a.name.localeCompare(b.name));
    setEntries(imgs);
    setDone(false);
  }, []);

  const updateEntry = (idx: number, patch: Partial<FileEntry>) =>
    setEntries((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });

  const importOne = async (idx: number, entry: FileEntry): Promise<Apenado | null> => {
    updateEntry(idx, { status: 'importing' });
    try {
      // 1. Create record
      const res = await fetch('/api/apenados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: entry.name }),
      });
      if (!res.ok) throw new Error('Erro ao criar registro');
      const apenado: Apenado = await res.json();

      // 2. Upload photo
      const fd = new FormData();
      fd.append('foto', entry.file);
      const photoRes = await fetch(`/api/apenados/${apenado.id}/foto`, { method: 'POST', body: fd });
      if (photoRes.ok) apenado.photoPath = `uploads/apenados/${apenado.id}.jpg`;

      updateEntry(idx, { status: 'done', apenado });
      return apenado;
    } catch (e: any) {
      updateEntry(idx, { status: 'error', error: e.message });
      return null;
    }
  };

  const handleImport = async () => {
    if (running || entries.length === 0) return;
    setRunning(true);

    const created: Apenado[] = [];
    // Process in batches of CONCURRENCY
    for (let i = 0; i < entries.length; i += CONCURRENCY) {
      const batch = entries.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map((e, j) => importOne(i + j, e)));
      results.forEach((r) => { if (r) created.push(r); });
    }

    setRunning(false);
    setDone(true);
    if (created.length > 0) onImported(created);
  };

  const total = entries.length;
  const doneCount = entries.filter((e) => e.status === 'done').length;
  const errorCount = entries.filter((e) => e.status === 'error').length;
  const progress = total > 0 ? Math.round(((doneCount + errorCount) / total) * 100) : 0;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    // DataTransferItemList for folder drops
    const items = e.dataTransfer.items;
    if (items) {
      const files = e.dataTransfer.files;
      if (files.length > 0) loadFiles(files);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={!running ? onClose : undefined} />

      <div className="relative z-10 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="gradient-sigma px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
              <FolderInput className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm">Importar Pasta de Fotos</p>
              <p className="text-white/70 text-xs">Nome do arquivo = nome do apenado</p>
            </div>
          </div>
          {!running && (
            <button onClick={onClose} className="text-white/70 hover:text-white transition-colors p-1">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Drop zone / file selector */}
          {!running && entries.length === 0 && (
            <div
              className={`rounded-xl border-2 border-dashed transition-all cursor-pointer p-10 flex flex-col items-center gap-4 text-center
                ${dragging
                  ? 'border-sigma-400 bg-sigma-50 dark:bg-sigma-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-sigma-300 dark:hover:border-sigma-700 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }`}
              onClick={() => folderRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <div className="w-16 h-16 bg-sigma-50 dark:bg-sigma-900/30 rounded-2xl flex items-center justify-center">
                <FolderOpen className="w-8 h-8 text-sigma-500" />
              </div>
              <div>
                <p className="text-base font-semibold text-title">Selecionar pasta de fotos</p>
                <p className="text-sm text-subtle mt-1">Clique para escolher uma pasta ou arraste os arquivos aqui</p>
                <p className="text-xs text-subtle mt-2 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full inline-block">
                  JPG · JPEG · PNG · WebP
                </p>
              </div>
            </div>
          )}

          {/* Hidden folder input */}
          <input
            ref={folderRef}
            type="file"
            className="hidden"
            multiple
            accept="image/*"
            // @ts-ignore — webkitdirectory not in React types
            webkitdirectory=""
            onChange={(e) => loadFiles(e.target.files)}
          />

          {/* File list */}
          {entries.length > 0 && (
            <>
              {/* Summary bar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-title">
                    <ImageIcon className="w-4 h-4 text-sigma-500" />
                    {total} {total === 1 ? 'imagem' : 'imagens'} encontradas
                  </span>
                  {!running && !done && (
                    <button
                      onClick={() => { setEntries([]); }}
                      className="text-xs text-subtle hover:text-red-500 transition-colors"
                    >
                      Limpar
                    </button>
                  )}
                </div>
                {done && (
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-green-600 dark:text-green-400">{doneCount} importados</span>
                    {errorCount > 0 && (
                      <span className="text-red-500 ml-2 flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5" />{errorCount} erros
                      </span>
                    )}
                  </span>
                )}
              </div>

              {/* Progress bar */}
              {(running || done) && (
                <div className="space-y-1.5">
                  <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${done && errorCount === 0 ? 'bg-green-500' : 'bg-sigma-600'}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-subtle text-right">
                    {doneCount + errorCount} / {total} ({progress}%)
                  </p>
                </div>
              )}

              {/* File entries list */}
              <div className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden divide-y divide-gray-50 dark:divide-gray-800 max-h-72 overflow-y-auto">
                {entries.map((entry, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    {/* Status icon */}
                    <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                      {entry.status === 'pending' && <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" />}
                      {entry.status === 'importing' && <Loader2 className="w-4 h-4 text-sigma-500 animate-spin" />}
                      {entry.status === 'done' && <CheckCircle className="w-4 h-4 text-green-500" />}
                      {entry.status === 'error' && <XCircle className="w-4 h-4 text-red-500" />}
                    </div>

                    {/* Thumbnail preview */}
                    <div className="w-8 h-8 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0">
                      <img
                        src={URL.createObjectURL(entry.file)}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Name info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-title truncate text-xs">{entry.name}</p>
                      <p className="text-[10px] text-subtle truncate">{entry.file.name}</p>
                    </div>

                    {/* Error */}
                    {entry.error && (
                      <span className="text-[10px] text-red-500 flex-shrink-0">{entry.error}</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Warning for large sets */}
              {total > 50 && !running && !done && (
                <div className="flex items-start gap-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-3">
                  <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-700 dark:text-yellow-400">
                    <strong>{total} imagens</strong> serão importadas em paralelo (3 por vez). O processo pode demorar alguns minutos.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center flex-shrink-0">
          <button onClick={!running ? onClose : undefined} disabled={running}
            className="px-4 py-2 text-sm font-medium text-body border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-40">
            {done ? 'Fechar' : 'Cancelar'}
          </button>

          {!done ? (
            <button
              onClick={handleImport}
              disabled={entries.length === 0 || running}
              className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-sigma-600 hover:bg-sigma-700 rounded-xl transition-colors disabled:opacity-50 shadow-lg shadow-sigma-600/20"
            >
              {running
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Importando {doneCount + errorCount}/{total}...</>
                : <><FolderInput className="w-4 h-4" /> Importar {total > 0 ? `${total} fotos` : 'Fotos'}</>
              }
            </button>
          ) : (
            <button
              onClick={() => { setEntries([]); setDone(false); }}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-sigma-600 border border-sigma-200 dark:border-sigma-800 hover:bg-sigma-50 dark:hover:bg-sigma-900/30 rounded-xl transition-colors"
            >
              <FolderOpen className="w-4 h-4" /> Importar outra pasta
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
