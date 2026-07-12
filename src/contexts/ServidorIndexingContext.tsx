'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { ServidorJobProgress } from '@/lib/servidores-indexing-job';

interface ServidorIndexingContextValue {
  isIndexing: boolean;
  timedOut: boolean;
  progress: ServidorJobProgress;
  indexError: string;
  startIndexing: (model?: 'buffalo' | 'antelope') => Promise<void>;
  stopIndexing: () => void;
}

const defaultProgress: ServidorJobProgress = {
  current: 0, total: 0, faces: 0, skipped: 0, errors: 0, startTime: 0,
};

const ServidorIndexingContext = createContext<ServidorIndexingContextValue | null>(null);

export function useServidorIndexing() {
  const ctx = useContext(ServidorIndexingContext);
  if (!ctx) throw new Error('useServidorIndexing must be used within ServidorIndexingProvider');
  return ctx;
}

export function ServidorIndexingProvider({ children }: { children: ReactNode }) {
  const [isIndexing, setIsIndexing] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [progress, setProgress] = useState<ServidorJobProgress>(defaultProgress);
  const [indexError, setIndexError] = useState('');

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/servidores/face/job');
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

  const startIndexing = useCallback(async (model: 'buffalo' | 'antelope' = 'buffalo') => {
    try {
      const res = await fetch('/api/servidores/face/job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
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
      await fetch('/api/servidores/face/job', { method: 'DELETE' });
    } catch {}
  }, []);

  return (
    <ServidorIndexingContext.Provider value={{ isIndexing, timedOut, progress, indexError, startIndexing, stopIndexing }}>
      {children}
    </ServidorIndexingContext.Provider>
  );
}
