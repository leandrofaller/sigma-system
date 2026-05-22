'use client';

import { Database, Square, CheckCircle } from 'lucide-react';
import { useIndexing } from '@/contexts/IndexingContext';

function fmtTime(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '--';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function IndexingStatusFloat() {
  const { isIndexing, progress, indexError, stopIndexing } = useIndexing();

  const done = !isIndexing && progress.total > 0 && progress.current >= progress.total;
  if (!isIndexing && !done) return null;

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const elapsed = progress.startTime ? (Date.now() - progress.startTime) / 1000 : 0;
  const rate = elapsed > 0 && progress.current > 0 ? progress.current / elapsed : 0;
  const eta = rate > 0 && isIndexing ? (progress.total - progress.current) / rate : Infinity;

  return (
    <div className="fixed bottom-5 right-5 z-[60] w-80 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          {done ? (
            <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
          ) : (
            <Database className="w-4 h-4 text-sigma-600 animate-pulse flex-shrink-0" />
          )}
          <span className="text-sm font-semibold text-title">
            {done ? 'Indexação concluída!' : 'Indexando banco facial'}
          </span>
        </div>
        {isIndexing && (
          <button
            onClick={stopIndexing}
            title="Parar indexação"
            className="text-subtle hover:text-red-500 transition-colors p-0.5"
          >
            <Square className="w-3.5 h-3.5" fill="currentColor" />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-title tabular-nums">
            {progress.current.toLocaleString('pt-BR')} / {progress.total.toLocaleString('pt-BR')} fotos
          </span>
          <span className="font-bold text-sigma-600">{pct}%</span>
        </div>

        {/* Barra de progresso */}
        <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 rounded-full ${done ? 'bg-green-500' : 'bg-gradient-to-r from-sigma-500 to-sigma-700'}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 text-xs text-subtle">
          <span className="text-green-600 dark:text-green-400 font-medium">
            {progress.faces.toLocaleString('pt-BR')} detectados
          </span>
          <span>{progress.skipped.toLocaleString('pt-BR')} sem rosto</span>
          {progress.errors > 0 && (
            <span className="text-red-500">{progress.errors} erros</span>
          )}
        </div>

        {/* ETA ou erro */}
        {indexError ? (
          <p className="text-xs text-red-500">{indexError}</p>
        ) : isIndexing && rate > 0 ? (
          <p className="text-xs text-subtle">
            {rate.toFixed(1)} fotos/s · ETA {fmtTime(eta)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
