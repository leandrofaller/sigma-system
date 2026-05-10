'use client';

import dynamic from 'next/dynamic';
import { useState, useMemo } from 'react';
import { MapPin, Users, Clock, RefreshCw, Download } from 'lucide-react';
import type { LocationEntry } from './GeoMap';

const GeoMap = dynamic(() => import('./GeoMap'), { ssr: false, loading: () => (
  <div className="flex items-center justify-center h-full text-subtle text-sm">Carregando mapa...</div>
) });

interface UserSummary {
  id: string;
  name: string;
  email: string;
  lastLoc: LocationEntry | null;
}

function relTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function statusColor(ts: string | undefined): string {
  if (!ts) return 'bg-gray-300 dark:bg-gray-600';
  const h = (Date.now() - new Date(ts).getTime()) / 3600000;
  if (h < 1) return 'bg-green-500';
  if (h < 24) return 'bg-amber-500';
  return 'bg-red-500';
}

interface Props {
  locations: LocationEntry[];
  allUsers: { id: string; name: string; email: string }[];
}

export function GeoMonitorPanel({ locations, allUsers }: Props) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const latestByUser = useMemo(() => {
    const map = new Map<string, LocationEntry>();
    for (const loc of [...locations].reverse()) map.set(loc.userId, loc);
    return map;
  }, [locations]);

  const usersWithLoc: UserSummary[] = allUsers.map((u) => ({
    ...u,
    lastLoc: latestByUser.get(u.id) ?? null,
  }));

  const filteredUsers = usersWithLoc.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const tableRows = selectedUserId
    ? locations.filter((l) => l.userId === selectedUserId)
    : locations;

  const trackedToday = useMemo(() => {
    const since = Date.now() - 86400000;
    return new Set(locations.filter((l) => new Date(l.timestamp).getTime() > since).map((l) => l.userId)).size;
  }, [locations]);

  const exportCSV = () => {
    const rows = [['Usuário', 'Email', 'Data/Hora', 'Latitude', 'Longitude', 'Acurácia (m)', 'Endereço']];
    tableRows.forEach((l) => rows.push([
      l.user.name, l.user.email,
      new Date(l.timestamp).toLocaleString('pt-BR'),
      String(l.lat), String(l.lng),
      String(l.accuracy ?? ''), l.address ?? '',
    ]));
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `localizacoes_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: Users, label: 'Usuários rastreados', value: latestByUser.size },
          { icon: Clock, label: 'Ativos nas últimas 24h', value: trackedToday },
          { icon: MapPin, label: 'Registros totais', value: locations.length },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 icon-badge-sigma rounded-xl flex items-center justify-center flex-shrink-0">
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-subtle">{label}</p>
              <p className="text-xl font-bold text-title">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Main content */}
      <div className="grid lg:grid-cols-[260px_1fr] gap-4">
        {/* User list */}
        <div className="card p-4 flex flex-col gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar usuário..."
            className="w-full input-base px-3 py-2 text-sm"
          />
          <div className="space-y-1 overflow-y-auto max-h-[400px]">
            <button
              onClick={() => setSelectedUserId(null)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${!selectedUserId ? 'bg-sigma-50 dark:bg-sigma-900/20 text-sigma-700 dark:text-sigma-300 font-medium' : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-body'}`}
            >
              Todos os usuários
            </button>
            {filteredUsers.map((u) => (
              <button
                key={u.id}
                onClick={() => setSelectedUserId(u.id === selectedUserId ? null : u.id)}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${selectedUserId === u.id ? 'bg-sigma-50 dark:bg-sigma-900/20 text-sigma-700 dark:text-sigma-300' : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-body'}`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor(u.lastLoc?.timestamp)}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{u.name}</p>
                    <p className="text-xs text-subtle truncate">
                      {u.lastLoc ? relTime(u.lastLoc.timestamp) : 'Sem dados'}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Map */}
        <div className="card overflow-hidden" style={{ height: 420 }}>
          <GeoMap locations={locations} selectedUserId={selectedUserId} />
        </div>
      </div>

      {/* History table */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <span className="text-sm font-semibold text-title">
            Histórico {selectedUserId ? `— ${allUsers.find((u) => u.id === selectedUserId)?.name}` : '(todos)'}
            <span className="ml-2 text-xs font-normal text-subtle">{tableRows.length} registros</span>
          </span>
          <button onClick={exportCSV}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <Download className="w-3.5 h-3.5" /> Exportar CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                {['Usuário', 'Data / Hora', 'Latitude', 'Longitude', 'Acurácia', 'Endereço'].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-subtle uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.slice(0, 100).map((loc) => (
                <tr key={loc.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-body">{loc.user.name}</span>
                  </td>
                  <td className="px-4 py-2.5 text-subtle whitespace-nowrap">
                    {new Date(loc.timestamp).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-subtle">{loc.lat.toFixed(5)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-subtle">{loc.lng.toFixed(5)}</td>
                  <td className="px-4 py-2.5 text-subtle">{loc.accuracy ? `${loc.accuracy.toFixed(0)}m` : '—'}</td>
                  <td className="px-4 py-2.5 text-subtle text-xs max-w-xs truncate">{loc.address || '—'}</td>
                </tr>
              ))}
              {tableRows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-subtle text-sm">Nenhum dado de localização registrado ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
