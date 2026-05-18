'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { X, FolderOpen, CheckCircle, XCircle, Loader2, ImageIcon, AlertTriangle, FolderInput, Clock } from 'lucide-react';
import type { Apenado } from './ApenadoCard';

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp']);

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
  const [doneCount, setDoneCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const folderRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const clearEntries = useCallback(() => {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current = [];
    setEntries([]);
    setDone(false);
    setDoneCount(0);
    setErrorCount(0);
  }, []);

  const loadFiles = useCallback((fileList: FileList | null) => {
    if (!fileList) return;
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current = [];

    const imgs: FileEntry[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      if (!IMAGE_EXTS.has(ext)) continue;
      const previewUrl = URL.createObjectURL(f);
      previewUrlsRef.current.push(previewUrl);
      imgs.push({ file: f, name: fileToName(f), previewUrl, status: 'pending' });
    }
    imgs.sort((a, b) => a.name.localeCompare(b.name));
    setEntries(imgs);
    setDone(false);
    setDoneCount(0);
    setErrorCount(0);
  }, []);

  const importOne = useCallback(async (idx: number, entry: FileEntry): Promise<Apenado | null> => {
    setEntries((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], status: 'importing', step: 'creating' };
      return next;
    });

    try {
      const res = await fetch('/api/apenados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: entry.name }),
      });
      if (!res.ok) throw new Error('Falha ao criar registro');
      const apenado: Apenado = await res.json();

      setEntries((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], step: 'uploading' };
        return next;
      });

      const fd = new FormData();
      fd.append('foto', entry.file);
      const photoRes = await fetch(`/api/apenados/${apenado.id}/foto`, { method: 'POST', body: fd });
      if (photoRes.ok) apenado.photoPath = `uploads/apenados/${apenado.id}.jpg`;

      setEntries((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], status: 'done', step: undefined };
        return next;
      });
      setDoneCount((c) => c + 1);
      return apenado;
    } catch (e: any) {
      setEntries((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], status: 'error', step: undefined, error: e.message };
        return next;
      });
      setErrorCount((c) => c + 1);
      return null;
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (running || entries.length === 0) return;
    setRunning(true);

    const created: Apenado[] = [];
    const snapshot = entries.map((e, i) => ({ entry: e, idx: i }));

    for (let i = 0; i < snapshot.length; i += CONCURRENCY) {
      const batch = snapshot.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map(({ entry, idx }) => importOne(idx, entry)));
      results.forEach((r) => { if (r) created.push(r); });
    }

    setRunning(false);
    setDone(true);
    if (created.length > 0) onImported(created);
  }, [running, entries, importOne, onImported]);

  const total = entries.length;
  const processed = doneCount + errorCount;
  const progress = total > 0 ? Math.round((processed / total) * 100) : 0;
  const pending = total - processed - entries.filter(e => e.status === 'importing').length;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) loadFiles(e.dataTransfer.files);
  };

  const progressColor =
    done && errorCount === 0 ? 'bg-green-500' :
    done && doneCount === 0  ? 'bg-red-500' :
    done                     ? 'bg-orange-500' :
                               'bg-sigma-600';

  const progressBg =
    done && errorCount === 0 ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' :
    done && doneCount === 0  ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' :
    done                     ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800' :
                               'bg-sigma-50 dark:bg-sigma-900/20 border-sigma-200 dark:border-sigma-800';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={!running ? onClose : undefined} />

      <div className="relative z-10 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className={`px-6 py-4 flex items-center justify-between flex-shrink-0 transition-all duration-500 ${running ? 'gradient-sigma' : 'gradient-sigma'}`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
              {running
                ? <Loader2 className="w-5 h-5 text-white animate-spin" />
                : <FolderInput className="w-5 h-5 text-white" />}
            </div>
            <div>
              <p className="text-white font-bold text-sm">
                {running ? `Importando... ${progress}%` :
                 done    ? 'Importação concluída' :
                           'Importar Pasta de Fotos'}
              </p>
              <p className="text-white/70 text-xs">
                {running ? `${processed} de ${total} arquivos processados` :
                 done    ? `${doneCount} importados · ${errorCount} erros` :
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

        {/* Progress bar — always visible when running or done */}
        {(running || done) && (
          <div className="flex-shrink-0 px-0">
            <div className="h-1.5 bg-gray-100 dark:bg-gray-800">
              <div
                className={`h-full transition-all duration-500 ease-out ${progressColor}`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {/* Drop zone */}
          {entries.length === 0 && (
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
                <p className="text-sm text-subtle mt-1">
                  Clique para escolher uma pasta — todos os arquivos de imagem serão listados
                </p>
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
            {...{ webkitdirectory: '' } as any}
            onChange={(e) => loadFiles(e.target.files)}
          />

          {entries.length > 0 && (
            <>
              {/* Progress panel — prominent when running/done */}
              {(running || done) && (
                <div className={`rounded-xl border p-4 space-y-3 transition-all duration-300 ${progressBg}`}>
                  {/* Big progress bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-semibold mb-1">
                      <span className={
                        running ? 'text-sigma-700 dark:text-sigma-300' :
                        done && errorCount === 0 ? 'text-green-700 dark:text-green-300' :
                        'text-orange-700 dark:text-orange-300'
                      }>
                        {running ? 'Processando arquivos...' :
                         done && errorCount === 0 ? 'Todos importados com sucesso!' :
                         done && doneCount === 0 ? 'Nenhum arquivo importado' :
                         `${doneCount} de ${total} importados`}
                      </span>
                      <span className="text-2xl font-black tabular-nums text-title">{progress}%</span>
                    </div>
                    <div className="h-5 bg-white/60 dark:bg-black/20 rounded-full overflow-hidden shadow-inner">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ease-out ${progressColor} ${running ? 'relative overflow-hidden' : ''}`}
                        style={{ width: `${progress}%` }}
                      >
                        {running && (
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="flex gap-4 flex-wrap">
                    <div className="flex items-center gap-1.5 text-xs font-semibold">
                      <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                      <span className="text-green-700 dark:text-green-300">{doneCount} concluídos</span>
                    </div>
                    {errorCount > 0 && (
                      <div className="flex items-center gap-1.5 text-xs font-semibold">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                        <span className="text-red-700 dark:text-red-300">{errorCount} {errorCount === 1 ? 'erro' : 'erros'}</span>
                      </div>
                    )}
                    {running && entries.filter(e => e.status === 'importing').length > 0 && (
                      <div className="flex items-center gap-1.5 text-xs font-semibold">
                        <Loader2 className="w-2.5 h-2.5 animate-spin text-sigma-600" />
                        <span className="text-sigma-700 dark:text-sigma-300">
                          {entries.filter(e => e.status === 'importing').length} em andamento
                        </span>
                      </div>
                    )}
                    {running && pending > 0 && (
                      <div className="flex items-center gap-1.5 text-xs font-semibold">
                        <Clock className="w-2.5 h-2.5 text-gray-400" />
                        <span className="text-subtle">{pending} na fila</span>
                      </div>
                    )}
                  </div>

                  {/* Currently importing names */}
                  {running && (
                    <div className="space-y-1">
                      {entries.filter(e => e.status === 'importing').map((e, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <Loader2 className="w-3 h-3 text-sigma-500 animate-spin flex-shrink-0" />
                          <span className="text-sigma-700 dark:text-sigma-300 font-medium truncate">{e.name}</span>
                          <span className="text-subtle flex-shrink-0">
                            {e.step === 'creating' ? '— criando registro...' :
                             e.step === 'uploading' ? '— enviando foto...' : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Header bar above file list */}
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-title">
                  <ImageIcon className="w-4 h-4 text-sigma-500" />
                  {total} {total === 1 ? 'imagem encontrada' : 'imagens encontradas'}
                </span>
                {!running && !done && (
                  <button onClick={clearEntries}
                    className="text-xs text-subtle hover:text-red-500 transition-colors">
                    Limpar
                  </button>
                )}
              </div>

              {/* File list */}
              <div ref={listRef} className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                {entries.map((entry, i) => (
                  <div key={i}
                    className={`flex items-center gap-3 px-4 py-2.5 text-sm border-b last:border-0 transition-colors duration-300
                      ${entry.status === 'importing' ? 'bg-sigma-50 dark:bg-sigma-900/30 border-sigma-100 dark:border-sigma-900' :
                        entry.status === 'done'      ? 'bg-green-50/60 dark:bg-green-900/10 border-green-50 dark:border-green-900' :
                        entry.status === 'error'     ? 'bg-red-50/60 dark:bg-red-900/10 border-red-50 dark:border-red-900' :
                        'border-gray-50 dark:border-gray-800'
                      }`}>

                    {/* Status icon */}
                    <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                      {entry.status === 'pending'   && <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" />}
                      {entry.status === 'importing' && <Loader2 className="w-4 h-4 text-sigma-500 animate-spin" />}
                      {entry.status === 'done'      && <CheckCircle className="w-4 h-4 text-green-500" />}
                      {entry.status === 'error'     && <XCircle className="w-4 h-4 text-red-500" />}
                    </div>

                    {/* Thumbnail */}
                    <div className="w-8 h-8 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0">
                      <img src={entry.previewUrl} alt="" className="w-full h-full object-cover" />
                    </div>

                    {/* Name + step */}
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold truncate text-xs ${
                        entry.status === 'done'      ? 'text-green-700 dark:text-green-300' :
                        entry.status === 'error'     ? 'text-red-700 dark:text-red-300' :
                        entry.status === 'importing' ? 'text-sigma-700 dark:text-sigma-300' :
                        'text-title'
                      }`}>{entry.name}</p>
                      <p className="text-[10px] text-subtle truncate">
                        {entry.status === 'importing' && entry.step === 'creating' && 'Criando registro...'}
                        {entry.status === 'importing' && entry.step === 'uploading' && 'Enviando foto...'}
                        {entry.status === 'pending'   && entry.file.name}
                        {entry.status === 'done'      && 'Importado com sucesso'}
                        {entry.status === 'error'     && (entry.error || 'Erro desconhecido')}
                      </p>
                    </div>

                    {/* Status badge */}
                    {entry.status !== 'pending' && (
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                        entry.status === 'importing' ? 'bg-sigma-100 dark:bg-sigma-900/50 text-sigma-600 dark:text-sigma-400' :
                        entry.status === 'done'      ? 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400' :
                        'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400'
                      }`}>
                        {entry.status === 'importing' ? (entry.step === 'uploading' ? 'Upload' : 'Criando') :
                         entry.status === 'done'      ? 'OK' :
                         'Erro'}
                      </span>
                    )}
                  </div>
                ))}
              </div>

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
            <button onClick={handleImport} disabled={entries.length === 0 || running}
              className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-sigma-600 hover:bg-sigma-700 rounded-xl transition-colors disabled:opacity-50 shadow-lg shadow-sigma-600/20">
              {running
                ? <><Loader2 className="w-4 h-4 animate-spin" /> {processed}/{total} arquivos</>
                : <><FolderInput className="w-4 h-4" /> Importar {total > 0 ? `${total} fotos` : 'Fotos'}</>}
            </button>
          ) : (
            <button onClick={clearEntries}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-sigma-600 border border-sigma-200 dark:border-sigma-800 hover:bg-sigma-50 dark:hover:bg-sigma-900/30 rounded-xl transition-colors">
              <FolderOpen className="w-4 h-4" /> Importar outra pasta
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
