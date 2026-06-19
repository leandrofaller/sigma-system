'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { signOut } from 'next-auth/react';
import { Clock, LogOut } from 'lucide-react';

const WARN_AT_MS    = 10 * 60 * 1000; // 10 min → show warning
const LOGOUT_AT_MS  = 12 * 60 * 1000; // 12 min → logout
const WARN_SECS     = 120;             // 2-min countdown

const EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const;

export function IdleTimeoutProvider() {
  const [showWarning, setShowWarning] = useState(false);
  const [remaining, setRemaining] = useState(WARN_SECS);
  const warnTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdown   = useRef<ReturnType<typeof setInterval> | null>(null);

  const doLogout = useCallback(async () => {
    await signOut({ redirect: false });
    window.location.href = '/login';
  }, []);

  const resetTimers = useCallback(() => {
    setShowWarning(false);
    setRemaining(WARN_SECS);

    if (warnTimer.current)   clearTimeout(warnTimer.current);
    if (logoutTimer.current) clearTimeout(logoutTimer.current);
    if (countdown.current)   clearInterval(countdown.current);

    warnTimer.current = setTimeout(() => {
      setShowWarning(true);
      setRemaining(WARN_SECS);
      countdown.current = setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) { clearInterval(countdown.current!); return 0; }
          return r - 1;
        });
      }, 1000);
    }, WARN_AT_MS);

    logoutTimer.current = setTimeout(doLogout, LOGOUT_AT_MS);
  }, [doLogout]);

  useEffect(() => {
    resetTimers();
    const handle = () => resetTimers();
    EVENTS.forEach((e) => window.addEventListener(e, handle, { passive: true }));
    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, handle));
      if (warnTimer.current)   clearTimeout(warnTimer.current);
      if (logoutTimer.current) clearTimeout(logoutTimer.current);
      if (countdown.current)   clearInterval(countdown.current);
    };
  }, [resetTimers]);

  if (!showWarning) return null;

  const min = Math.floor(remaining / 60);
  const sec = remaining % 60;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-yellow-200 dark:border-yellow-800 p-6 max-w-sm w-full space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-yellow-100 dark:bg-yellow-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
            <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
          </div>
          <div>
            <p className="font-bold text-title">Sessão prestes a expirar</p>
            <p className="text-xs text-subtle">Inatividade detectada</p>
          </div>
        </div>

        <p className="text-sm text-body">
          Você será desconectado por inatividade em{' '}
          <span className="font-bold text-yellow-600 dark:text-yellow-400 tabular-nums">
            {min}:{sec.toString().padStart(2, '0')}
          </span>
          .
        </p>

        <div className="flex gap-3 justify-end">
          <button
            onClick={doLogout}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-subtle border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" /> Sair agora
          </button>
          <button
            onClick={resetTimers}
            className="px-4 py-2 text-sm font-bold text-white bg-sigma-600 hover:bg-sigma-700 rounded-xl transition-colors"
          >
            Continuar sessão
          </button>
        </div>
      </div>
    </div>
  );
}
