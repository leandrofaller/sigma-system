'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { JobProgress } from '@/lib/indexing-job';

interface IndexingContextValue {
  isIndexing: boolean;
  progress: JobProgress;
  indexError: string;
  startIndexing: () => Promise<void>;
  stopIndexing: () => void;
}

const defaultProgress: JobProgress = {
  current: 0, total: 0, faces: 0, skipped: 0, errors: 0, startTime: 0,
};

const IndexingContext = createContext<IndexingContextValue | null>(null);

export function useIndexing() {
  const ctx = useContext(IndexingContext);
  if (!ctx) throw new Error('useIndexing must be used within IndexingProvider');
  return ctx;
}

export function IndexingProvider({ children }: { children: ReactNode }) {
  const [isIndexing, setIsIndexing] = useState(false);
  const [progress, setProgress] = useState<JobProgress>(defaultProgress);
  const [indexError, setIndexError] = useState('');

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/apenados/face/job');
      if (!res.ok) return;
      const data = await res.json();
      setIsIndexing(data.isRunning ?? false);
      setProgress(data.progress ?? defaultProgress);
      setIndexError(data.error ?? '');
    } catch {}
  }, []);

  // Poll imediato no mount para detectar job em andamento (ex: após login)
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
      const res = await fetch('/api/apenados/face/job', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        setIndexError(data.error || 'Erro ao iniciar indexação');
        return;
      }
      const data = await res.json();
      setIsIndexing(data.isRunning ?? true);
      setProgress(data.progress ?? defaultProgress);
      setIndexError('');
    } catch (err: any) {
      setIndexError(err.message || 'Erro ao iniciar indexação');
    }
  }, []);

  const stopIndexing = useCallback(async () => {
    try {
      await fetch('/api/apenados/face/job', { method: 'DELETE' });
    } catch {}
  }, []);

  return (
    <IndexingContext.Provider value={{ isIndexing, progress, indexError, startIndexing, stopIndexing }}>
      {children}
    </IndexingContext.Provider>
  );
}
