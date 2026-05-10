'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Bell, Search, Sun, Moon, File, X, ChevronRight } from 'lucide-react';
import type { SessionUser } from '@/types';
import { formatDate } from '@/lib/utils';
import { useTheme } from '@/components/providers/ThemeProvider';

interface HeaderProps {
  user: SessionUser;
}

function relativeTime(d: string | Date) {
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 30) return `${days} dias atrás`;
  return formatDate(new Date(d));
}

export function Header({ user }: HeaderProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const { theme, toggleTheme } = useTheme();
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notifCount, setNotifCount] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        await fetch('/api/geolocation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }),
        });
      }, () => {}, { enableHighAccuracy: true, timeout: 10000 });
    }
  }, []);

  useEffect(() => {
    fetch('/api/received-relints')
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) return;
        setNotifications(data.slice(0, 10));
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
        setNotifCount(data.filter((n) => new Date(n.createdAt).getTime() > cutoff).length);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-16 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="search"
            placeholder="Buscar RELINTs, usuários..."
            className="pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-sigma-400 focus:bg-white dark:focus:bg-gray-700 transition-all w-64"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right hidden sm:block">
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{formatDate(currentTime)}</p>
          <p className="text-xs text-gray-400">
            {currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        <button
          onClick={toggleTheme}
          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        {/* Notification Bell */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => setNotifOpen((v) => !v)}
            className="relative p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            title="Notificações"
          >
            <Bell className="w-5 h-5" />
            {notifCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold px-0.5">
                {notifCount > 9 ? '9+' : notifCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-sigma-500" />
                  <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">Notificações</span>
                  {notifCount > 0 && (
                    <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full font-medium">{notifCount}</span>
                  )}
                </div>
                <button onClick={() => setNotifOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800">
                {notifications.length === 0 ? (
                  <div className="py-10 text-center">
                    <Bell className="w-8 h-8 text-gray-200 dark:text-gray-700 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">Nenhuma notificação</p>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <Link
                      key={n.id}
                      href="/relints-recebidos"
                      onClick={() => setNotifOpen(false)}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
                    >
                      <div className="w-8 h-8 bg-red-50 dark:bg-red-900/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                        <File className="w-4 h-4 text-red-500 dark:text-red-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{n.title}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {n.source} · {relativeTime(n.createdAt)}
                        </p>
                      </div>
                    </Link>
                  ))
                )}
              </div>

              <Link
                href="/relints-recebidos"
                onClick={() => setNotifOpen(false)}
                className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800 text-sm font-medium text-sigma-600 dark:text-sigma-400 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
              >
                <span>Ver todos os arquivos recebidos</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>

        <Link
          href="/perfil"
          className="flex items-center gap-2 pl-3 border-l border-gray-100 dark:border-gray-800 hover:opacity-80 transition-opacity"
        >
          <div className="w-8 h-8 bg-sigma-100 dark:bg-sigma-900/40 rounded-xl flex items-center justify-center text-sigma-600 dark:text-sigma-400 text-sm font-bold">
            {user.name?.charAt(0).toUpperCase()}
          </div>
          <div className="hidden md:block">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-none">{user.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">{user.groupName || 'Sem grupo'}</p>
          </div>
        </Link>
      </div>
    </header>
  );
}
