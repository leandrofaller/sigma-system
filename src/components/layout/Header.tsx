'use client';

import { useState, useEffect } from 'react';
import { Bell, Search, MapPin } from 'lucide-react';
import type { SessionUser } from '@/types';
import { formatDate } from '@/lib/utils';

interface HeaderProps {
  user: SessionUser;
}

export function Header({ user }: HeaderProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Captura geolocalização ao logar
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
    <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="search"
            placeholder="Buscar RELINTs, usuários..."
            className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-sigma-400 focus:bg-white transition-all w-64"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right hidden sm:block">
          <p className="text-xs font-medium text-gray-700">{formatDate(currentTime)}</p>
          <p className="text-xs text-gray-400">
            {currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        <button className="relative p-2 rounded-xl hover:bg-gray-50 text-gray-500 hover:text-gray-700 transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        <div className="flex items-center gap-2 pl-4 border-l border-gray-100">
          <div className="w-8 h-8 bg-sigma-100 rounded-xl flex items-center justify-center text-sigma-600 text-sm font-bold">
            {user.name?.charAt(0).toUpperCase()}
          </div>
          <div className="hidden md:block">
            <p className="text-sm font-medium text-gray-900 leading-none">{user.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">{user.groupName || 'Sem grupo'}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
