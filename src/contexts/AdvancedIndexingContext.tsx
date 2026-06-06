'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export interface AdvancedJobProgress {
  current: number;
  total: number;
  faces: number;
  skipped: number;
  errors: number;
  startTime: number;
}

interface AdvancedIndexingContextValue {
  isIndexing: boolean;
  timedOut: boolean;
  progress: AdvancedJobProgress;
  indexError: string;
  startIndexing: () => Promise<void>;
  stopIndexing: () => void;
}

const defaultProgress: AdvancedJobProgress = {
  current: 0, total: 0, faces: 0, skipped: 0, errors: 0, startTime: 0,
};

const AdvancedIndexingContext = createContext<AdvancedIndexingContextValue | null>(null);

export function useAdvancedIndexing() {
  const ctx = useContext(AdvancedIndexingContext);
  if (!ctx) throw new Error('useAdvancedIndexing must be used within AdvancedIndexingProvider');
  return ctx;
}

export function AdvancedIndexingProvider({ children }: { children: ReactNode }) {
  const [isIndexing, setIsIndexing] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [progress, setProgress] = useState<AdvancedJobProgress>(defaultProgress);
  const [indexError, setIndexError] = useState('');

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/apenados/face/advanced-status');
      if (!res.ok) return;
      const data = await res.json();
      setIsIndexing(data.job?.isRunning ?? false);
      setTimedOut(data.job?.timedOut ?? false);
      setProgress(data.job?.progress ?? defaultProgress);
      setIndexError(data.job?.error ?? '');
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
      const res = await fetch('/api/apenados/face/advanced-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' })
      });
      if (!res.ok) {
        const data = await res.json();
        setIndexError(data.error || 'Erro ao iniciar indexação avançada');
        return;
      }
      setIsIndexing(true);
      setTimedOut(false);
      setIndexError('');
      poll();
    } catch (err: any) {
      setIndexError(err.message || 'Erro ao iniciar indexação avançada');
    }
  }, [poll]);

  const stopIndexing = useCallback(async () => {
    try {
      await fetch('/api/apenados/face/advanced-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' })
      });
      setIsIndexing(false);
      poll();
    } catch {}
  }, [poll]);

  return (
    <AdvancedIndexingContext.Provider value={{ isIndexing, timedOut, progress, indexError, startIndexing, stopIndexing }}>
      {children}
    </AdvancedIndexingContext.Provider>
  );
}
