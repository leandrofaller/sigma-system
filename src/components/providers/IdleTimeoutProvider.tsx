'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { signOut } from 'next-auth/react';
import { Clock, LogOut } from 'lucide-react';

const WARN_AT_MS    = 10 * 60 * 1000; // 10 min → show warning
const LOGOUT_AT_MS  = 12 * 60 * 1000; // 12 min → logout
const WARN_SECS     = 120;             // 2-min countdown
const LAST_ACTIVE_KEY = 'sigma_last_active';

const EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const;

export function IdleTimeoutProvider() {
  const [showWarning, setShowWarning] = useState(false);
  const [remaining, setRemaining] = useState(WARN_SECS);
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const mainCheckInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActiveRef = useRef<number>(0);

  const doLogout = useCallback(async () => {
    if (countdownInterval.current) clearInterval(countdownInterval.current);
    if (mainCheckInterval.current) clearInterval(mainCheckInterval.current);
    localStorage.removeItem(LAST_ACTIVE_KEY);
    await signOut({ redirect: false });
    window.location.href = '/login';
  }, []);

  // Atualiza o timestamp de atividade localmente e no localStorage (com throttle de 5s)
  const updateActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastActiveRef.current > 5000) { 
      lastActiveRef.current = now;
      try {
        localStorage.setItem(LAST_ACTIVE_KEY, now.toString());
      } catch (e) {
        console.error('Erro ao salvar lastActive no localStorage', e);
      }
    }
  }, []);

  // Compara o tempo atual com a última atividade gravada
  const checkActivity = useCallback(() => {
    const lastActiveStr = localStorage.getItem(LAST_ACTIVE_KEY);
    if (!lastActiveStr) {
      localStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString());
      return;
    }

    const lastActive = parseInt(lastActiveStr, 10);
    const elapsed = Date.now() - lastActive;

    if (elapsed >= LOGOUT_AT_MS) {
      doLogout();
    } else if (elapsed >= WARN_AT_MS) {
      if (!showWarning) {
        setShowWarning(true);
        // Calcula os segundos reais restantes com base no tempo decorrido
        const remainingSecs = Math.max(0, Math.floor((LOGOUT_AT_MS - elapsed) / 1000));
        setRemaining(remainingSecs);

        if (countdownInterval.current) clearInterval(countdownInterval.current);
        countdownInterval.current = setInterval(() => {
          const currentElapsed = Date.now() - parseInt(localStorage.getItem(LAST_ACTIVE_KEY) || '0', 10);
          const currentRemaining = Math.max(0, Math.floor((LOGOUT_AT_MS - currentElapsed) / 1000));
          
          setRemaining(currentRemaining);
          if (currentRemaining <= 0) {
            clearInterval(countdownInterval.current!);
            doLogout();
          }
        }, 1000);
      }
    } else {
      if (showWarning) {
        setShowWarning(false);
        if (countdownInterval.current) {
          clearInterval(countdownInterval.current);
          countdownInterval.current = null;
        }
      }
    }
  }, [doLogout, showWarning]);

  const resetTimers = useCallback(() => {
    const now = Date.now();
    lastActiveRef.current = now;
    try {
      localStorage.setItem(LAST_ACTIVE_KEY, now.toString());
    } catch (e) {}
    setShowWarning(false);
    if (countdownInterval.current) {
      clearInterval(countdownInterval.current);
      countdownInterval.current = null;
    }
  }, []);

  useEffect(() => {
    // Inicialização ao carregar a página
    const now = Date.now();
    lastActiveRef.current = now;
    
    // Verifica imediatamente na montagem do componente (ex: quando religa a máquina)
    checkActivity();

    // Roda verificação a cada 5 segundos para detectar suspensão ou abas em segundo plano
    mainCheckInterval.current = setInterval(checkActivity, 5000);

    const handleEvent = () => {
      updateActivity();
    };

    EVENTS.forEach((e) => window.addEventListener(e, handleEvent, { passive: true }));

    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, handleEvent));
      if (mainCheckInterval.current) clearInterval(mainCheckInterval.current);
      if (countdownInterval.current) clearInterval(countdownInterval.current);
    };
  }, [checkActivity, updateActivity]);

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
