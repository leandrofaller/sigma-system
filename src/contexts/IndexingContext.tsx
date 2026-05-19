'use client';

import { createContext, useContext, useState, useRef, useCallback, type ReactNode } from 'react';

const BATCH_SIZE = 30;

export interface IndexProgress {
  current: number;
  total: number;
  faces: number;
  skipped: number;
  errors: number;
  startTime: number;
}

interface IndexingContextValue {
  isIndexing: boolean;
  progress: IndexProgress;
  indexError: string;
  startIndexing: () => Promise<void>;
  stopIndexing: () => void;
}

const IndexingContext = createContext<IndexingContextValue | null>(null);

export function useIndexing() {
  const ctx = useContext(IndexingContext);
  if (!ctx) throw new Error('useIndexing must be used within IndexingProvider');
  return ctx;
}

const defaultProgress: IndexProgress = {
  current: 0, total: 0, faces: 0, skipped: 0, errors: 0, startTime: 0,
};

export function IndexingProvider({ children }: { children: ReactNode }) {
  const [isIndexing, setIsIndexing] = useState(false);
  const [progress, setProgress] = useState<IndexProgress>(defaultProgress);
  const [indexError, setIndexError] = useState('');
  const stopRef = useRef(false);

  const stopIndexing = useCallback(() => {
    stopRef.current = true;
  }, []);

  const startIndexing = useCallback(async () => {
    if (isIndexing) return;
    setIsIndexing(true);
    setIndexError('');
    stopRef.current = false;

    let grandTotal = 0;
    const startTime = Date.now();

    try {
      const statusData = await (await fetch('/api/apenados/face/status')).json();
      grandTotal = statusData.remaining ?? 0;
    } catch {}

    setProgress({ current: 0, total: grandTotal, faces: 0, skipped: 0, errors: 0, startTime });

    let processed = 0;
    let totalFaces = 0;
    let totalErrors = 0;
    let totalSkipped = 0;

    while (!stopRef.current) {
      try {
        const idsRes = await fetch(`/api/apenados/face/unindexed?limit=${BATCH_SIZE}`);
        const { ids }: { ids: string[] } = await idsRes.json();
        if (ids.length === 0) break;

        const res = await fetch('/api/apenados/face/index-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids }),
        });
        const stats = await res.json();

        if (!res.ok) {
          setIndexError(stats.error || 'Erro na indexação');
          break;
        }

        processed += stats.processed ?? ids.length;
        totalFaces += stats.faces ?? 0;
        totalErrors += stats.errors ?? 0;
        totalSkipped += stats.skipped ?? 0;

        setProgress({
          current: processed,
          total: grandTotal,
          faces: totalFaces,
          skipped: totalSkipped,
          errors: totalErrors,
          startTime,
        });
      } catch (err: any) {
        setIndexError(err.message || 'Erro na requisição');
        break;
      }
    }

    setIsIndexing(false);
  }, [isIndexing]);

  return (
    <IndexingContext.Provider value={{ isIndexing, progress, indexError, startIndexing, stopIndexing }}>
      {children}
    </IndexingContext.Provider>
  );
}
