'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { VisitanteJobProgress } from '@/lib/visitantes-indexing-job';

interface VisitanteIndexingContextValue {
  isIndexing: boolean;
  timedOut: boolean;
  progress: VisitanteJobProgress;
  indexError: string;
  startIndexing: () => Promise<void>;
  stopIndexing: () => void;
}

const defaultProgress: VisitanteJobProgress = {
  current: 0, total: 0, faces: 0, skipped: 0, errors: 0, startTime: 0,
};

const VisitanteIndexingContext = createContext<VisitanteIndexingContextValue | null>(null);

export function useVisitanteIndexing() {
  const ctx = useContext(VisitanteIndexingContext);
  if (!ctx) throw new Error('useVisitanteIndexing must be used within VisitanteIndexingProvider');
  return ctx;
}

export function VisitanteIndexingProvider({ children }: { children: ReactNode }) {
  const [isIndexing, setIsIndexing] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [progress, setProgress] = useState<VisitanteJobProgress>(defaultProgress);
  const [indexError, setIndexError] = useState('');

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/visitantes/face/job');
      if (!res.ok) return;
      const data = await res.json();
      setIsIndexing(data.isRunning ?? false);
      setTimedOut(data.timedOut ?? false);
      setProgress(data.progress ?? defaultProgress);
      setIndexError(data.error ?? '');
    } catch {}
  }, []);

  // Poll imediato no mount
  useEffect(() => {
    poll();
  }, [poll]);

  // Poll a cada 2s quando rodando, a cada 30s quando ocioso
  useEffect(() => {
    const interval = setInterval(poll, isIndexing ? 2000 : 30000);
    return () => clearInterval(interval);
  }, [isIndexing, poll]);

  const startIndexing = useCallback(async () => {
    try {
      const res = await fetch('/api/visitantes/face/job', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        setIndexError(data.error || 'Erro ao iniciar indexação');
        return;
      }
      const data = await res.json();
      setIsIndexing(data.isRunning ?? true);
      setTimedOut(false);
      setProgress(data.progress ?? defaultProgress);
      setIndexError('');
    } catch (err: any) {
      setIndexError(err.message || 'Erro ao iniciar indexação');
    }
  }, []);

  const stopIndexing = useCallback(async () => {
    try {
      await fetch('/api/visitantes/face/job', { method: 'DELETE' });
    } catch {}
  }, []);

  return (
    <VisitanteIndexingContext.Provider value={{ isIndexing, timedOut, progress, indexError, startIndexing, stopIndexing }}>
      {children}
    </VisitanteIndexingContext.Provider>
  );
}
