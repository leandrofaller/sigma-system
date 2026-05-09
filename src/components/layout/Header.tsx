'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Bell, Search, Sun, Moon, User } from 'lucide-react';
import type { SessionUser } from '@/types';
import { formatDate } from '@/lib/utils';
import { useTheme } from '@/components/providers/ThemeProvider';

interface HeaderProps {
  user: SessionUser;
}

export function Header({ user }: HeaderProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const { theme, toggleTheme } = useTheme();

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

        <button className="relative p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>

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
