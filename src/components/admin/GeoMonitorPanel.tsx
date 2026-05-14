'use client';

import dynamic from 'next/dynamic';
import { useState, useMemo, useEffect } from 'react';
import { MapPin, Users, Clock, Download, Layers, Activity, Loader2, Wifi } from 'lucide-react';
import type { LocationEntry, TileStyle } from './GeoMap';
import { TILE_LAYERS } from './GeoMap';

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

interface OnlineUser {
  id: string;
  name: string;
  email: string;
  lastSeenAt: string;
}

interface Props {
  locations: LocationEntry[];
  allUsers: { id: string; name: string; email: string }[];
  onlineUsers: OnlineUser[];
}

export function GeoMonitorPanel({ locations, allUsers, onlineUsers }: Props) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tileStyle, setTileStyle] = useState<TileStyle>('standard');
  const [userTrail, setUserTrail] = useState<LocationEntry[] | null>(null);
  const [trailLoading, setTrailLoading] = useState(false);

  const onlineIds = useMemo(() => new Set(onlineUsers.map((u) => u.id)), [onlineUsers]);

  // Fetch the 4-hour trail whenever a user is selected
  useEffect(() => {
    if (!selectedUserId) {
      setUserTrail(null);
      return;
    }
    setTrailLoading(true);
    const since = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    fetch(`/api/geolocation?userId=${selectedUserId}&since=${encodeURIComponent(since)}`)
      .then((r) => r.json())
      .then((data: LocationEntry[]) => {
        setUserTrail(data);
        setTrailLoading(false);
      })
      .catch(() => setTrailLoading(false));
  }, [selectedUserId]);

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

  // Table shows the raw trail when a user is selected (all points, not bucketed)
  const tableRows = selectedUserId
    ? (userTrail ?? locations.filter((l) => l.userId === selectedUserId))
    : locations;

  const trackedToday = useMemo(() => {
    const since = Date.now() - 86400000;
    return new Set(locations.filter((l) => new Date(l.timestamp).getTime() > since).map((l) => l.userId)).size;
  }, [locations]);

  const activeNow = useMemo(() => {
    const since = Date.now() - 10 * 60 * 1000;
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

  const selectedUserName = allUsers.find((u) => u.id === selectedUserId)?.name;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Wifi,     label: 'Logados agora',         value: onlineUsers.length, highlight: true },
          { icon: Activity, label: 'Ativos agora (10 min)', value: activeNow,           highlight: false },
          { icon: Clock,    label: 'Ativos nas últimas 24h', value: trackedToday,       highlight: false },
          { icon: MapPin,   label: 'Registros totais',      value: locations.length,   highlight: false },
        ].map(({ icon: Icon, label, value, highlight }) => (
          <div key={label} className="card p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${highlight ? 'icon-badge-green' : 'icon-badge-sigma'}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-subtle">{label}</p>
              <p className="text-xl font-bold text-title">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Online users strip */}
      {onlineUsers.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
            </span>
            <p className="text-xs font-bold text-subtle uppercase tracking-wider">
              Usuários logados agora ({onlineUsers.length})
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {onlineUsers.map((u) => (
              <button
                key={u.id}
                onClick={() => setSelectedUserId(u.id === selectedUserId ? null : u.id)}
                title={`${u.email} — visto ${relTime(u.lastSeenAt)}`}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  selectedUserId === u.id
                    ? 'bg-green-600 border-green-500 text-white shadow-md shadow-green-600/20'
                    : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                {u.name}
                <span className="text-[10px] opacity-70 font-normal">{relTime(u.lastSeenAt)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

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
                  {onlineIds.has(u.id) ? (
                    <span className="relative flex h-2 w-2 flex-shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                    </span>
                  ) : (
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor(u.lastLoc?.timestamp)}`} />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{u.name}</p>
                    <p className="text-xs text-subtle truncate">
                      {onlineIds.has(u.id) ? 'online agora' : (u.lastLoc ? relTime(u.lastLoc.timestamp) : 'Sem dados')}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Map */}
        <div className="card overflow-hidden flex flex-col" style={{ height: 460 }}>
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
            <Layers className="w-3.5 h-3.5 text-subtle flex-shrink-0" />
            <div className="flex items-center gap-1 flex-wrap flex-1">
              {(Object.entries(TILE_LAYERS) as [TileStyle, typeof TILE_LAYERS[TileStyle]][]).map(([key, layer]) => (
                <button
                  key={key}
                  onClick={() => setTileStyle(key)}
                  className={`text-xs px-2.5 py-1 rounded-lg transition-colors font-medium ${
                    tileStyle === key
                      ? 'bg-sigma-500 text-white'
                      : 'text-subtle hover:text-body hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  {layer.label.split(' (')[0]}
                </button>
              ))}
            </div>
            {selectedUserId && (
              <div className="flex items-center gap-1.5 text-xs text-subtle flex-shrink-0">
                {trailLoading
                  ? <><Loader2 className="w-3 h-3 animate-spin" /> Carregando trilha…</>
                  : <><span className="w-2 h-2 rounded-full bg-sigma-500 inline-block" /> Trilha 4h — intervalos 10 min</>
                }
              </div>
            )}
          </div>
          <div className="flex-1 min-h-0">
            <GeoMap
              locations={locations}
              userTrail={userTrail}
              selectedUserId={selectedUserId}
              tileStyle={tileStyle}
            />
          </div>
        </div>
      </div>

      {/* History table */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <span className="text-sm font-semibold text-title">
            Histórico {selectedUserId ? `— ${selectedUserName}` : '(todos)'}
            <span className="ml-2 text-xs font-normal text-subtle">
              {trailLoading ? 'carregando…' : `${tableRows.length} registros`}
            </span>
          </span>
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
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
              {tableRows.slice(0, 200).map((loc) => (
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
              {tableRows.length === 0 && !trailLoading && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-subtle text-sm">Nenhum dado de localização registrado ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
